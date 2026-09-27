import os
from datetime import date, datetime, time as dtime, timezone
from functools import wraps
from zoneinfo import ZoneInfo
import json
import io
import zipfile
import re

from flask import (
    Flask,
    request,
    jsonify,
    render_template,
    abort,
    Response,
    send_file
)
from flask import send_from_directory
from werkzeug.exceptions import HTTPException
from flask_sqlalchemy import SQLAlchemy


app = Flask(__name__)

# ============================================================
# Sicherheits-Konfiguration
# ============================================================
#
# Diese App hat KEINE Web-Oberfläche mehr, nur noch eine JSON-API
# unter /api/... . Die einzige "Anwendung" ist die installierte
# PWA auf deinem Handy. Zugriff auf die API ist nur mit einem
# gültigen Geräte-Token möglich (Authorization: Bearer <token>).
#
# Token erzeugen:
#   python3 -c "import secrets; print(secrets.token_hex(32))"
#
# und als Umgebungsvariable SERVICEPLAN_API_TOKEN setzen,
# z.B. in /etc/serviceplan.env

API_TOKEN = os.environ.get("SERVICEPLAN_API_TOKEN")

if not API_TOKEN:
    raise RuntimeError(
        "SERVICEPLAN_API_TOKEN ist nicht gesetzt. "
        "Erzeuge einen zufälligen Wert mit:\n"
        "  python3 -c \"import secrets; print(secrets.token_hex(32))\"\n"
        "und setze ihn als SERVICEPLAN_API_TOKEN=... "
        "(z.B. in /etc/serviceplan.env)."
    )

app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///serviceplan.db"
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["MAX_CONTENT_LENGTH"] = 50 * 1024 * 1024

