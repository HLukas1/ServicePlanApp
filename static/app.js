/* ============================================================
   ServicePlan – PWA-Client
   Alle Daten liegen lokal in IndexedDB. Änderungen werden
   sofort lokal übernommen und in eine Warteschlange gelegt,
   die synchronisiert wird, sobald eine Verbindung besteht.
   ============================================================ */

// ---------- IndexedDB ----------f

const DB_NAME = "serviceplan";
const DB_VERSION = 3;
let dbPromise = null;

function openDatabase() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("vehicles")) db.createObjectStore("vehicles", { keyPath: "id" });
      if (!db.objectStoreNames.contains("services")) db.createObjectStore("services", { keyPath: "id" });
      if (!db.objectStoreNames.contains("notes")) db.createObjectStore("notes", { keyPath: "id" });
      if (!db.objectStoreNames.contains("attachments")) db.createObjectStore("attachments", { keyPath: "id" });
      if (!db.objectStoreNames.contains("attachmentBlobs")) db.createObjectStore("attachmentBlobs", { keyPath: "id" });
      if (!db.objectStoreNames.contains("queue")) db.createObjectStore("queue", { keyPath: "localId", autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function idbGetAll(store) {
  return openDatabase().then(db => new Promise((resolve, reject) => {
    const req = db.transaction(store, "readonly").objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

function idbGet(store, key) {
  return openDatabase().then(db => new Promise((resolve, reject) => {
    const req = db.transaction(store, "readonly").objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

function idbPut(store, value) {
  return openDatabase().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  }));
}

function idbDelete(store, key) {
  return openDatabase().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  }));
}

function idbClear(store) {
  return openDatabase().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  }));
}

function idbAdd(store, value) {
  return openDatabase().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    const req = tx.objectStore(store).add(value);
    req.onsuccess = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
  }));
}

// ---------- Hilfsfunktionen ----------

function idEq(a, b) {
  return String(a) === String(b);
}

async function idbGetById(store, id) {
  const all = await idbGetAll(store);
  return all.find(item => idEq(item.id, id)) || null;
}

