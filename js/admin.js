const ADMIN_TOKEN_NOW = sessionStorage.getItem("RUNATION_ADMIN_TOKEN") || "";

if (!ADMIN_TOKEN_NOW) {
  location.replace(`login.html?next=${encodeURIComponent("admin.html")}`);
}

const MAX_EVENT_IMAGE_SIZE = 2 * 1024 * 1024;

const ALLOWED_EVENT_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp"
];

function setMessage(message) {
  const el = document.getElementById("adminMessage");
  if (el) el.textContent = message || "";
}

function setImageStatus(message, isError = false) {
  const el = document.getElementById("eventImageStatus");
  if (!el) return;

  el.textContent = message || "";
  el.style.color = isError ? "#dc2626" : "#16a34a";
}

function getToken() {
  return sessionStorage.getItem("RUNATION_ADMIN_TOKEN") || "";
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

function adminAuthHeaders() {
  return {
    "Authorization": `Bearer ${getToken()}`
  };
}

function getValue(id) {
  const el = document.getElementById(id);
  return el ? String(el.value || "").trim() : "";
}

function setValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value ?? "";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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

function updateEventImagePreview(url) {
  const preview = document.getElementById("eventImagePreview");

  if (!preview) return;

  if (url) {
    preview.src = url;
    preview.style.display = "block";
  } else {
    preview.removeAttribute("src");
    preview.style.display = "none";
  }
}

function clearEventImageInput() {
  const fileInput = document.getElementById("eventImageFile");
  if (fileInput) fileInput.value = "";

  setValue("eventImage", "");
  updateEventImagePreview("");
  setImageStatus("");
}

function addCategoryRow(cat = {}) {
  const box = document.getElementById("categoryEditor");
  if (!box) return;

  const row = document.createElement("div");
  row.className = "cat-row";

  const id = escapeHtml(cat.id || "");
  const name = escapeHtml(cat.name || "");
  const price = escapeHtml(cat.price || "");
  const limit = escapeHtml(cat.slot_limit || 0);
  const active = Number(cat.is_active ?? 1);

  row.innerHTML = `
    <input class="cat-id" type="hidden" value="${id}">
    <input class="cat-name" placeholder="Category e.g. 21KM" value="${name}">
    <input class="cat-price" type="number" step="0.01" placeholder="Price RM" value="${price}">
    <input class="cat-limit" type="number" placeholder="Limit" value="${limit}">
    <select class="cat-active">
      <option value="1" ${active === 1 ? "selected" : ""}>Active</option>
      <option value="0" ${active === 0 ? "selected" : ""}>Inactive</option>
    </select>
  `;

  box.appendChild(row);
}

function getCategoriesFromForm() {
  return Array.from(document.querySelectorAll(".cat-row"))
    .map(row => ({
      id: row.querySelector(".cat-id")?.value || "",
      name: row.querySelector(".cat-name")?.value.trim() || "",
      price: Number(row.querySelector(".cat-price")?.value || 0),
      slot_limit: Number(row.querySelector(".cat-limit")?.value || 0),
      is_active: Number(row.querySelector(".cat-active")?.value || 1)
    }))
    .filter(cat => cat.name);
}

function resetForm() {
  const formTitle = document.getElementById("formTitle");
  if (formTitle) formTitle.textContent = "Create Event";

  setValue("editingId", "");

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
  ].forEach(id => setValue(id, ""));

  setValue("statusMode", "force_closed");
  setValue("isVisible", "1");
  setValue("showSlotCounter", "0");

  clearEventImageInput();

  const box = document.getElementById("categoryEditor");
  if (box) box.innerHTML = "";

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
    show_slot_counter: Number(getValue("showSlotCounter") || 0),
    is_visible: Number(getValue("isVisible") || 1),
    sort_order: Number(getValue("sortOrder") || 0),
    event_image: getValue("eventImage"),
    categories: getCategoriesFromForm()
  };
}

async function uploadEventImage() {
  const fileInput = document.getElementById("eventImageFile");
  const slug = getValue("slug");

  if (!slug) {
    setImageStatus("Fill slug first before upload image.", true);
    return;
  }

  if (!fileInput || !fileInput.files || !fileInput.files[0]) {
    setImageStatus("Choose image first.", true);
    return;
  }

  const file = fileInput.files[0];

  if (!ALLOWED_EVENT_IMAGE_TYPES.includes(file.type)) {
    setImageStatus("Only JPG, PNG, or WEBP allowed.", true);
    return;
  }

  if (file.size > MAX_EVENT_IMAGE_SIZE) {
    setImageStatus("Image must be below 2MB.", true);
    return;
  }

  const formData = new FormData();
  formData.append("image", file);
  formData.append("event", slug);

  setImageStatus("Uploading image...");

  try {
    const res = await fetch("/api/admin/upload-image", {
      method: "POST",
      headers: adminAuthHeaders(),
      body: formData
    });

    const data = await res.json().catch(() => null);

    if (!res.ok || !data || !data.success) {
      setImageStatus(data?.error || "Image upload failed.", true);
      return;
    }

    setValue("eventImage", data.url || "");
    updateEventImagePreview(data.url || "");
    setImageStatus("Image uploaded.");
  } catch (err) {
    setImageStatus(err.message || "Image upload failed.", true);
  }
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

  try {
    const res = await fetch(url, {
      method,
      headers: adminHeaders(),
      body: JSON.stringify(payload)
    });

    const data = await res.json().catch(() => null);

    if (!res.ok || !data || !data.success) {
      setMessage(data?.error || "Save failed.");
      return;
    }

    setMessage(id ? "Event updated." : "Event created.");
    resetForm();
    loadEvents();
  } catch (err) {
    setMessage(err.message || "Save failed.");
  }
}