db = SQLAlchemy(app)
UPLOAD_DIR = os.path.join(app.instance_path, "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)


# ============================================================
# Zeitzone (für den Import alter ServicePlan-Backups)
# ============================================================

GERMAN_TZ = ZoneInfo("Europe/Berlin")


def timestamp_to_date(timestamp):

    if not timestamp:
        return None

    return datetime.fromtimestamp(
        timestamp / 1000,
        tz=timezone.utc
    ).astimezone(
        GERMAN_TZ
    ).date()


def date_to_timestamp(value):

    if not value:
        return None

    dt = datetime.combine(
        value,
        dtime.min,
        tzinfo=GERMAN_TZ
    )

    return int(dt.timestamp() * 1000)


# ============================================================
# Datenbankmodelle
# ============================================================

class Vehicle(db.Model):

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    brand = db.Column(db.String(100))
    model = db.Column(db.String(100))
    engine = db.Column(db.String(100))
    year = db.Column(db.Integer)
    color = db.Column(db.String(50))
    license_plate = db.Column(db.String(20))
    mileage = db.Column(db.Integer)
    fin = db.Column(db.String(50))
    photo_attachment_id = db.Column(db.Integer, nullable=True)

    services = db.relationship(
        "Service",
        backref="vehicle",
        cascade="all, delete-orphan",
        order_by="Service.date.desc()"
    )

    notes = db.relationship(
        "Note",
        backref="vehicle",
        cascade="all, delete-orphan"
    )

    def to_dict(self, full=False):

        data = {
            "id": self.id,
            "name": self.name,
            "brand": self.brand,
            "model": self.model,
            "engine": self.engine,
            "year": self.year,
            "color": self.color,
            "license_plate": self.license_plate,
            "mileage": self.mileage,
            "fin": self.fin,
            "photo_attachment_id": self.photo_attachment_id
        }

        if full:
            data["services"] = [s.to_dict() for s in self.services]
            data["notes"] = [n.to_dict() for n in self.notes]
            data["attachments"] = [a.to_dict() for a in Attachment.query.filter_by(vehicle_id=self.id).order_by(Attachment.created_at.desc()).all()]

        return data


class Service(db.Model):

    id = db.Column(db.Integer, primary_key=True)
    vehicle_id = db.Column(
        db.Integer, db.ForeignKey("vehicle.id"), nullable=False
    )
    date = db.Column(db.Date, nullable=False)
    mileage = db.Column(db.Integer)
    service_type = db.Column(db.String(100))

    engine_oil = db.Column(db.Boolean, default=False)
    oil_filter = db.Column(db.Boolean, default=False)
    spark_plugs = db.Column(db.Boolean, default=False)
    air_filter = db.Column(db.Boolean, default=False)
    cabin_filter = db.Column(db.Boolean, default=False)
    timing_belt = db.Column(db.Boolean, default=False)
    brake_fluid = db.Column(db.Boolean, default=False)
    coolant = db.Column(db.Boolean, default=False)
    transmission_oil = db.Column(db.Boolean, default=False)

    workshop = db.Column(db.String(200))
    cost = db.Column(db.Numeric(10, 2))
    notes = db.Column(db.Text)

    next_service_mileage = db.Column(db.Integer)
    next_service_date = db.Column(db.Date)

    def to_dict(self):

        return {
            "id": self.id,
            "vehicle_id": self.vehicle_id,
            "date": self.date.isoformat() if self.date else None,
            "mileage": self.mileage,
            "service_type": self.service_type,
            "engine_oil": bool(self.engine_oil),
            "oil_filter": bool(self.oil_filter),
            "spark_plugs": bool(self.spark_plugs),
            "air_filter": bool(self.air_filter),
            "cabin_filter": bool(self.cabin_filter),
            "timing_belt": bool(self.timing_belt),
            "brake_fluid": bool(self.brake_fluid),
            "coolant": bool(self.coolant),
            "transmission_oil": bool(self.transmission_oil),
            "workshop": self.workshop,
            "cost": float(self.cost) if self.cost is not None else None,
            "notes": self.notes,
            "next_service_mileage": self.next_service_mileage,
            "next_service_date": (
                self.next_service_date.isoformat()
                if self.next_service_date else None
            )
        }


class Note(db.Model):

    id = db.Column(db.Integer, primary_key=True)
    vehicle_id = db.Column(
        db.Integer, db.ForeignKey("vehicle.id"), nullable=False
    )
    title = db.Column(db.String(200))
    content = db.Column(db.Text)

    def to_dict(self):

        return {
            "id": self.id,
            "vehicle_id": self.vehicle_id,
            "title": self.title,
            "content": self.content
        }


class Attachment(db.Model):

    id = db.Column(db.Integer, primary_key=True)
    vehicle_id = db.Column(db.Integer, db.ForeignKey("vehicle.id"), nullable=False, index=True)
    service_id = db.Column(db.Integer, db.ForeignKey("service.id"), nullable=True, index=True)
    note_id = db.Column(db.Integer, db.ForeignKey("note.id"), nullable=True, index=True)
    filename = db.Column(db.String(255), nullable=False)
    stored_filename = db.Column(db.String(255), nullable=False, unique=True)
    mime_type = db.Column(db.String(120), nullable=False)
    file_size = db.Column(db.Integer, nullable=False, default=0)
    is_vehicle_image = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            "id": self.id,
            "vehicle_id": self.vehicle_id,
            "service_id": self.service_id,
            "note_id": self.note_id,
            "filename": self.filename,
            "mime_type": self.mime_type,
            "file_size": self.file_size,
            "is_vehicle_image": bool(self.is_vehicle_image),
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "content_url": f"/api/attachments/{self.id}/content"
        }


# ============================================================
# Auth-Decorator für die API
# ============================================================

def require_token(view):

    @wraps(view)
    def wrapped(*args, **kwargs):

        auth_header = request.headers.get("Authorization", "")

        token = (
            auth_header[7:]
            if auth_header.startswith("Bearer ")
            else None
        )

        if not token or token != API_TOKEN:
            abort(401)

        return view(*args, **kwargs)

    return wrapped


@app.errorhandler(401)
def handle_unauthorized(error):
    return jsonify({"error": "Ungültiges oder fehlendes Token."}), 401