function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function formatDateDisplay(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

function makeTempId(kind) {
  const rand = (crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random());
  return `tmp-${kind}-${rand}`;
}

function numOrNull(value) {
  if (value === "" || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

// ---------- API-Client ----------

function getToken() {
  return localStorage.getItem("apiToken") || "";
}

async function apiFetch(path, { method = "GET", body } = {}) {
  const token = getToken();

  const res = await fetch(path, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });

  if (res.status === 401) {
    localStorage.removeItem("apiToken");
    const err = new Error("Nicht autorisiert");
    err.code = 401;
    throw err;
  }

  if (!res.ok) {
    let message = `Fehler ${res.status}`;
    try {
      const data = await res.json();
      if (data && data.error) message = data.error;
    } catch (e) { /* ignore */ }
    throw new Error(message);
  }

  if (res.status === 204) return null;

  const text = await res.text();
  return text ? JSON.parse(text) : null;
}



async function checkServerConnection() {
  try {
    const token = getToken();

    if (!token) {
      return false;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch("/api/sync", {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`
      },
      cache: "no-store",
      signal: controller.signal
    });

    clearTimeout(timeout);

    return res.ok;
  } catch (err) {
    return false;
  }
}

function kindEndpoint(kind) {
  return { vehicle: "/api/vehicles", service: "/api/services", note: "/api/notes", attachment: "/api/attachments" }[kind];
}

function storeFor(kind) {
  return { vehicle: "vehicles", service: "services", note: "notes", attachment: "attachments" }[kind];
}

// ---------- Warteschlange & Mutationen ----------

async function enqueue(kind, op, entityId, payload) {
  await idbAdd("queue", { kind, op, entityId, payload: payload || null, createdAt: Date.now() });
  await refreshPendingBadge();
}

async function refreshPendingBadge() {
  const items = await idbGetAll("queue");
  const badge = document.getElementById("pending-badge");
  if (badge) {
    if (items.length > 0) {
      badge.textContent = items.length;
      badge.style.display = "flex";
    } else {
      badge.style.display = "none";
    }
  }
  return items.length;
}

async function createVehicle(fields) {
  const tempId = makeTempId("vehicle");
  await idbPut("vehicles", { id: tempId, ...fields });
  await enqueue("vehicle", "create", tempId, fields);
  triggerSync();
  return tempId;
}

async function updateVehicle(id, fields) {
  const existing = await idbGetById("vehicles", id);
  await idbPut("vehicles", { ...existing, ...fields });
  await enqueue("vehicle", "update", id, fields);
  triggerSync();
}

async function deleteVehicle(id) {
  await idbDelete("vehicles", id);
  const services = (await idbGetAll("services")).filter(s => idEq(s.vehicle_id, id));
  for (const s of services) await idbDelete("services", s.id);
  const notes = (await idbGetAll("notes")).filter(n => idEq(n.vehicle_id, id));
  for (const n of notes) await idbDelete("notes", n.id);
  await enqueue("vehicle", "delete", id, null);
  triggerSync();
}

async function createService(vehicleId, fields) {
  const tempId = makeTempId("service");
  const record = { id: tempId, vehicle_id: vehicleId, ...fields };
  await idbPut("services", record);

  const vehicle = await idbGet("vehicles", vehicleId);
  if (vehicle && fields.mileage != null && (vehicle.mileage == null || fields.mileage > vehicle.mileage)) {
    vehicle.mileage = fields.mileage;
    await idbPut("vehicles", vehicle);
  }

  await enqueue("service", "create", tempId, { vehicle_id: vehicleId, ...fields });
  return tempId;
}

async function updateService(id, fields) {
  const existing = await idbGetById("services", id);
  if (!existing) throw new Error("Wartung konnte lokal nicht gefunden werden.");
  const updated = { ...existing, ...fields, id: existing.id, vehicle_id: existing.vehicle_id };
  await idbPut("services", updated);

  const vehicle = await idbGet("vehicles", updated.vehicle_id);
  if (vehicle && updated.mileage != null && (vehicle.mileage == null || updated.mileage > vehicle.mileage)) {
    vehicle.mileage = updated.mileage;
    await idbPut("vehicles", vehicle);
  }

  await enqueue("service", "update", id, fields);
}

async function deleteService(id) {
  await idbDelete("services", id);
  await enqueue("service", "delete", id, null);
  triggerSync();
}

async function createNote(vehicleId, fields) {
  const tempId = makeTempId("note");
  await idbPut("notes", { id: tempId, vehicle_id: vehicleId, ...fields });
  await enqueue("note", "create", tempId, { vehicle_id: vehicleId, ...fields });
  return tempId;
}

async function updateNote(id, fields) {
  const existing = await idbGetById("notes", id);
  if (!existing) throw new Error("Notiz konnte lokal nicht gefunden werden.");
  await idbPut("notes", { ...existing, ...fields, id: existing.id, vehicle_id: existing.vehicle_id });
  await enqueue("note", "update", id, fields);
}

async function deleteNote(id) {
  await idbDelete("notes", id);
  await enqueue("note", "delete", id, null);
  triggerSync();
}


async function createAttachment(vehicleId, file, { serviceId = null, noteId = null, isVehicleImage = false } = {}) {
  if (!file) return null;

  const tempId = makeTempId("attachment");
  const record = {
    id: tempId,
    vehicle_id: vehicleId,
    service_id: serviceId,
    note_id: noteId,
    filename: file.name || "Datei",
    mime_type: file.type || "application/octet-stream",
    file_size: file.size || 0,
    is_vehicle_image: !!isVehicleImage,
    created_at: new Date().toISOString(),
    blob: file
  };

  await idbPut("attachments", record);

  if (isVehicleImage) {
    const vehicle = await idbGetById("vehicles", vehicleId);
    if (vehicle) {
      for (const a of await idbGetAll("attachments")) {
        if (idEq(a.vehicle_id, vehicleId)) {
          a.is_vehicle_image = idEq(a.id, tempId);
          await idbPut("attachments", a);
        }
      }
      vehicle.photo_attachment_id = tempId;
      await idbPut("vehicles", vehicle);
    }
  }

  await enqueue("attachment", "create", tempId, {
    vehicle_id: vehicleId,
    service_id: serviceId,
    note_id: noteId,
    is_vehicle_image: !!isVehicleImage
  });
  triggerSync();
  return tempId;
}

async function deleteAttachment(id) {
  const attachment = await idbGetById("attachments", id);
  if (!attachment) return;

  const vehicle = await idbGetById("vehicles", attachment.vehicle_id);
  if (vehicle && idEq(vehicle.photo_attachment_id, id)) {
    vehicle.photo_attachment_id = null;
    await idbPut("vehicles", vehicle);
  }

  await idbDelete("attachments", id);
  await idbDelete("attachmentBlobs", id);
  await enqueue("attachment", "delete", id, null);
  triggerSync();
}

async function apiUploadAttachment(localAttachment, refs = {}) {
  const form = new FormData();
  form.append("file", localAttachment.blob, localAttachment.filename);
  form.append("vehicle_id", String(refs.vehicle_id ?? localAttachment.vehicle_id));
  if (refs.service_id != null) form.append("service_id", String(refs.service_id));
  if (refs.note_id != null) form.append("note_id", String(refs.note_id));
  form.append("is_vehicle_image", localAttachment.is_vehicle_image ? "1" : "0");

  const res = await fetch("/api/attachments", {
    method: "POST",
    headers: { "Authorization": `Bearer ${getToken()}` },
    body: form
  });

  if (res.status === 401) {
    localStorage.removeItem("apiToken");
    const err = new Error("Nicht autorisiert");
    err.code = 401;
    throw err;
  }
  if (!res.ok) {
    let message = `Fehler ${res.status}`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch (e) { /* ignore */ }
    throw new Error(message);
  }
  return res.json();
}

async function loadAttachmentBlob(attachment) {
  if (!attachment?.id) return null;
  if (attachment.blob instanceof Blob) return attachment.blob;

  // Bereits geladene Bilder/Dokumente dauerhaft lokal zwischenspeichern.
  const cached = await idbGet("attachmentBlobs", attachment.id);
  if (cached?.blob instanceof Blob) return cached.blob;

  if (String(attachment.id).startsWith("tmp-")) return null;

  const res = await fetch(`/api/attachments/${encodeURIComponent(attachment.id)}/content`, {
    headers: { "Authorization": `Bearer ${getToken()}` },
    cache: "force-cache"
  });
  if (!res.ok) return null;
  const blob = await res.blob();
  try { await idbPut("attachmentBlobs", { id: attachment.id, blob }); } catch (e) {
    console.warn("Lokaler Bild-Cache konnte nicht gespeichert werden", e);
  }
  return blob;
}

async function openAttachment(id) {
  const attachment = await idbGetById("attachments", id);
  if (!attachment) return;
  const blob = await loadAttachmentBlob(attachment);
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");
  if (!win) window.location.href = url;
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

async function openImageViewer(id) {
  const attachment = await idbGetById("attachments", id);
  if (!attachment) return;
  const blob = await loadAttachmentBlob(attachment);
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  let modal = document.getElementById("image-viewer-modal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "image-viewer-modal";
    modal.className = "image-viewer-modal";
    modal.innerHTML = `
      <div class="image-viewer-backdrop" data-action="close-image-viewer"></div>
      <div class="image-viewer-panel" role="dialog" aria-modal="true">
        <button type="button" class="image-viewer-close" data-action="close-image-viewer" aria-label="Schließen">✕</button>
        <img id="image-viewer-img" alt="">
        <div class="image-viewer-footer">
          <span id="image-viewer-name"></span>
          <button type="button" class="btn btn-danger" id="image-viewer-delete">🗑️ Löschen</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener("click", async (e) => {
      if (e.target.closest('[data-action="close-image-viewer"]')) closeImageViewer();
      if (e.target.id === "image-viewer-delete") {
        const current = modal.dataset.attachmentId;
        if (current && confirm("Bild wirklich löschen?")) {
          closeImageViewer();
          await deleteAttachment(current);
        }
      }
    });
  }
  modal.dataset.attachmentId = String(id);
  modal.querySelector("#image-viewer-img").src = url;
  modal.querySelector("#image-viewer-img").alt = attachment.filename || "Bild";
  modal.querySelector("#image-viewer-name").textContent = attachment.filename || "Bild";
  modal.classList.add("open");
  document.body.classList.add("image-viewer-open");
}

function closeImageViewer() {
  const modal = document.getElementById("image-viewer-modal");
  if (!modal) return;
  const img = modal.querySelector("#image-viewer-img");
  const old = img?.src;
  modal.classList.remove("open");
  document.body.classList.remove("image-viewer-open");
  if (old && old.startsWith("blob:")) setTimeout(() => URL.revokeObjectURL(old), 1000);
  if (img) img.removeAttribute("src");
}

async function hydrateAttachmentImages() {
  const images = Array.from(document.querySelectorAll("img[data-attachment-id]"));
  await Promise.all(images.map(async (img) => {
    const attachment = await idbGetById("attachments", img.dataset.attachmentId);
    if (!attachment) return;
    try {
      const blob = await loadAttachmentBlob(attachment);
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      img.src = url;
      img.onload = () => URL.revokeObjectURL(url);
    } catch (err) {
      console.warn("Bild konnte nicht geladen werden", err);
    }
  }));
}

function attachmentIcon(a) {
  if ((a.mime_type || "").startsWith("image/")) return "🖼️";
  if (a.mime_type === "application/pdf") return "📕";
  return "📄";
}

function formatFileSize(bytes) {
  const n = Number(bytes || 0);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function attachmentPreviewHtml(a, extraClass = "") {
  const isImage = (a.mime_type || "").startsWith("image/");
  if (!isImage) return `<div class="attachment-file ${extraClass}"><span class="attachment-file-icon">${attachmentIcon(a)}</span><div><strong>${escapeHtml(a.filename)}</strong><small>${formatFileSize(a.file_size)}</small></div></div>`;
  return `<div class="attachment-image ${extraClass}" data-action="view-image" data-id="${escapeHtml(a.id)}" role="button" tabindex="0" title="Bild vergrößern"><img data-attachment-id="${escapeHtml(a.id)}" alt="${escapeHtml(a.filename)}" loading="lazy"><div class="attachment-image-name">${escapeHtml(a.filename)}</div></div>`;
}

function attachmentsForTarget(attachments, { serviceId = null, noteId = null } = {}) {
  return attachments.filter(a =>
    serviceId != null ? idEq(a.service_id, serviceId) :
    noteId != null ? idEq(a.note_id, noteId) :
    a.service_id == null && a.note_id == null
  );
}

// ---------- Sync ----------

let syncing = false;

async function flushQueue() {
  const items = await idbGetAll("queue");
  items.sort((a, b) => a.localId - b.localId);

  const idMap = {};

  for (const item of items) {
    let entityId = idMap[item.entityId] || item.entityId;
    let payload = item.payload ? { ...item.payload } : undefined;

    if (payload) {
      for (const field of ["vehicle_id", "service_id", "note_id"]) {
        if (payload[field] && idMap[payload[field]]) payload[field] = idMap[payload[field]];
      }
    }

    if (item.op === "delete" && String(entityId).startsWith("tmp-")) {
      await idbDelete("queue", item.localId);
      continue;
    }

    if (item.op === "update" && String(entityId).startsWith("tmp-")) break;

    if (item.kind === "attachment" && item.op === "create") {
      const localAttachment = await idbGetById("attachments", item.entityId);
      if (!localAttachment?.blob) break;

      // Bei einem offline neu angelegten Fahrzeug/Wartung/Notiz können
      // die IDs noch temporär sein. Immer die tatsächlichen Referenzen
      // aus dem lokalen Attachment verwenden und bereits aufgelöste
      // Server-IDs aus idMap einsetzen.
      payload = { ...(payload || {}) };
      const attachmentVehicleId = payload.vehicle_id ?? localAttachment.vehicle_id;
      const attachmentServiceId = payload.service_id ?? localAttachment.service_id;
      const attachmentNoteId = payload.note_id ?? localAttachment.note_id;
      if (attachmentVehicleId != null) payload.vehicle_id = idMap[attachmentVehicleId] || attachmentVehicleId;
      if (attachmentServiceId != null) payload.service_id = idMap[attachmentServiceId] || attachmentServiceId;
      if (attachmentNoteId != null) payload.note_id = idMap[attachmentNoteId] || attachmentNoteId;

      // Sicherheit: niemals einen Upload ohne Fahrzeug-ID an die API schicken.
      if (payload.vehicle_id == null || String(payload.vehicle_id).startsWith("tmp-")) break;

      const created = await apiUploadAttachment(localAttachment, payload);
      idMap[item.entityId] = created.id;
      await idbDelete("attachments", item.entityId);

      const localVehicle = await idbGetById("vehicles", payload.vehicle_id);
      if (localVehicle && idEq(localVehicle.photo_attachment_id, item.entityId)) {
        localVehicle.photo_attachment_id = created.id;
        await idbPut("vehicles", localVehicle);
      }

      await idbPut("attachments", created);
    } else if (item.op === "create") {
      const created = await apiFetch(kindEndpoint(item.kind), { method: "POST", body: payload });

      if (!idEq(entityId, created.id)) {
        idMap[entityId] = created.id;
        await idbDelete(storeFor(item.kind), entityId);

        if (item.kind === "vehicle") {
          for (const s of await idbGetAll("services")) {
            if (idEq(s.vehicle_id, entityId)) { s.vehicle_id = created.id; await idbPut("services", s); }
          }
          for (const n of await idbGetAll("notes")) {
            if (idEq(n.vehicle_id, entityId)) { n.vehicle_id = created.id; await idbPut("notes", n); }
          }
          for (const a of await idbGetAll("attachments")) {
            if (idEq(a.vehicle_id, entityId)) { a.vehicle_id = created.id; await idbPut("attachments", a); }
          }
        }
      }

      await idbPut(storeFor(item.kind), created);
    } else if (item.op === "update") {
      const updated = await apiFetch(`${kindEndpoint(item.kind)}/${entityId}`, { method: "PUT", body: payload });
      await idbPut(storeFor(item.kind), updated);
    } else if (item.op === "delete") {
      await apiFetch(`${kindEndpoint(item.kind)}/${entityId}`, { method: "DELETE" });
      await idbDelete(storeFor(item.kind), entityId);
    }

    await idbDelete("queue", item.localId);
  }
}

async function pullSnapshot() {
  const data = await apiFetch("/api/sync");

  const queue = await idbGetAll("queue");
  const pendingAttachmentIds = queue
    .filter(q => q.kind === "attachment" && q.op === "create")
    .map(q => q.entityId);
  const pendingAttachments = [];
  for (const id of pendingAttachmentIds) {
    const a = await idbGetById("attachments", id);
    if (a) pendingAttachments.push(a);
  }

  await idbClear("vehicles");
  await idbClear("services");
  await idbClear("notes");
  await idbClear("attachments");

  for (const v of data.vehicles) {
    const { services, notes, attachments, ...vehicleFields } = v;
    await idbPut("vehicles", vehicleFields);
    for (const s of services || []) await idbPut("services", s);
    for (const n of notes || []) await idbPut("notes", n);
    for (const a of attachments || []) await idbPut("attachments", a);
  }

  for (const a of pendingAttachments) {
    await idbPut("attachments", a);
    if (a.is_vehicle_image) {
      const vehicle = await idbGetById("vehicles", a.vehicle_id);
      if (vehicle) {
        vehicle.photo_attachment_id = a.id;
        await idbPut("vehicles", vehicle);
      }
    }
  }

  localStorage.setItem("lastSync", data.server_time);
}

async function sync({ rerender = true, manual = false } = {}) {
  if (!getToken() || !navigator.onLine || syncing) return "skipped";

  syncing = true;
  setSyncStatus("syncing");

  try {
    await flushQueue();
    await pullSnapshot();
    setSyncStatus("idle");
  } catch (err) {
    console.warn("Sync fehlgeschlagen:", err);
    setSyncStatus(err.code === 401 ? "auth-error" : "error");
    if (manual) throw err;
    if (err.code === 401) await renderCurrentRoute();
    syncing = false;
    return "error";
  }

  syncing = false;
  await refreshPendingBadge();
  updateOfflineBanner();
  if (rerender) await renderCurrentRoute();
  return "ok";
}

function triggerSync() {
  renderCurrentRoute();
  refreshPendingBadge();
  updateOfflineBanner();
  sync();
}

function setSyncStatus(status) {
  const dot = document.getElementById("sync-dot");
  if (!dot) return;
  dot.className = "sync-dot sync-dot-" + status;
  const labels = {
    idle: "Synchronisiert",
    syncing: "Synchronisiere…",
    error: "Sync fehlgeschlagen",
    "auth-error": "Token ungültig"
  };
  dot.title = labels[status] || "";
}

function updateOfflineBanner() {
  const banner = document.getElementById("offline-banner");
  if (!banner) return;
  banner.style.display = navigator.onLine ? "none" : "block";
}

window.addEventListener("online", () => { updateOfflineBanner(); sync(); });
window.addEventListener("offline", updateOfflineBanner);

// ---------- Router ----------

function parseRoute() {
  const hash = location.hash.replace(/^#/, "") || "/";
  const segments = hash.split("/").filter(Boolean);

  if (segments[0] === "vehicle" && segments[1] === "add") return { name: "vehicle-add" };
  if (segments[0] === "vehicle" && segments[2] === "edit") return { name: "vehicle-edit", vehicleId: segments[1] };
  if (segments[0] === "vehicle" && segments[2] === "service" && segments[3] === "add") return { name: "service-add", vehicleId: segments[1] };
  if (segments[0] === "vehicle" && segments[2] === "note" && segments[3] === "add") return { name: "note-add", vehicleId: segments[1] };
  if (segments[0] === "vehicle" && segments[1]) return { name: "vehicle", vehicleId: segments[1] };
  if (segments[0] === "service" && segments[2] === "edit") return { name: "service-edit", serviceId: segments[1] };
  if (segments[0] === "note" && segments[2] === "edit") return { name: "note-edit", noteId: segments[1] };
  if (segments[0] === "settings") return { name: "settings" };

  return { name: "list" };
}

async function renderCurrentRoute() {
  const root = document.getElementById("app");

  if (!getToken()) {
    root.innerHTML = renderTokenScreen();
    bindTokenScreen();
    return;
  }

  const route = parseRoute();
  let html;

  try {
    switch (route.name) {
      case "vehicle": html = await renderVehicleDetailView(route.vehicleId); break;
      case "vehicle-add": html = renderVehicleFormView(null); break;
      case "vehicle-edit": html = await renderVehicleFormViewAsync(route.vehicleId); break;
      case "service-add": html = await renderServiceFormView(route.vehicleId, null); break;
      case "service-edit": html = await renderServiceFormView(null, route.serviceId); break;
      case "note-add": html = await renderNoteFormView(route.vehicleId, null); break;
      case "note-edit": html = await renderNoteFormView(null, route.noteId); break;
      case "settings": html = await renderSettingsView(); break;
      default: html = await renderVehicleListView();
    }
  } catch (err) {
    html = renderErrorView(err);
  }

  root.innerHTML = html;
  bindCurrentView(route);
  hydrateAttachmentImages();
  await refreshPendingBadge();
  updateOfflineBanner();
}

window.addEventListener("hashchange", renderCurrentRoute);

// ---------- Gemeinsame Bausteine ----------

function offlineBannerHtml() {
  return `<div id="offline-banner" class="offline-banner" style="display:${navigator.onLine ? "none" : "block"}">
    📴 Offline – Änderungen werden gespeichert und synchronisiert, sobald wieder Verbindung besteht.
  </div>`;
}

function topbarHtml({ backHref = null, title, icon = "🚗", rightHref = "#/settings", rightIcon = "gear" } = {}) {
  const backBtn = backHref
    ? `<a href="${backHref}" class="icon-btn" aria-label="Zurück" title="Zurück">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M15 6l-6 6 6 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </a>`
    : `<span class="topbar-spacer"></span>`;

  const rightBtn = rightHref
    ? `<a href="${rightHref}" class="icon-btn" aria-label="Einstellungen" title="Einstellungen" style="position:relative;">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" stroke="currentColor" stroke-width="1.8"/>
          <path d="M19.4 13.5c.04-.33.06-.66.06-1s-.02-.67-.06-1l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.6 7.6 0 0 0-1.73-1l-.36-2.54a.5.5 0 0 0-.5-.43h-3.84a.5.5 0 0 0-.5.43l-.36 2.54c-.63.24-1.21.58-1.73 1l-2.39-.96a.5.5 0 0 0-.6.22L2.65 9.28a.5.5 0 0 0 .12.64L4.8 11.5c-.04.33-.06.66-.06 1s.02.67.06 1l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.13.22.4.31.6.22l2.39-.96c.52.42 1.1.76 1.73 1l.36 2.54c.05.25.26.43.5.43h3.84c.24 0 .45-.18.5-.43l.36-2.54c.63-.24 1.21-.58 1.73-1l2.39.96c.22.09.47 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64L19.4 13.5Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
        </svg>
        <span id="pending-badge" class="pending-badge" style="display:none;"></span>
      </a>`
    : `<span class="topbar-spacer"></span>`;

  return `<header class="topbar">
    <div class="topbar-inner">
      ${backBtn}
      <div class="brand">
        <img class="brand-logo" src="/static/icons/icon-192.png" alt="ServicePlan">
        <h1>${escapeHtml(title)}</h1>
      </div>
      ${rightBtn}
    </div>
  </header>`;
}

const iconPencil = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 20h9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
const iconTrash = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2m2 0-.8 12a2 2 0 0 1-2 1.9H8.8a2 2 0 0 1-2-1.9L6 7h12Z" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const iconPlus = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>`;

// ---------- Token-Screen ----------

function renderTokenScreen() {
  return `<main class="container container-narrow login-page">
    <div class="login-brand">
      <img class="login-logo" src="/static/icons/icon-192.png" alt="ServicePlan">
      <h1>ServicePlanAPP</h1>
    </div>
    <p class="subtitle" style="text-align:center; margin-bottom:20px;">
      Gerät mit deinem Server verbinden
    </p>
    <div id="token-message"></div>
    <form id="token-form" class="form-card">
      <div class="form-section">
        <div class="field">
          <label for="token-input">Geräte-Token</label>
          <input id="token-input" type="password" name="token" autocomplete="off" required autofocus>
        </div>
      </div>
      <div class="form-buttons">
        <button type="submit" class="btn btn-primary">Verbinden</button>
      </div>
    </form>
  </main>`;
}

function bindTokenScreen() {
  const form = document.getElementById("token-form");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const token = document.getElementById("token-input").value.trim();
    if (!token) return;

    localStorage.setItem("apiToken", token);

    const msgBox = document.getElementById("token-message");
    try {
      await apiFetch("/api/sync");
      location.hash = "#/";
      await renderCurrentRoute();
      sync();
    } catch (err) {
      localStorage.removeItem("apiToken");
      msgBox.innerHTML = `<div class="message error">Verbindung fehlgeschlagen: ${escapeHtml(err.message)}</div>`;
    }
  });
}

// ---------- Fehleransicht ----------

function renderErrorView(err) {
  return `<main class="container container-narrow">
    <div class="empty-state">
      <div class="empty-icon">⚠️</div>
      <h3>Etwas ist schiefgelaufen</h3>
      <p>${escapeHtml(err.message || String(err))}</p>
      <a href="#/" class="btn btn-primary">Zur Übersicht</a>
    </div>
  </main>`;
}

// ---------- Fahrzeugliste ----------

async function renderVehicleListView() {
  const vehicles = (await idbGetAll("vehicles")).sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  const cards = vehicles.map(v => `
    <a class="vehicle-card" href="#/vehicle/${v.id}">
      <div class="vehicle-card-header">
        <div class="vehicle-avatar">${v.photo_attachment_id ? `<img data-attachment-id="${escapeHtml(v.photo_attachment_id)}" alt="${escapeHtml(v.name)}">` : "🚘"}</div>
        <div class="vehicle-title">
          <h3>${escapeHtml(v.name)}</h3>
          <p class="vehicle-sub">${escapeHtml(v.brand || "")} ${escapeHtml(v.model || "")}</p>
        </div>
      </div>
      ${(v.engine || v.year || v.mileage) ? `
      <div class="vehicle-meta">
        ${v.engine ? `<span class="chip">🔧 ${escapeHtml(v.engine)}</span>` : ""}
        ${v.year ? `<span class="chip">📅 ${escapeHtml(v.year)}</span>` : ""}
        ${v.mileage ? `<span class="chip">📏 ${escapeHtml(v.mileage)} km</span>` : ""}
      </div>` : ""}
      <span class="vehicle-arrow">Fahrzeug öffnen
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </span>
    </a>
  `).join("");

  return `${offlineBannerHtml()}
    ${topbarHtml({ title: "ServicePlanAPP" })}
    <main class="container">
      <section class="page-head">
        <div>
          <h2>Meine Fahrzeuge</h2>
          <p class="subtitle">${vehicles.length ? vehicles.length + " Fahrzeug" + (vehicles.length !== 1 ? "e" : "") : "Noch keine Fahrzeuge"}</p>
        </div>
        <a class="btn btn-primary" href="#/vehicle/add">${iconPlus} Fahrzeug hinzufügen</a>
      </section>

      ${vehicles.length ? `<div class="vehicle-grid">${cards}</div>` : `
        <div class="empty-state">
          <div class="empty-icon">🚗</div>
          <h3>Noch keine Fahrzeuge vorhanden</h3>
          <p>Füge dein erstes Fahrzeug hinzu, um mit der Wartungsplanung zu starten.</p>
          <a class="btn btn-primary" href="#/vehicle/add">${iconPlus} Fahrzeug hinzufügen</a>
        </div>
      `}
    </main>`;
}

// ---------- Fahrzeug-Detail ----------

async function renderVehicleDetailView(vehicleId) {
  const vehicle = await idbGetById("vehicles", vehicleId);
  if (!vehicle) return renderErrorView(new Error("Fahrzeug nicht gefunden."));

  const services = (await idbGetAll("services"))
    .filter(s => idEq(s.vehicle_id, vehicleId))
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  const notes = (await idbGetAll("notes")).filter(n => idEq(n.vehicle_id, vehicleId));
  const attachments = (await idbGetAll("attachments"))
    .filter(a => idEq(a.vehicle_id, vehicleId))
    .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));

  const infoItem = (label, value) => `
    <div class="info-item">
      <span class="info-label">${label}</span>
      <span class="info-value">${escapeHtml(value ?? "–")}</span>
    </div>`;

  const vehiclePhoto = vehicle.photo_attachment_id
    ? attachments.find(a => idEq(a.id, vehicle.photo_attachment_id))
    : null;

  const galleryAttachments = attachments.filter(a => !a.is_vehicle_image);
  const imageAttachments = galleryAttachments.filter(a => (a.mime_type || "").startsWith("image/"));
  const documentAttachments = galleryAttachments.filter(a => !(a.mime_type || "").startsWith("image/"));

  const attachmentDeleteButton = (a) => `<button type="button" class="icon-btn icon-btn-sm icon-btn-danger" data-action="delete-attachment" data-id="${escapeHtml(a.id)}" aria-label="Löschen" title="Löschen">${iconTrash}</button>`;

  const linkedAttachmentsHtml = (items) => items.length ? `<div class="attachment-list">${items.map(a => `
    <div class="attachment-row">
      <button type="button" class="attachment-open" data-action="open-attachment" data-id="${escapeHtml(a.id)}">
        <div class="attachment-row-main">${attachmentIcon(a)}<span>${escapeHtml(a.filename)}</span><small>${formatFileSize(a.file_size)}</small></div>
      </button>
      <div class="card-icon-actions">
        ${attachmentDeleteButton(a)}
      </div>
    </div>`).join("")}</div>` : "";

  const noteCards = notes.map(n => {
    const linked = attachmentsForTarget(attachments, { noteId: n.id });
    return `<div class="card">
      <div class="service-header">
        <div>${n.title ? `<h3 class="service-date">${escapeHtml(n.title)}</h3>` : ""}</div>
        <div class="card-icon-actions">
          <a class="icon-btn icon-btn-sm" href="#/note/${n.id}/edit" aria-label="Bearbeiten" title="Bearbeiten">${iconPencil}</a>
          <button type="button" class="icon-btn icon-btn-sm icon-btn-danger" data-action="delete-note" data-id="${n.id}" aria-label="Löschen" title="Löschen">${iconTrash}</button>
        </div>
      </div>
      ${n.content ? `<p class="service-notes">${escapeHtml(n.content)}</p>` : ""}
      ${linked.length ? `<div class="linked-attachments"><span class="attachment-label">📎 Anhänge</span>${linkedAttachmentsHtml(linked)}</div>` : ""}
    </div>`;
  }).join("");

  const serviceCards = services.map(s => {
    const workLabels = {
      engine_oil: "Motoröl", oil_filter: "Ölfilter", spark_plugs: "Zündkerzen",
      air_filter: "Luftfilter", cabin_filter: "Pollenfilter", timing_belt: "Zahnriemen",
      brake_fluid: "Bremsflüssigkeit", coolant: "Kühlmittel", transmission_oil: "Getriebeöl"
    };
    const tags = Object.entries(workLabels).filter(([key]) => s[key]).map(([, label]) => `<span class="chip">${label}</span>`).join("");
    const nextParts = [];
    if (s.next_service_mileage) nextParts.push(`bei ${escapeHtml(s.next_service_mileage)} km`);
    if (s.next_service_date) nextParts.push(`am ${formatDateDisplay(s.next_service_date)}`);
    const linked = attachmentsForTarget(attachments, { serviceId: s.id });

    return `<article class="card service-item">
      <div class="service-header">
        <div>
          <h3 class="service-date">${formatDateDisplay(s.date)}</h3>
          ${s.mileage ? `<p class="subtitle subtitle-tight">${escapeHtml(s.mileage)} km</p>` : ""}
        </div>
        <div class="service-header-right">
          ${s.service_type ? `<span class="chip chip-accent">${escapeHtml(s.service_type)}</span>` : ""}
          <div class="card-icon-actions">
            <a class="icon-btn icon-btn-sm" href="#/service/${s.id}/edit" aria-label="Bearbeiten" title="Bearbeiten">${iconPencil}</a>
            <button type="button" class="icon-btn icon-btn-sm icon-btn-danger" data-action="delete-service" data-id="${s.id}" aria-label="Löschen" title="Löschen">${iconTrash}</button>
          </div>
        </div>
      </div>
      ${tags ? `<div class="tag-list">${tags}</div>` : ""}
      ${(s.workshop || s.cost) ? `<div class="info-grid info-grid-compact">${s.workshop ? infoItem("Werkstatt", s.workshop) : ""}${s.cost ? infoItem("Kosten", s.cost + " €") : ""}</div>` : ""}
      ${s.notes ? `<p class="service-notes">${escapeHtml(s.notes)}</p>` : ""}
      ${linked.length ? `<div class="linked-attachments"><span class="attachment-label">📎 Anhänge</span>${linkedAttachmentsHtml(linked)}</div>` : ""}
      ${nextParts.length ? `<div class="next-service"><span class="next-service-label">Nächste Wartung</span><span>${nextParts.join(" · ")}</span></div>` : ""}
    </article>`;
  }).join("");

  return `${offlineBannerHtml()}
    ${topbarHtml({ backHref: "#/", title: vehicle.name, icon: "🚘", rightHref: null })}
    <main class="container container-narrow">

      <section class="card vehicle-detail-hero">
        <div class="vehicle-detail-photo">
          ${vehiclePhoto ? `<img data-attachment-id="${escapeHtml(vehiclePhoto.id)}" alt="${escapeHtml(vehicle.name)}">` : `<span>🚘</span>`}
        </div>
        <div class="vehicle-detail-heading">
          <h2>${escapeHtml(vehicle.name)}</h2>
          <p class="subtitle">${escapeHtml([vehicle.brand, vehicle.model].filter(Boolean).join(" "))}</p>
        </div>
        <div class="card-icon-actions">
          <a class="icon-btn icon-btn-sm" href="#/vehicle/${vehicle.id}/edit" aria-label="Bearbeiten" title="Bearbeiten">${iconPencil}</a>
          <button type="button" class="icon-btn icon-btn-sm icon-btn-danger" data-action="delete-vehicle" data-id="${vehicle.id}" aria-label="Löschen" title="Löschen">${iconTrash}</button>
        </div>
      </section>

      <section class="card">
        <div class="service-header"><h2 class="card-title">Fahrzeugdaten</h2></div>
        <div class="info-grid">
          ${infoItem("Marke", vehicle.brand)}${infoItem("Modell", vehicle.model)}${infoItem("Motor", vehicle.engine)}${infoItem("Baujahr", vehicle.year)}
          ${infoItem("Farbe", vehicle.color)}${infoItem("Kennzeichen", vehicle.license_plate)}${infoItem("FIN", vehicle.fin)}${infoItem("Kilometerstand", vehicle.mileage ? vehicle.mileage + " km" : "–")}
        </div>
      </section>

      <section class="card">
        <div class="service-header"><h2 class="card-title">Bilder &amp; Dokumente</h2></div>
        <div class="upload-actions attachment-upload-actions">
          <label class="btn btn-secondary">📷 Foto<input id="vehicle-attachment-camera" type="file" accept="image/*" capture="environment" multiple hidden></label>
          <label class="btn btn-secondary">🖼️ Bilder<input id="vehicle-attachment-images" type="file" accept="image/*" multiple hidden></label>
          <label class="btn btn-secondary">📄 Dokument<input id="vehicle-attachment-documents" type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain" multiple hidden></label>
        </div>
        ${galleryAttachments.length ? `<div class="attachment-gallery">${imageAttachments.map(a => attachmentPreviewHtml(a)).join("")}</div>${documentAttachments.length ? linkedAttachmentsHtml(documentAttachments) : ""}` : `<p class="empty-hint">Noch keine zusätzlichen Bilder oder Dokumente vorhanden.</p>`}
      </section>

      <section class="page-head page-head-tight"><h2>Notizen</h2><a href="#/vehicle/${vehicle.id}/note/add" class="btn btn-primary">${iconPlus} Notiz hinzufügen</a></section>
      ${notes.length ? `<div class="stack">${noteCards}</div>` : `<p class="empty-hint">Keine Notizen vorhanden.</p>`}

      <section class="page-head page-head-tight"><h2>Wartungshistorie</h2><a href="#/vehicle/${vehicle.id}/service/add" class="btn btn-primary">${iconPlus} Wartung hinzufügen</a></section>
      ${services.length ? `<div class="stack">${serviceCards}</div>` : `<p class="empty-hint">Noch keine Wartungen vorhanden.</p>`}

    </main>`;
}

// ---------- Fahrzeug-Formular ----------

function vehicleFormFields(v) {
  return `
    <div class="form-section">
      <h3 class="section-title">Fahrzeugbild</h3>
      <div class="vehicle-photo-upload">
        <div id="vehicle-photo-preview" class="vehicle-photo-preview">${v?.photo_attachment_id ? `<img data-attachment-id="${escapeHtml(v.photo_attachment_id)}" alt="Fahrzeugbild">` : "🚘"}</div>
        <div class="upload-actions">
          <label class="btn btn-secondary">📷 Foto aufnehmen<input id="vehicle-photo-camera" type="file" accept="image/*" capture="environment" hidden></label>
          <label class="btn btn-secondary">🖼️ Bild auswählen<input id="vehicle-photo-gallery" type="file" accept="image/*" hidden></label>
          ${v?.photo_attachment_id ? `<button type="button" class="btn btn-secondary" id="vehicle-photo-remove">🗑️ Bild entfernen</button>` : ""}
        </div>
        <p class="field-hint">Das ausgewählte Bild wird als Fahrzeugbild verwendet und in der Übersicht angezeigt.</p>
      </div>
    </div>
    <div class="form-section">
      <h3 class="section-title">Allgemein</h3>
      <div class="field">
        <label for="f-name">Name</label>
        <input id="f-name" type="text" name="name" value="${escapeHtml(v?.name || "")}" required>
      </div>
      <div class="field-row">
        <div class="field"><label for="f-brand">Marke</label><input id="f-brand" type="text" name="brand" value="${escapeHtml(v?.brand || "")}" placeholder="z.B. VW"></div>
        <div class="field"><label for="f-model">Modell</label><input id="f-model" type="text" name="model" value="${escapeHtml(v?.model || "")}" placeholder="z.B. T4"></div>
      </div>
      <div class="field-row">
        <div class="field"><label for="f-engine">Motor</label><input id="f-engine" type="text" name="engine" value="${escapeHtml(v?.engine || "")}" placeholder="z.B. 2.5 TDI"></div>
        <div class="field"><label for="f-year">Baujahr</label><input id="f-year" type="number" name="year" value="${v?.year ?? ""}" placeholder="z.B. 1999"></div>
      </div>
    </div>
    <div class="form-section">
      <h3 class="section-title">Details</h3>
      <div class="field-row">
        <div class="field"><label for="f-color">Farbe</label><input id="f-color" type="text" name="color" value="${escapeHtml(v?.color || "")}" placeholder="z.B. Weiß"></div>
        <div class="field"><label for="f-plate">Kennzeichen</label><input id="f-plate" type="text" name="license_plate" value="${escapeHtml(v?.license_plate || "")}" placeholder="z.B. IN-AB 123"></div>
      </div>
      <div class="field"><label for="f-fin">FIN / VIN</label><input id="f-fin" type="text" name="fin" value="${escapeHtml(v?.fin || "")}" placeholder="z.B. WAUZZZ281ZFA095461"></div>
      <div class="field"><label for="f-mileage">Kilometerstand</label><input id="f-mileage" type="number" name="mileage" value="${v?.mileage ?? ""}" placeholder="z.B. 380000"></div>
    </div>`;
}

function renderVehicleFormView(vehicle) {
  const editMode = !!vehicle;
  return `${offlineBannerHtml()}
    ${topbarHtml({ backHref: vehicle ? `#/vehicle/${vehicle.id}` : "#/", title: editMode ? "Fahrzeug bearbeiten" : "Fahrzeug hinzufügen", rightHref: null })}
    <main class="container container-narrow">
      <form id="vehicle-form" class="form-card" data-mode="${editMode ? "edit" : "create"}" data-id="${vehicle?.id ?? ""}">
        ${vehicleFormFields(vehicle)}
        <div class="form-buttons">
          <button type="submit" class="btn btn-primary">${editMode ? "Änderungen speichern" : "Fahrzeug speichern"}</button>
          <a href="${vehicle ? `#/vehicle/${vehicle.id}` : "#/"}" class="btn btn-secondary">Abbrechen</a>
        </div>
      </form>
    </main>`;
}

async function renderVehicleFormViewAsync(vehicleId) {
  const vehicle = await idbGetById("vehicles", vehicleId);
  if (!vehicle) return renderErrorView(new Error("Fahrzeug nicht gefunden."));
  return renderVehicleFormView(vehicle);
}

// ---------- Wartungs-Formular ----------

const SERVICE_TYPES = ["Inspektion", "Ölwechsel", "Reparatur", "Bremsen", "Zahnriemen", "TÜV", "Sonstiges"];
const WORK_ITEMS = [
  ["engine_oil", "Motoröl"], ["oil_filter", "Ölfilter"], ["spark_plugs", "Zündkerzen"],
  ["air_filter", "Luftfilter"], ["cabin_filter", "Pollenfilter"], ["timing_belt", "Zahnriemen"],
  ["brake_fluid", "Bremsflüssigkeit"], ["coolant", "Kühlmittel"], ["transmission_oil", "Getriebeöl"]
];

async function renderServiceFormView(vehicleId, serviceId) {
  let service = null;
  let vehicle;

  if (serviceId) {
    service = await idbGetById("services", serviceId);
    if (!service) return renderErrorView(new Error("Wartung nicht gefunden."));
    vehicle = await idbGetById("vehicles", service.vehicle_id);
  } else {
    vehicle = await idbGetById("vehicles", vehicleId);
  }
  if (!vehicle) return renderErrorView(new Error("Fahrzeug nicht gefunden."));

  const editMode = !!service;

  const typeOptions = SERVICE_TYPES.map(t =>
    `<option value="${t}" ${service?.service_type === t ? "selected" : ""}>${t}</option>`
  ).join("");

  const workChecks = WORK_ITEMS.map(([key, label]) => `
    <label class="check-item">
      <input type="checkbox" name="${key}" ${service?.[key] ? "checked" : ""}>
      <span>${label}</span>
    </label>`).join("");

  return `${offlineBannerHtml()}
    ${topbarHtml({ backHref: `#/vehicle/${vehicle.id}`, title: editMode ? "Wartung bearbeiten" : "Wartung hinzufügen", icon: "🛠️", rightHref: null })}
    <main class="container container-narrow">
      <section class="page-head page-head-tight"><div><h2>${escapeHtml(vehicle.name)}</h2></div></section>

      <form id="service-form" class="form-card" data-mode="${editMode ? "edit" : "create"}" data-id="${service?.id ?? ""}" data-vehicle-id="${vehicle.id}">
        <div class="form-section">
          <h3 class="section-title">Grunddaten</h3>
          <div class="field-row">
            <div class="field"><label for="s-date">Datum</label><input id="s-date" type="date" name="date" value="${service?.date || ""}" required></div>
            <div class="field"><label for="s-mileage">Kilometerstand</label><input id="s-mileage" type="number" name="mileage" value="${service?.mileage ?? ""}" placeholder="z.B. 380000"></div>
          </div>
          <div class="field">
            <label for="s-type">Art der Wartung</label>
            <select id="s-type" name="service_type"><option value="">Bitte auswählen</option>${typeOptions}</select>
          </div>
        </div>

        <div class="form-section">
          <h3 class="section-title">Durchgeführte Arbeiten</h3>
          <div class="checkbox-grid">${workChecks}</div>
        </div>

        <div class="form-section">
          <h3 class="section-title">Werkstatt &amp; Kosten</h3>
          <div class="field-row">
            <div class="field"><label for="s-workshop">Werkstatt</label><input id="s-workshop" type="text" name="workshop" value="${escapeHtml(service?.workshop || "")}" placeholder="z.B. ATU"></div>
            <div class="field"><label for="s-cost">Kosten (€)</label><input id="s-cost" type="number" step="0.01" name="cost" value="${service?.cost ?? ""}" placeholder="z.B. 149.90"></div>
          </div>
        </div>

        <div class="form-section">
          <h3 class="section-title">Nächste Wartung</h3>
          <div class="field-row">
            <div class="field"><label for="s-next-mileage">Bei Kilometerstand</label><input id="s-next-mileage" type="number" name="next_service_mileage" value="${service?.next_service_mileage ?? ""}" placeholder="z.B. 395000"></div>
            <div class="field"><label for="s-next-date">Am Datum</label><input id="s-next-date" type="date" name="next_service_date" value="${service?.next_service_date || ""}"></div>
          </div>
        </div>

        <div class="form-section">
          <h3 class="section-title">Notizen</h3>
          <div class="field"><textarea name="notes" rows="5" placeholder="Weitere Informationen...">${escapeHtml(service?.notes || "")}</textarea></div>
        </div>

        <div class="form-section">
          <h3 class="section-title">Bilder &amp; Dokumente</h3>
          <div id="service-attachment-preview" class="selected-files"></div>
          <div class="upload-actions">
            <label class="btn btn-secondary">📷 Foto aufnehmen<input id="service-camera" type="file" accept="image/*" capture="environment" multiple hidden></label>
            <label class="btn btn-secondary">🖼️ Bilder auswählen<input id="service-images" type="file" accept="image/*" multiple hidden></label>
            <label class="btn btn-secondary">📄 Dokument auswählen<input id="service-documents" type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain" multiple hidden></label>
          </div>
          <p class="field-hint">Die Dateien werden automatisch diesem Fahrzeug und dieser Wartung zugeordnet.</p>
        </div>

        <div class="form-buttons">
          <button type="submit" class="btn btn-primary">${editMode ? "Änderungen speichern" : "Wartung speichern"}</button>
          <a href="#/vehicle/${vehicle.id}" class="btn btn-secondary">Abbrechen</a>
        </div>
      </form>
    </main>`;
}

// ---------- Notiz-Formular ----------

async function renderNoteFormView(vehicleId, noteId) {
  let note = null;
  let vehicle;

  if (noteId) {
    note = await idbGetById("notes", noteId);
    if (!note) return renderErrorView(new Error("Notiz nicht gefunden."));
    vehicle = await idbGetById("vehicles", note.vehicle_id);
  } else {
    vehicle = await idbGetById("vehicles", vehicleId);
  }
  if (!vehicle) return renderErrorView(new Error("Fahrzeug nicht gefunden."));

  const editMode = !!note;

  return `${offlineBannerHtml()}
    ${topbarHtml({ backHref: `#/vehicle/${vehicle.id}`, title: editMode ? "Notiz bearbeiten" : "Notiz hinzufügen", icon: "📝", rightHref: null })}
    <main class="container container-narrow">
      <section class="page-head page-head-tight"><div><h2>${escapeHtml(vehicle.name)}</h2></div></section>

      <form id="note-form" class="form-card" data-mode="${editMode ? "edit" : "create"}" data-id="${note?.id ?? ""}" data-vehicle-id="${vehicle.id}">
        <div class="form-section">
          <div class="field"><label for="n-title">Titel</label><input id="n-title" type="text" name="title" value="${escapeHtml(note?.title || "")}" placeholder="z.B. Geräusch beim Bremsen"></div>
          <div class="field"><label for="n-content">Notiz</label><textarea id="n-content" name="content" rows="8" placeholder="Was möchtest du dir merken?">${escapeHtml(note?.content || "")}</textarea></div>
        </div>
        <div class="form-section">
          <h3 class="section-title">Bilder &amp; Dokumente</h3>
          <div id="note-attachment-preview" class="selected-files"></div>
          <div class="upload-actions">
            <label class="btn btn-secondary">📷 Foto aufnehmen<input id="note-camera" type="file" accept="image/*" capture="environment" multiple hidden></label>
            <label class="btn btn-secondary">🖼️ Bilder auswählen<input id="note-images" type="file" accept="image/*" multiple hidden></label>
            <label class="btn btn-secondary">📄 Dokument auswählen<input id="note-documents" type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain" multiple hidden></label>
          </div>
          <p class="field-hint">Die Dateien werden automatisch diesem Fahrzeug und dieser Notiz zugeordnet.</p>
        </div>
        <div class="form-buttons">
          <button type="submit" class="btn btn-primary">${editMode ? "Änderungen speichern" : "Notiz speichern"}</button>
          <a href="#/vehicle/${vehicle.id}" class="btn btn-secondary">Abbrechen</a>
        </div>
      </form>
    </main>`;
}

// ---------- Einstellungen ----------

async function renderSettingsView() {
  const pending = (await idbGetAll("queue")).length;
  const lastSync = localStorage.getItem("lastSync");

  return `${offlineBannerHtml()}
    ${topbarHtml({ backHref: "#/", title: "Einstellungen", icon: "⚙️", rightHref: null })}
    <main class="container container-narrow">

      <div class="stack">
        <div class="card">
          <h3 class="card-title">Status</h3>
          <div id="server-status" class="server-status">
            <span class="server-status-dot"></span>
            <span class="server-status-text">Prüfe Verbindung…</span>
          </div>

          <p class="card-text">
            ${pending} ungesendete Änderung${pending === 1 ? "" : "en"} ·
            Letzter Sync: ${lastSync ? new Date(lastSync).toLocaleString("de-DE") : "nie"}
          </p>
          <div class="form-buttons">
            <button type="button" class="btn btn-primary" id="manual-sync-btn">Jetzt synchronisieren</button>
          <div id="manual-sync-result" class="sync-result" aria-live="polite"></div>
          </div>
        </div>

        <div class="card">
          <h3 class="card-title">Backup exportieren</h3>
          <p class="card-text">Lädt eine vollständige ZIP-Sicherung mit Fahrzeugen, Wartungen, Notizen sowie allen Bildern und Dokumenten herunter.</p>
          <button type="button" class="btn btn-secondary" id="export-btn">Backup herunterladen</button>
        </div>

        <div class="card">
          <h3 class="card-title">Backup importieren</h3>
          <p class="card-text">Importiert eine vollständige ServicePlan-ZIP-Sicherung inklusive Bildern und Dokumenten. Alte JSON-Backups werden weiterhin unterstützt.</p>
          <div class="field">
            <input type="file" id="import-file" accept=".zip,.json,application/zip,application/json">
          </div>
          <label class="check-item check-item-plain">
            <input type="checkbox" id="import-clear">
            <span>Vorhandene Daten vor dem Import löschen</span>
          </label>
          <div class="form-buttons">
            <button type="button" class="btn btn-primary" id="import-btn">Import starten</button>
          </div>
        </div>

        <div class="card">
          <h3 class="card-title">Gerät trennen</h3>
          <p class="card-text">Entfernt das Token und alle lokal gespeicherten Daten von diesem Handy. Die Serverdaten bleiben erhalten.</p>
          <button type="button" class="btn btn-danger" id="disconnect-btn">Gerät trennen</button>
        </div>
      </div>

      <div id="settings-message"></div>

    </main>`;
}

async function updateServerStatus() {
  const status = document.getElementById("server-status");
  if (!status) return;

  const dot = status.querySelector(".server-status-dot");
  const text = status.querySelector(".server-status-text");

  text.textContent = "Prüfe Verbindung…";
  status.className = "server-status checking";

  const online = await checkServerConnection();

  if (online) {
    status.className = "server-status online";
    text.textContent = "Online";
  } else {
    status.className = "server-status offline";
    text.textContent = "Offline";
  }
}


function setupFilePicker(inputIds, previewId, onFiles) {
  const preview = document.getElementById(previewId);
  if (!preview) return;
  const files = [];
  const render = () => {
    preview.innerHTML = files.length ? files.map(f => `<div class="selected-file">${attachmentIcon({mime_type:f.type})}<span>${escapeHtml(f.name)}</span><small>${formatFileSize(f.size)}</small></div>`).join("") : "";
  };
  for (const id of inputIds) {
    const input = document.getElementById(id);
    if (!input) continue;
    input.addEventListener("change", () => {
      for (const file of Array.from(input.files || [])) files.push(file);
      input.value = "";
      render();
      onFiles(files);
    });
  }
}

async function handleVehiclePhotoFile(file, vehicleId) {
  if (!file) return;
  const vehicle = await idbGetById("vehicles", vehicleId);
  if (!vehicle) return;
  const oldId = vehicle.photo_attachment_id;
  if (oldId) {
    const old = await idbGetById("attachments", oldId);
    if (old) {
      old.is_vehicle_image = false;
      await idbPut("attachments", old);
    }
  }
  await createAttachment(vehicleId, file, { isVehicleImage: true });
  await renderCurrentRoute();
}

async function queueFormFiles(files, vehicleId, { serviceId = null, noteId = null } = {}) {
  for (const file of files) {
    await createAttachment(vehicleId, file, { serviceId, noteId, isVehicleImage: false });
  }
}

// ---------- Event-Bindings je View ----------

function readFormData(form) {
  const fd = new FormData(form);
  const data = {};
  for (const [key, value] of fd.entries()) data[key] = value;
  return data;
}

function bindCurrentView(route) {
  if (route.name === "vehicle") bindVehicleDetail();
  if (route.name === "vehicle-add" || route.name === "vehicle-edit") bindVehicleForm();
  if (route.name === "service-add" || route.name === "service-edit") bindServiceForm();
  if (route.name === "note-add" || route.name === "note-edit") bindNoteForm();
  if (route.name === "settings") bindSettings();
}

function bindVehicleDetail() {
  const vehicleId = parseRoute().vehicleId;
  const addVehicleFiles = async (input) => {
    for (const file of Array.from(input?.files || [])) {
      await createAttachment(vehicleId, file, { isVehicleImage: false });
    }
    if (input) input.value = "";
  };
  ["vehicle-attachment-camera", "vehicle-attachment-images", "vehicle-attachment-documents"].forEach(id => {
    document.getElementById(id)?.addEventListener("change", e => addVehicleFiles(e.target));
  });
  document.querySelectorAll('[data-action="delete-vehicle"]').forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Fahrzeug wirklich löschen?")) return;
      await deleteVehicle(btn.dataset.id);
      location.hash = "#/";
    });
  });
  document.querySelectorAll('[data-action="delete-service"]').forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Diese Wartung wirklich löschen?")) return;
      await deleteService(btn.dataset.id);
    });
  });
  document.querySelectorAll('[data-action="delete-note"]').forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Diese Notiz wirklich löschen?")) return;
      await deleteNote(btn.dataset.id);
    });
  });
  document.querySelectorAll('[data-action="delete-attachment"]').forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Datei wirklich löschen?")) return;
      await deleteAttachment(btn.dataset.id);
    });
  });
  document.querySelectorAll('[data-action="open-attachment"]').forEach(btn => {
    btn.addEventListener("click", () => openAttachment(btn.dataset.id));
  });
  document.querySelectorAll('[data-action="view-image"]').forEach(btn => {
    const open = () => openImageViewer(btn.dataset.id);
    btn.addEventListener("click", open);
    btn.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
  });
}

function bindVehicleForm() {
  const form = document.getElementById("vehicle-form");
  const camera = document.getElementById("vehicle-photo-camera");
  const gallery = document.getElementById("vehicle-photo-gallery");

  const handlePhoto = async (input) => {
    const file = input?.files?.[0];
    if (!file) return;
    input.value = "";
    if (form.dataset.mode === "edit") {
      await handleVehiclePhotoFile(file, form.dataset.id);
    } else {
      form._pendingVehiclePhoto = file;
      const preview = document.getElementById("vehicle-photo-preview");
      if (preview) preview.innerHTML = `<img src="${URL.createObjectURL(file)}" alt="Fahrzeugbild">`;
    }
  };
  camera?.addEventListener("change", () => handlePhoto(camera));
  gallery?.addEventListener("change", () => handlePhoto(gallery));
  document.getElementById("vehicle-photo-remove")?.addEventListener("click", async () => {
    const vehicle = await idbGetById("vehicles", form.dataset.id);
    if (!vehicle) return;
    const oldId = vehicle.photo_attachment_id;
    if (oldId) {
      const old = await idbGetById("attachments", oldId);
      if (old) { old.is_vehicle_image = false; await idbPut("attachments", old); }
    }
    vehicle.photo_attachment_id = null;
    await idbPut("vehicles", vehicle);
    await enqueue("vehicle", "update", form.dataset.id, { photo_attachment_id: null });
    await renderCurrentRoute();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const raw = readFormData(form);
    const fields = {
      name: raw.name, brand: raw.brand || null, model: raw.model || null,
      engine: raw.engine || null, year: numOrNull(raw.year), color: raw.color || null,
      license_plate: raw.license_plate || null, mileage: numOrNull(raw.mileage), fin: raw.fin || null
    };

    if (form.dataset.mode === "edit") {
      await updateVehicle(form.dataset.id, fields);
      location.hash = `#/vehicle/${form.dataset.id}`;
    } else {
      const id = await createVehicle(fields);
      if (form._pendingVehiclePhoto) await createAttachment(id, form._pendingVehiclePhoto, { isVehicleImage: true });
      location.hash = `#/vehicle/${id}`;
    }
  });
}

