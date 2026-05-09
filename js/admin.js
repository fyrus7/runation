const ADMIN_TOKEN_NOW = sessionStorage.getItem("RUNATION_ADMIN_TOKEN") || "";

if (!ADMIN_TOKEN_NOW) {
  location.replace(`login.html?next=${encodeURIComponent("admin.html")}`);
}

function setMessage(message) {
  const el = document.getElementById("adminMessage");
  if (el) el.textContent = message || "";
}

function getToken() {
  return sessionStorage.getItem("RUNATION_ADMIN_TOKEN") || "";
}

function saveToken() {
  const token = document.getElementById("adminToken").value.trim();
  sessionStorage.setItem("RUNATION_ADMIN_TOKEN", token);
  setMessage("Token saved for this session.");
  loadEvents();
}

function logoutAdmin() {
  sessionStorage.removeItem("RUNATION_ADMIN_TOKEN");
  location.href = "login.html";
}

function adminHeaders() {
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${getToken()}`
  };
}

function getValue(id) {
  const el = document.getElementById(id);
  return el ? String(el.value || "").trim() : "";
}

function toIsoMalaysia(datetimeLocalValue) {
  if (!datetimeLocalValue) return "";
  return `${datetimeLocalValue}:00+08:00`;
}

function fromIsoToDatetimeLocal(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const pad = n => String(n).padStart(2, "0");

  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join("-") + "T" + [
    pad(date.getHours()),
    pad(date.getMinutes())
  ].join(":");
}

function addCategoryRow(cat = {}) {
  const box = document.getElementById("categoryEditor");

  const row = document.createElement("div");
  row.className = "cat-row";
  row.innerHTML = `
    <input class="cat-id" type="hidden" value="${cat.id || ""}">
    <input class="cat-name" placeholder="Category e.g. 21KM" value="${cat.name || ""}">
    <input class="cat-price" type="number" step="0.01" placeholder="Price RM" value="${cat.price || ""}">
    <input class="cat-limit" type="number" placeholder="Limit" value="${cat.slot_limit || 0}">
    <select class="cat-active">
      <option value="1" ${Number(cat.is_active ?? 1) === 1 ? "selected" : ""}>Active</option>
      <option value="0" ${Number(cat.is_active ?? 1) === 0 ? "selected" : ""}>Inactive</option>
    </select>
  `;

  box.appendChild(row);
}

function getCategoriesFromForm() {
  return Array.from(document.querySelectorAll(".cat-row")).map(row => ({
    id: row.querySelector(".cat-id").value || "",
    name: row.querySelector(".cat-name").value.trim(),
    price: Number(row.querySelector(".cat-price").value || 0),
    slot_limit: Number(row.querySelector(".cat-limit").value || 0),
    is_active: Number(row.querySelector(".cat-active").value || 1)
  })).filter(cat => cat.name);
}

function resetForm() {
  document.getElementById("formTitle").textContent = "Create Event";
  document.getElementById("editingId").value = "";

  [
    "slug",
    "title",
    "eventType",
    "venue",
    "eventDate",
    "openAt",
    "closeAt",
    "totalLimit",
    "sortOrder",
    "shortDescription"
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });

  document.getElementById("statusMode").value = "force_closed";
  document.getElementById("isVisible").value = "1";
  document.getElementById("categoryEditor").innerHTML = "";

  addCategoryRow();
}

function buildEventPayload() {
  return {
    slug: getValue("slug"),
    title: getValue("title"),
    event_type: getValue("eventType"),
    short_description: getValue("shortDescription"),
    venue: getValue("venue"),
    event_date: getValue("eventDate"),
    status_mode: getValue("statusMode"),
    open_at: toIsoMalaysia(getValue("openAt")),
    close_at: toIsoMalaysia(getValue("closeAt")),
    total_limit: Number(getValue("totalLimit") || 0),
    is_visible: Number(getValue("isVisible") || 1),
    sort_order: Number(getValue("sortOrder") || 0),
    categories: getCategoriesFromForm()
  };
}

async function saveEvent() {
  const id = getValue("editingId");
  const payload = buildEventPayload();

  if (!payload.slug || !payload.title) {
    setMessage("Slug and title are required.");
    return;
  }

  const url = id ? `/api/admin/events/${id}` : "/api/admin/events";
  const method = id ? "PATCH" : "POST";

  const res = await fetch(url, {
    method,
    headers: adminHeaders(),
    body: JSON.stringify(payload)
  });

  const data = await res.json();

  if (!res.ok || !data.success) {
    setMessage(data.error || "Save failed.");
    return;
  }

  setMessage(id ? "Event updated." : "Event created.");
  resetForm();
  loadEvents();
}

async function editEvent(id) {
  const res = await fetch(`/api/admin/events/${id}`, {
    headers: adminHeaders()
  });

  const data = await res.json();

  if (!res.ok || !data.success) {
    setMessage(data.error || "Failed to load event.");
    return;
  }

  const event = data.event;
  const categories = data.categories || [];

  document.getElementById("formTitle").textContent = "Edit Event";
  document.getElementById("editingId").value = event.id;

  document.getElementById("slug").value = event.slug || "";
  document.getElementById("title").value = event.title || "";
  document.getElementById("eventType").value = event.event_type || "";
  document.getElementById("venue").value = event.venue || "";
  document.getElementById("eventDate").value = event.event_date || "";
  document.getElementById("statusMode").value = event.status_mode || "force_closed";
  document.getElementById("openAt").value = fromIsoToDatetimeLocal(event.open_at);
  document.getElementById("closeAt").value = fromIsoToDatetimeLocal(event.close_at);
  document.getElementById("totalLimit").value = event.total_limit || 0;
  document.getElementById("isVisible").value = String(event.is_visible ?? 1);
  document.getElementById("sortOrder").value = event.sort_order || 0;
  document.getElementById("shortDescription").value = event.short_description || "";

  const box = document.getElementById("categoryEditor");
  box.innerHTML = "";

  if (categories.length) {
    categories.forEach(cat => addCategoryRow(cat));
  } else {
    addCategoryRow();
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function loadEvents() {
  const box = document.getElementById("eventList");

  const res = await fetch("/api/admin/events", {
    headers: adminHeaders()
  });

  const data = await res.json();

  if (!res.ok || !data.success) {
    box.innerHTML = `<div class="muted">${data.error || "Unable to load events."}</div>`;
    return;
  }

  const events = data.events || [];

  if (!events.length) {
    box.innerHTML = `<div class="muted">No events yet.</div>`;
    return;
  }

  box.innerHTML = events.map(event => `
    <div class="event-row">
      <div class="event-row-top">
        <div>
          <h3>${event.title}</h3>
          <div class="muted">Slug: ${event.slug}</div>
          <div class="muted">Date: ${event.event_date || "-"}</div>
          <div class="muted">Registered: ${event.used_slots || 0} / ${event.total_limit || "Unlimited"}</div>
          <div class="muted">Visible: ${Number(event.is_visible) === 1 ? "Yes" : "No"}</div>
        </div>

        <div>
          <span class="status-pill">${event.status}</span>
        </div>
      </div>

      <div class="button-row">
        <button type="button" onclick="editEvent(${event.id})">Edit</button>
        <a href="event.html?event=${encodeURIComponent(event.slug)}" target="_blank">
          <button class="secondary" type="button">Open Page</button>
        </a>
      </div>
    </div>
  `).join("");
}

document.addEventListener("DOMContentLoaded", function () {
  document.getElementById("adminToken").value = getToken();

  resetForm();

  if (getToken()) {
    loadEvents();
  }
});