@app.errorhandler(404)
def handle_not_found(error):
    return jsonify({"error": "Nicht gefunden."}), 404


@app.errorhandler(400)
def handle_bad_request(error):
    return jsonify({"error": "Ungültige Anfrage."}), 400


@app.errorhandler(Exception)
def handle_unexpected_error(error):

    # Reguläre HTTP-Fehler (404, 401, ...) unverändert weiterreichen,
    # nur echte, unerwartete Fehler abfangen und als JSON 500 melden.
    if isinstance(error, HTTPException):
        return error

    db.session.rollback()

    app.logger.exception("Unerwarteter Fehler")

    return jsonify({"error": "Interner Serverfehler."}), 500


@app.route("/service-worker.js")
def service_worker():
    return send_from_directory(".", "service-worker.js", mimetype="application/javascript")

# ============================================================
# PWA-Shell (statische Seite, keine Nutzdaten enthalten)
# ============================================================

@app.route("/")
def index():
    return render_template("index.html")


# ============================================================
# API: Voller Datenabgleich
# ============================================================

@app.route("/api/sync")
@require_token
def api_sync():

    vehicles = Vehicle.query.order_by(Vehicle.name).all()

    return jsonify({
        "server_time": datetime.now(timezone.utc).isoformat(),
        "vehicles": [v.to_dict(full=True) for v in vehicles]
    })


# ============================================================
# API: Fahrzeuge
# ============================================================

VEHICLE_FIELDS = [
    "name", "brand", "model", "engine", "year",
    "color", "license_plate", "mileage", "fin", "photo_attachment_id"
]


@app.route("/api/vehicles", methods=["POST"])
@require_token
def api_create_vehicle():

    data = request.get_json(force=True, silent=True) or {}

    if not data.get("name"):
        return jsonify({"error": "Name ist erforderlich."}), 400

    vehicle = Vehicle(**{
        field: data.get(field) for field in VEHICLE_FIELDS
    })

    db.session.add(vehicle)
    db.session.commit()

    return jsonify(vehicle.to_dict()), 201


@app.route("/api/vehicles/<int:vehicle_id>", methods=["PUT"])
@require_token
def api_update_vehicle(vehicle_id):

    vehicle = db.get_or_404(Vehicle, vehicle_id)
    data = request.get_json(force=True, silent=True) or {}

    for field in VEHICLE_FIELDS:
        if field in data:
            setattr(vehicle, field, data[field])

    db.session.commit()

    return jsonify(vehicle.to_dict())


@app.route("/api/vehicles/<int:vehicle_id>", methods=["DELETE"])
@require_token
def api_delete_vehicle(vehicle_id):

    vehicle = db.get_or_404(Vehicle, vehicle_id)

    for attachment in Attachment.query.filter_by(vehicle_id=vehicle.id).all():
        path = _attachment_path(attachment)
        db.session.delete(attachment)
        try:
            if os.path.isfile(path):
                os.remove(path)
        except OSError:
            pass

    db.session.delete(vehicle)
    db.session.commit()

    return "", 204


# ============================================================
# API: Wartungen
# ============================================================

SERVICE_BOOL_FIELDS = [
    "engine_oil", "oil_filter", "spark_plugs", "air_filter",
    "cabin_filter", "timing_belt", "brake_fluid", "coolant",
    "transmission_oil"
]


def apply_service_fields(service, data):

    if "date" in data and data["date"]:
        service.date = date.fromisoformat(data["date"])

    if "mileage" in data:
        service.mileage = data["mileage"]

    if "service_type" in data:
        service.service_type = data["service_type"]

    for field in SERVICE_BOOL_FIELDS:
        if field in data:
            setattr(service, field, bool(data[field]))

    if "workshop" in data:
        service.workshop = data["workshop"]

    if "cost" in data:
        service.cost = data["cost"]

    if "notes" in data:
        service.notes = data["notes"]

    if "next_service_mileage" in data:
        service.next_service_mileage = data["next_service_mileage"]

    if "next_service_date" in data:
        service.next_service_date = (
            date.fromisoformat(data["next_service_date"])
            if data["next_service_date"] else None
        )