function bindServiceForm() {
  const form = document.getElementById("service-form");
  const pendingFiles = [];
  const preview = document.getElementById("service-attachment-preview");
  const addFiles = (input) => {
    for (const file of Array.from(input?.files || [])) pendingFiles.push(file);
    if (input) input.value = "";
    if (preview) preview.innerHTML = pendingFiles.map(f => `<div class="selected-file">${attachmentIcon({mime_type:f.type})}<span>${escapeHtml(f.name)}</span><small>${formatFileSize(f.size)}</small></div>`).join("");
  };
  ["service-camera", "service-images", "service-documents"].forEach(id => document.getElementById(id)?.addEventListener("change", e => addFiles(e.target)));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    const originalText = btn?.textContent || "Speichern";
    if (btn) { btn.disabled = true; btn.textContent = "Speichere…"; }
    try {
      const raw = readFormData(form);
      const fields = {
        date: raw.date,
        mileage: numOrNull(raw.mileage),
        service_type: raw.service_type || null,
        workshop: raw.workshop || null,
        cost: numOrNull(raw.cost),
        notes: raw.notes || null,
        next_service_mileage: numOrNull(raw.next_service_mileage),
        next_service_date: raw.next_service_date || null
      };
      for (const [key] of WORK_ITEMS) fields[key] = form.querySelector(`[name="${key}"]`).checked;

      const vehicleId = form.dataset.vehicleId;
      let serviceId;
      if (form.dataset.mode === "edit") {
        serviceId = form.dataset.id;
        await updateService(serviceId, fields);
      } else {
        serviceId = await createService(vehicleId, fields);
      }
      await queueFormFiles(pendingFiles, vehicleId, { serviceId });
      location.hash = `#/vehicle/${vehicleId}`;
      if (navigator.onLine && getToken()) await sync({ rerender: false });
    } catch (err) {
      console.error("Wartung konnte nicht gespeichert werden:", err);
      alert(`Speichern fehlgeschlagen: ${err.message || err}`);
      if (btn) { btn.disabled = false; btn.textContent = originalText; }
    }
  });
}