async function editEvent(id) {
  try {
    const res = await fetch(`/api/admin/events/${id}`, {
      headers: adminHeaders()
    });

    const data = await res.json().catch(() => null);

    if (!res.ok || !data || !data.success) {
      setMessage(data?.error || "Failed to load event.");
      return;
    }

    const event = data.event;
    const categories = data.categories || [];

    const formTitle = document.getElementById("formTitle");
    if (formTitle) formTitle.textContent = "Edit Event";

    setValue("editingId", event.id);
    setValue("slug", event.slug || "");
    setValue("title", event.title || "");
    setValue("eventType", event.event_type || "");
    setValue("venue", event.venue || "");
    setValue("eventDate", event.event_date || "");
    setValue("statusMode", event.status_mode || "force_closed");
    setValue("openAt", fromIsoToDatetimeLocal(event.open_at));
    setValue("closeAt", fromIsoToDatetimeLocal(event.close_at));
    setValue("totalLimit", event.total_limit || 0);
    setValue("showSlotCounter", String(event.show_slot_counter ?? 0));
    setValue("isVisible", String(event.is_visible ?? 1));
    setValue("sortOrder", event.sort_order || 0);
    setValue("shortDescription", event.short_description || "");

    setValue("eventImage", event.event_image || "");
    updateEventImagePreview(event.event_image || "");
    setImageStatus(event.event_image ? "Current image loaded." : "");

    const fileInput = document.getElementById("eventImageFile");
    if (fileInput) fileInput.value = "";

    const box = document.getElementById("categoryEditor");
    if (box) box.innerHTML = "";

    if (categories.length) {
      categories.forEach(cat => addCategoryRow(cat));
    } else {
      addCategoryRow();
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (err) {
    setMessage(err.message || "Failed to load event.");
  }
}

async function loadEvents() {
  const box = document.getElementById("eventList");
  if (!box) return;

  try {
    const res = await fetch("/api/admin/events", {
      headers: adminHeaders()
    });

    const data = await res.json().catch(() => null);

    if (!res.ok || !data || !data.success) {
      box.innerHTML = `<div class="muted">${escapeHtml(data?.error || "Unable to load events.")}</div>`;
      return;
    }

    const events = data.events || [];

    if (!events.length) {
      box.innerHTML = `<div class="muted">No events yet.</div>`;
      return;
    }

    box.innerHTML = events.map(event => {
      const title = escapeHtml(event.title);
      const slug = escapeHtml(event.slug);
      const date = escapeHtml(event.event_date || "-");
      const usedSlots = escapeHtml(event.used_slots || 0);
      const totalLimit = escapeHtml(event.total_limit || "Unlimited");
      const visible = Number(event.is_visible) === 1 ? "Yes" : "No";
      const status = escapeHtml(event.status);
      const imageText = event.event_image ? "Yes" : "No";

      return `
        <div class="event-row">
          <div class="event-row-top">
            <div>
              <h3>${title}</h3>
              <div class="muted">Slug: ${slug}</div>
              <div class="muted">Date: ${date}</div>
              <div class="muted">Registered: ${usedSlots} / ${totalLimit}</div>
              <div class="muted">Visible: ${visible}</div>
              <div class="muted">Image: ${imageText}</div>
            </div>

            <div>
              <span class="status-pill">${status}</span>
            </div>
          </div>

          <div class="button-row">
            <button type="button" onclick="editEvent(${Number(event.id)})">Edit</button>
            <a href="event.html?event=${encodeURIComponent(event.slug)}" target="_blank">
              <button class="secondary" type="button">Open Page</button>
            </a>
          </div>
        </div>
      `;
    }).join("");
  } catch (err) {
    box.innerHTML = `<div class="muted">${escapeHtml(err.message || "Unable to load events.")}</div>`;
  }
}

document.addEventListener("DOMContentLoaded", function () {
  resetForm();

  const uploadBtn = document.getElementById("uploadEventImageBtn");
  if (uploadBtn) {
    uploadBtn.addEventListener("click", uploadEventImage);
  }

  const imageInput = document.getElementById("eventImageFile");
  if (imageInput) {
    imageInput.addEventListener("change", function () {
      const file = imageInput.files && imageInput.files[0];

      if (!file) {
        setImageStatus("");
        return;
      }

      if (!ALLOWED_EVENT_IMAGE_TYPES.includes(file.type)) {
        setImageStatus("Only JPG, PNG, or WEBP allowed.", true);
        return;
      }

      if (file.size > MAX_EVENT_IMAGE_SIZE) {
        setImageStatus("Image must be below 2MB.", true);
        return;
      }

      setImageStatus("Image ready to upload.");
    });
  }

  if (getToken()) {
    loadEvents();
  }
});