def bump_vehicle_mileage(vehicle, mileage):

    if mileage is None:
        return

    if vehicle.mileage is None or mileage > vehicle.mileage:
        vehicle.mileage = mileage


@app.route("/api/services", methods=["POST"])
@require_token
def api_create_service():

    data = request.get_json(force=True, silent=True) or {}

    vehicle = db.get_or_404(Vehicle, data.get("vehicle_id"))

    if not data.get("date"):
        return jsonify({"error": "Datum ist erforderlich."}), 400

    service = Service(
        vehicle_id=vehicle.id,
        date=date.fromisoformat(data["date"])
    )
    apply_service_fields(service, data)

    db.session.add(service)

    bump_vehicle_mileage(vehicle, service.mileage)

    db.session.commit()

    return jsonify(service.to_dict()), 201


@app.route("/api/services/<int:service_id>", methods=["PUT"])
@require_token
def api_update_service(service_id):

    service = db.get_or_404(Service, service_id)
    data = request.get_json(force=True, silent=True) or {}

    apply_service_fields(service, data)

    bump_vehicle_mileage(service.vehicle, service.mileage)

    db.session.commit()

    return jsonify(service.to_dict())


@app.route("/api/services/<int:service_id>", methods=["DELETE"])
@require_token
def api_delete_service(service_id):

    service = db.get_or_404(Service, service_id)

    Attachment.query.filter_by(service_id=service.id).update({"service_id": None}, synchronize_session=False)
    db.session.delete(service)
    db.session.commit()

    return "", 204


# ============================================================
# API: Notizen
# ============================================================

@app.route("/api/notes", methods=["POST"])
@require_token
def api_create_note():

    data = request.get_json(force=True, silent=True) or {}

    vehicle = db.get_or_404(Vehicle, data.get("vehicle_id"))

    note = Note(
        vehicle_id=vehicle.id,
        title=data.get("title"),
        content=data.get("content")
    )

    db.session.add(note)
    db.session.commit()

    return jsonify(note.to_dict()), 201


@app.route("/api/notes/<int:note_id>", methods=["PUT"])
@require_token
def api_update_note(note_id):

    note = db.get_or_404(Note, note_id)
    data = request.get_json(force=True, silent=True) or {}

    if "title" in data:
        note.title = data["title"]

    if "content" in data:
        note.content = data["content"]

    db.session.commit()

    return jsonify(note.to_dict())


@app.route("/api/notes/<int:note_id>", methods=["DELETE"])
@require_token
def api_delete_note(note_id):

    note = db.get_or_404(Note, note_id)

    Attachment.query.filter_by(note_id=note.id).update({"note_id": None}, synchronize_session=False)
    db.session.delete(note)
    db.session.commit()

    return "", 204


# ============================================================
# API: Bilder & Dokumente
# ============================================================

def _attachment_path(attachment):
    return os.path.join(UPLOAD_DIR, attachment.stored_filename)


def _safe_filename(filename):
    filename = os.path.basename(filename or "datei")
    return filename[:255] or "datei"