function bindNoteForm() {
  const form = document.getElementById("note-form");
  const pendingFiles = [];
  const preview = document.getElementById("note-attachment-preview");
  const addFiles = (input) => {
    for (const file of Array.from(input?.files || [])) pendingFiles.push(file);
    if (input) input.value = "";
    if (preview) preview.innerHTML = pendingFiles.map(f => `<div class="selected-file">${attachmentIcon({mime_type:f.type})}<span>${escapeHtml(f.name)}</span><small>${formatFileSize(f.size)}</small></div>`).join("");
  };
  ["note-camera", "note-images", "note-documents"].forEach(id => document.getElementById(id)?.addEventListener("change", e => addFiles(e.target)));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    const originalText = btn?.textContent || "Speichern";
    if (btn) { btn.disabled = true; btn.textContent = "Speichere…"; }
    try {
      const raw = readFormData(form);
      const fields = { title: raw.title || null, content: raw.content || null };
      const vehicleId = form.dataset.vehicleId;
      let noteId;
      if (form.dataset.mode === "edit") {
        noteId = form.dataset.id;
        await updateNote(noteId, fields);
      } else {
        noteId = await createNote(vehicleId, fields);
      }
      await queueFormFiles(pendingFiles, vehicleId, { noteId });
      location.hash = `#/vehicle/${vehicleId}`;
      if (navigator.onLine && getToken()) await sync({ rerender: false });
    } catch (err) {
      console.error("Notiz konnte nicht gespeichert werden:", err);
      alert(`Speichern fehlgeschlagen: ${err.message || err}`);
      if (btn) { btn.disabled = false; btn.textContent = originalText; }
    }
  });
}