@app.route("/api/attachments", methods=["POST"])
@require_token
def api_create_attachment():
    file = request.files.get("file")
    if not file or not file.filename:
        return jsonify({"error": "Keine Datei übermittelt."}), 400

    vehicle_id = request.form.get("vehicle_id", type=int)
    service_id = request.form.get("service_id", type=int)
    note_id = request.form.get("note_id", type=int)
    is_vehicle_image = request.form.get("is_vehicle_image", "0").lower() in ("1", "true", "yes", "on")

    if not vehicle_id:
        return jsonify({"error": "vehicle_id ist erforderlich."}), 400
    vehicle = db.get_or_404(Vehicle, vehicle_id)

    if service_id:
        service = db.get_or_404(Service, service_id)
        if service.vehicle_id != vehicle.id:
            return jsonify({"error": "Wartung gehört nicht zu diesem Fahrzeug."}), 400
    if note_id:
        note = db.get_or_404(Note, note_id)
        if note.vehicle_id != vehicle.id:
            return jsonify({"error": "Notiz gehört nicht zu diesem Fahrzeug."}), 400

    import uuid
    stored_filename = f"{uuid.uuid4().hex}{os.path.splitext(file.filename)[1].lower()[:10]}"
    path = os.path.join(UPLOAD_DIR, stored_filename)
    file.save(path)
    size = os.path.getsize(path)

    attachment = Attachment(
        vehicle_id=vehicle.id,
        service_id=service_id,
        note_id=note_id,
        filename=_safe_filename(file.filename),
        stored_filename=stored_filename,
        mime_type=file.mimetype or "application/octet-stream",
        file_size=size,
        is_vehicle_image=is_vehicle_image
    )
    db.session.add(attachment)
    db.session.flush()

    if is_vehicle_image:
        if vehicle.photo_attachment_id and vehicle.photo_attachment_id != attachment.id:
            old = db.session.get(Attachment, vehicle.photo_attachment_id)
            if old:
                old.is_vehicle_image = False
        vehicle.photo_attachment_id = attachment.id

    db.session.commit()
    return jsonify(attachment.to_dict()), 201


@app.route("/api/attachments/<int:attachment_id>/content")
@require_token
def api_attachment_content(attachment_id):
    attachment = db.get_or_404(Attachment, attachment_id)
    path = _attachment_path(attachment)
    if not os.path.isfile(path):
        abort(404)
    return send_file(path, mimetype=attachment.mime_type, download_name=attachment.filename, conditional=True)


@app.route("/api/attachments/<int:attachment_id>", methods=["DELETE"])
@require_token
def api_delete_attachment(attachment_id):
    attachment = db.get_or_404(Attachment, attachment_id)
    vehicle = db.session.get(Vehicle, attachment.vehicle_id)
    if vehicle and vehicle.photo_attachment_id == attachment.id:
        vehicle.photo_attachment_id = None
    path = _attachment_path(attachment)
    db.session.delete(attachment)
    db.session.commit()
    try:
        if os.path.isfile(path):
            os.remove(path)
    except OSError:
        app.logger.warning("Datei konnte nicht gelöscht werden: %s", path)
    return "", 204


# ============================================================
# API: Backup Export / Import
# (gleiches JSON-Format wie im alten ServicePlan)
# ============================================================