function bindSettings() {
  const msgBox = document.getElementById("settings-message");

  updateServerStatus();

  if (window.serverStatusTimer) {
    clearInterval(window.serverStatusTimer);
  }

  window.serverStatusTimer = setInterval(() => {
    updateServerStatus();
  }, 10000);

  document.getElementById("manual-sync-btn").addEventListener("click", async () => {
    const btn = document.getElementById("manual-sync-btn");
    const result = document.getElementById("manual-sync-result");
    if (result) result.textContent = "Synchronisiere…";
    if (btn) btn.disabled = true;
    try {
      const status = await sync({ rerender: true, manual: true });
      if (result) result.textContent = status === "skipped" ? "Nicht synchronisiert: offline oder kein Token." : "Synchronisierung erfolgreich abgeschlossen.";
    } catch (err) {
      if (result) result.textContent = `Synchronisierung fehlgeschlagen: ${err.message || err}`;
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  document.getElementById("export-btn").addEventListener("click", async () => {
    const btn = document.getElementById("export-btn");
    try {
      if (btn) { btn.disabled = true; btn.textContent = "Export wird erstellt…"; }
      const res = await fetch("/api/backup/export", {
        headers: { "Authorization": `Bearer ${getToken()}` }
      });
      if (!res.ok) {
        let detail = "Export fehlgeschlagen";
        try { const data = await res.json(); detail = data.error || detail; } catch (_) {}
        throw new Error(detail);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ServicePlan_Backup_${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      msgBox.innerHTML = `<div class="message success">ZIP-Backup erfolgreich erstellt. Fahrzeuge, Wartungen, Notizen, Bilder und Dokumente sind enthalten.</div>`;
    } catch (err) {
      msgBox.innerHTML = `<div class="message error">${escapeHtml(err.message)}</div>`;
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = "Backup herunterladen"; }
    }
  });

  document.getElementById("import-btn").addEventListener("click", async () => {
    const fileInput = document.getElementById("import-file");
    const file = fileInput.files[0];
    const btn = document.getElementById("import-btn");
    if (!file) {
      msgBox.innerHTML = `<div class="message error">Bitte zuerst eine ZIP- oder JSON-Backup-Datei auswählen.</div>`;
      return;
    }
    try {
      if (btn) { btn.disabled = true; btn.textContent = "Import läuft…"; }
      const form = new FormData();
      form.append("file", file, file.name);
      form.append("clear_existing", document.getElementById("import-clear").checked ? "true" : "false");
      const res = await fetch("/api/backup/import", {
        method: "POST",
        headers: { "Authorization": `Bearer ${getToken()}` },
        body: form
      });
      const text = await res.text();
      let result;
      try { result = text ? JSON.parse(text) : {}; } catch (_) { result = { error: text || "Import fehlgeschlagen" }; }
      if (!res.ok) throw new Error(result.error || "Import fehlgeschlagen");
      msgBox.innerHTML = `<div class="message success">Import erfolgreich: ${result.vehicle_count || 0} Fahrzeuge, ${result.service_count || 0} Wartungen, ${result.note_count || 0} Notizen, ${result.attachment_count || 0} Dateien.</div>`;
      await sync();
    } catch (err) {
      msgBox.innerHTML = `<div class="message error">Import fehlgeschlagen: ${escapeHtml(err.message)}</div>`;
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = "Import starten"; }
    }
  });

  document.getElementById("disconnect-btn").addEventListener("click", async () => {
    if (!confirm("Gerät wirklich trennen? Alle lokalen Daten auf diesem Handy werden gelöscht.")) return;
    await idbClear("vehicles");
    await idbClear("services");
    await idbClear("notes");
    await idbClear("queue");
    localStorage.removeItem("apiToken");
    localStorage.removeItem("lastSync");
    location.hash = "#/";
    await renderCurrentRoute();
  });
}

// ---------- Start ----------

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch(err => console.warn("SW-Registrierung fehlgeschlagen:", err));
  });
}

(async function init() {
  await renderCurrentRoute();

  if (getToken() && navigator.onLine) {
    sync().catch(err => {
      console.warn("Initialer Sync nicht möglich:", err);
    });
  }
})();