@app.route("/api/backup/export")
@require_token
def api_export():
    """Exportiert alle ServicePlan-Daten inklusive aller Anhänge als ZIP."""
    vehicles_data = []
    for vehicle in Vehicle.query.order_by(Vehicle.id).all():
        vehicles_data.append({
            "id": str(vehicle.id),
            "name": vehicle.name,
            "marke": vehicle.brand,
            "modell": vehicle.model,
            "kmStand": vehicle.mileage,
            "baujahr": vehicle.year,
            "farbe": vehicle.color,
            "motor": vehicle.engine,
            "kennzeichen": vehicle.license_plate,
            "fin": vehicle.fin,
            "photoAttachmentId": str(vehicle.photo_attachment_id) if vehicle.photo_attachment_id is not None else None,
        })

    maintenances_data = []
    for service in Service.query.order_by(Service.id).all():
        maintenances_data.append({
            "id": str(service.id),
            "vehicleId": str(service.vehicle_id),
            "datum": date_to_timestamp(service.date),
            "kmStand": service.mileage,
            "serviceType": service.service_type,
            "workshop": service.workshop,
            "cost": float(service.cost) if service.cost is not None else None,
            "notes": service.notes,
            "nextServiceMileage": service.next_service_mileage,
            "nextServiceDate": service.next_service_date.isoformat() if service.next_service_date else None,
            "arbeiten": {
                "inspektion12Monate": service.service_type == "Inspektion",
                "inspektionMitZusatz": False,
                "oelwechsel": bool(service.engine_oil),
                "oelfilter": bool(service.oil_filter),
                "zuendkerzen": bool(service.spark_plugs),
                "luftfiltereinsatz": bool(service.air_filter),
                "innenraumfilter": bool(service.cabin_filter),
                "zahnriemenWechsel": bool(service.timing_belt),
                "bremsfluessigkeitWechsel": bool(service.brake_fluid),
                "kuehlmittel": bool(service.coolant),
                "getriebeoel": bool(service.transmission_oil)
            }
        })

    notes_data = []
    for note in Note.query.order_by(Note.id).all():
        notes_data.append({
            "id": str(note.id),
            "vehicleId": str(note.vehicle_id),
            "titel": note.title,
            "inhalt": note.content
        })

    attachments_data = []
    attachment_files = []
    for attachment in Attachment.query.order_by(Attachment.id).all():
        relative_path = f"attachments/{attachment.id}_{_safe_backup_filename(attachment.filename)}"
        attachments_data.append({
            "id": str(attachment.id),
            "vehicleId": str(attachment.vehicle_id),
            "serviceId": str(attachment.service_id) if attachment.service_id is not None else None,
            "noteId": str(attachment.note_id) if attachment.note_id is not None else None,
            "filename": attachment.filename,
            "mimeType": attachment.mime_type,
            "fileSize": attachment.file_size,
            "isVehicleImage": bool(attachment.is_vehicle_image),
            "createdAt": attachment.created_at.isoformat() if attachment.created_at else None,
            "path": relative_path,
        })
        path = _attachment_path(attachment)
        if os.path.isfile(path):
            attachment_files.append((relative_path, path))

    export_data = {
        "format": "serviceplan-backup",
        "version": "5.0",
        "exportedAt": datetime.now(timezone.utc).isoformat(),
        "vehicles": vehicles_data,
        "maintenances": maintenances_data,
        "notes": notes_data,
        "attachments": attachments_data,
    }

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("backup.json", json.dumps(export_data, ensure_ascii=False, indent=2).encode("utf-8"))
        for relative_path, source_path in attachment_files:
            zf.write(source_path, relative_path)

    buffer.seek(0)
    filename = f"ServicePlan_Backup_{date.today().isoformat()}.zip"
    return Response(
        buffer.getvalue(),
        mimetype="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


def _safe_backup_filename(filename):
    """Erzeugt einen sicheren Dateinamen für das ZIP-Innere."""
    name = os.path.basename(filename or "Datei")
    name = re.sub(r"[^A-Za-z0-9._ -]", "_", name).strip(" .")
    return name or "Datei"


@app.route("/api/backup/import", methods=["POST"])
@require_token
def api_import():
    """Importiert das von /api/backup/export erzeugte ZIP.

    JSON-Backups aus älteren Versionen werden weiterhin akzeptiert.
    """
    clear_existing_raw = request.form.get("clear_existing", "false").lower()
    clear_existing = clear_existing_raw in ("1", "true", "yes", "on")

    uploaded = request.files.get("file")
    data = None
    zip_file = None

    if uploaded:
        if not uploaded.filename.lower().endswith(".zip"):
            return jsonify({"error": "Bitte eine ServicePlan-ZIP-Datei auswählen."}), 400
        try:
            zip_file = zipfile.ZipFile(uploaded.stream)
            if "backup.json" not in zip_file.namelist():
                return jsonify({"error": "Ungültiges ServicePlan-ZIP: backup.json fehlt."}), 400
            data = json.loads(zip_file.read("backup.json").decode("utf-8"))
        except (zipfile.BadZipFile, json.JSONDecodeError, UnicodeDecodeError) as exc:
            return jsonify({"error": f"Ungültiges ServicePlan-ZIP: {exc}"}), 400
    else:
        data = request.get_json(force=True, silent=True)
        clear_existing = bool(data.get("clear_existing")) if isinstance(data, dict) else clear_existing

    if not isinstance(data, dict) or "vehicles" not in data:
        return jsonify({"error": "Ungültiges Backup-Format."}), 400

    if clear_existing:
        for attachment in Attachment.query.all():
            path = _attachment_path(attachment)
            db.session.delete(attachment)
            try:
                if os.path.isfile(path):
                    os.remove(path)
            except OSError:
                pass
        for vehicle in Vehicle.query.all():
            db.session.delete(vehicle)
        db.session.flush()

    vehicle_map = {}
    service_map = {}
    note_map = {}
    attachment_map = {}

    for old_vehicle in data.get("vehicles", []):
        old_id = str(old_vehicle.get("id"))
        vehicle = Vehicle(
            name=old_vehicle.get("name") or "Unbenannt",
            brand=old_vehicle.get("marke"),
            model=old_vehicle.get("modell"),
            engine=old_vehicle.get("motor"),
            year=old_vehicle.get("baujahr"),
            color=old_vehicle.get("farbe"),
            license_plate=old_vehicle.get("kennzeichen"),
            mileage=old_vehicle.get("kmStand"),
            fin=old_vehicle.get("fin")
        )
        db.session.add(vehicle)
        db.session.flush()
        vehicle_map[old_id] = vehicle.id

    for old_service in data.get("maintenances", []):
        new_vehicle_id = vehicle_map.get(str(old_service.get("vehicleId")))
        if not new_vehicle_id:
            continue
        works = old_service.get("arbeiten", {})
        service_type = "Inspektion" if (works.get("inspektion12Monate") or works.get("inspektionMitZusatz")) else None
        extra_work = old_service.get("weitereArbeiten") or ""
        if works.get("inspektionMitZusatz"):
            extra_text = "Inspektion mit Zusatzarbeiten"
            extra_work = extra_text + "\n" + extra_work if extra_work else extra_text
        if old_service.get("serviceType"):
            service_type = old_service.get("serviceType")
        service = Service(
            vehicle_id=new_vehicle_id,
            date=timestamp_to_date(old_service.get("datum")) or date.today(),
            mileage=old_service.get("kmStand"),
            service_type=service_type,
            engine_oil=works.get("oelwechsel", False),
            oil_filter=works.get("oelfilter", False),
            spark_plugs=works.get("zuendkerzen", False),
            air_filter=works.get("luftfiltereinsatz", False),
            cabin_filter=works.get("innenraumfilter", False),
            timing_belt=works.get("zahnriemenWechsel", False),
            brake_fluid=works.get("bremsfluessigkeitWechsel", False),
            coolant=works.get("kuehlmittel", False),
            transmission_oil=works.get("getriebeoel", False),
            workshop=old_service.get("workshop"),
            cost=old_service.get("cost"),
            notes=(old_service.get("notes") or extra_work or None),
            next_service_mileage=old_service.get("nextServiceMileage"),
            next_service_date=date.fromisoformat(old_service["nextServiceDate"]) if old_service.get("nextServiceDate") else None
        )
        db.session.add(service)
        db.session.flush()
        service_map[str(old_service.get("id"))] = service.id

    for old_note in data.get("notes", []):
        new_vehicle_id = vehicle_map.get(str(old_note.get("vehicleId")))
        if not new_vehicle_id:
            continue
        note = Note(vehicle_id=new_vehicle_id, title=old_note.get("titel"), content=old_note.get("inhalt"))
        db.session.add(note)
        db.session.flush()
        note_map[str(old_note.get("id"))] = note.id

    imported_attachments = 0
    for old_attachment in data.get("attachments", []):
        new_vehicle_id = vehicle_map.get(str(old_attachment.get("vehicleId")))
        if not new_vehicle_id:
            continue
        new_service_id = service_map.get(str(old_attachment.get("serviceId"))) if old_attachment.get("serviceId") is not None else None
        new_note_id = note_map.get(str(old_attachment.get("noteId"))) if old_attachment.get("noteId") is not None else None
        if old_attachment.get("serviceId") is not None and new_service_id is None:
            continue
        if old_attachment.get("noteId") is not None and new_note_id is None:
            continue

        stored_filename = f"{__import__('uuid').uuid4().hex}_{_safe_backup_filename(old_attachment.get('filename'))}"
        destination = os.path.join(UPLOAD_DIR, stored_filename)
        os.makedirs(UPLOAD_DIR, exist_ok=True)

        if zip_file:
            member = old_attachment.get("path")
            if not member or member not in zip_file.namelist():
                continue
            with zip_file.open(member) as src, open(destination, "wb") as dst:
                while True:
                    chunk = src.read(1024 * 1024)
                    if not chunk:
                        break
                    dst.write(chunk)
        else:
            # Alte JSON-Backups enthalten keine Binärdateien.
            continue

        attachment = Attachment(
            vehicle_id=new_vehicle_id,
            service_id=new_service_id,
            note_id=new_note_id,
            filename=old_attachment.get("filename") or "Datei",
            stored_filename=stored_filename,
            mime_type=old_attachment.get("mimeType") or "application/octet-stream",
            file_size=os.path.getsize(destination),
            is_vehicle_image=bool(old_attachment.get("isVehicleImage")),
            created_at=(datetime.fromisoformat(old_attachment["createdAt"]) if old_attachment.get("createdAt") else datetime.now(timezone.utc))
        )
        db.session.add(attachment)
        db.session.flush()
        imported_attachments += 1

        # Merke die Zuordnung der alten Attachment-ID zur neuen DB-ID.
        # Die Fahrzeug-Titelbilder werden weiter unten anhand von
        # vehicle.photoAttachmentId gesetzt. Dadurch bleibt beim Import
        # exakt das gleiche Titelbild erhalten, auch wenn ein Fahrzeug
        # mehrere Bilder besitzt.
        attachment_map[str(old_attachment.get("id"))] = attachment.id

    # Fahrzeug-Titelbilder über den expliziten Pointer wiederherstellen.
    # Nicht nur über isVehicleImage gehen: diese Markierung beschreibt zwar
    # das Bild, aber photoAttachmentId ist die tatsächliche Auswahl des
    # Titelbildes.
    for old_vehicle in data.get("vehicles", []):
        new_vehicle_id = vehicle_map.get(str(old_vehicle.get("id")))
        old_photo_id = old_vehicle.get("photoAttachmentId")
        if not new_vehicle_id or old_photo_id is None:
            continue
        new_photo_id = attachment_map.get(str(old_photo_id))
        if new_photo_id is not None:
            vehicle = db.session.get(Vehicle, new_vehicle_id)
            if vehicle:
                vehicle.photo_attachment_id = new_photo_id

    db.session.commit()

    if zip_file:
        zip_file.close()

    return jsonify({
        "vehicle_count": len(data.get("vehicles", [])),
        "service_count": len(data.get("maintenances", [])),
        "note_count": len(data.get("notes", [])),
        "attachment_count": imported_attachments
    })


# ============================================================
# Datenbank erstellen
# ============================================================

with app.app_context():
    db.create_all()

    # Kleine, rückwärtskompatible Migration für bestehende Installationen.
    from sqlalchemy import inspect, text
    inspector = inspect(db.engine)
    vehicle_columns = {c["name"] for c in inspector.get_columns("vehicle")}
    if "photo_attachment_id" not in vehicle_columns:
        db.session.execute(text("ALTER TABLE vehicle ADD COLUMN photo_attachment_id INTEGER"))
        db.session.commit()
    db.create_all()


# ============================================================
# App starten
# ============================================================
#
# Nur für lokale Entwicklung. Für den Betrieb bitte gunicorn
# verwenden, z.B.:
#   gunicorn -w 2 -b 127.0.0.1:5000 app:app
# und die App per Cloudflare Tunnel / Reverse Proxy mit TLS
# nach außen bringen.

if __name__ == "__main__":

    app.run(
        host="127.0.0.1",
        port=5000,
        debug=False
    )