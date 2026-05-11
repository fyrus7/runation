requireAdminLogin("admin-events.html");

const MAX_EVENT_IMAGE_SIZE = 2 * 1024 * 1024;

const ALLOWED_EVENT_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp"
];

let adminToastTimer = null;
let pendingDeleteEventId = null;

function closeAdminToast() {
  const toast = document.getElementById("adminToast");
  if (!toast) return;

  toast.classList.remove("show");

  if (adminToastTimer) {
    clearTimeout(adminToastTimer);
    adminToastTimer = null;
  }
}

function getToastType(message) {
  const text = String(message || "").toLowerCase();

  if (
    text.includes("failed") ||
    text.includes("error") ||
    text.includes("unable") ||
    text.includes("required") ||
    text.includes("unauthorized") ||
    text.includes("not found") ||
    text.includes("cannot")
  ) {
    return "error";
  }

  return "success";
}

function setMessage(message, type) {
  const text = message || "";

  const oldMessage = document.getElementById("adminMessage");
  if (oldMessage) oldMessage.textContent = "";

  const toast = document.getElementById("adminToast");
  const toastText = document.getElementById("adminToastText");

  if (!toast || !toastText) return;

  toastText.textContent = text;

  toast.classList.remove("success", "error");
  toast.classList.add(type || getToastType(text));
  toast.classList.add("show");

  if (adminToastTimer) {
    clearTimeout(adminToastTimer);
  }

  adminToastTimer = setTimeout(() => {
    closeAdminToast();
  }, 10000);
}

function setImageStatus(message, isError = false) {
  const el = document.getElementById("eventImageStatus");
  if (!el) return;

  el.textContent = message || "";
  el.style.color = isError ? "#dc2626" : "#16a34a";
}

function adminHeaders() {
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${getAdminToken()}`
  };
}

function getAdminAccessMode() {
  return String(sessionStorage.getItem("RUNATION_ADMIN_ACCESS_MODE") || "").toLowerCase();
}

function getAdminRole() {
  return String(sessionStorage.getItem("RUNATION_ADMIN_ROLE") || "").toLowerCase();
}

function isMasterAdmin() {
  return getAdminAccessMode() === "master" || getAdminRole() === "master";
}

function isExternalOnlyAdmin() {
  return getAdminAccessMode() === "external_only";
}

function getApprovalStatus(event) {
  return String(event.approval_status || "live").toLowerCase();
}

function renderApprovalText(event) {
  const approvalStatus = getApprovalStatus(event);
  const isVisible = Number(event.is_visible || 0) === 1;
  const mode = String(event.registration_mode || "internal").toLowerCase();

  const modeLabel = mode === "external" ? "External" : "Runation";

  if (approvalStatus === "sandbox") {
    return `
      <div class="muted">
        Publish Status: <strong>${modeLabel} / Sandbox / Pending Approval</strong>
      </div>
    `;
  }

  if (approvalStatus === "live" && isVisible) {
    return `
      <div class="muted">
        Publish Status: <strong>${modeLabel} / Live / Visible</strong>
      </div>
    `;
  }

  if (approvalStatus === "live" && !isVisible) {
    return `
      <div class="muted">
        Publish Status: <strong>${modeLabel} / Live / Hidden</strong>
      </div>
    `;
  }

  return `
    <div class="muted">
      Publish Status: <strong>${modeLabel} / ${escapeHtml(approvalStatus || "-")}</strong>
    </div>
  `;
}

function renderApprovalButton(event) {
  if (!isMasterAdmin()) return "";

  const approvalStatus = getApprovalStatus(event);
  const id = Number(event.id);

  if (approvalStatus === "sandbox") {
    return `
      <button class="secondary" type="button" onclick="eventApprovalAction(${id}, 'approve')">
        Approve Live
      </button>
    `;
  }

  if (approvalStatus === "live") {
    return `
      <button class="secondary" type="button" onclick="eventApprovalAction(${id}, 'return_to_sandbox')">
        Return Sandbox
      </button>
    `;
  }

  return "";
}


function renderDeleteButton(event) {
  if (!isMasterAdmin()) return "";

  return `
    <button class="danger" type="button" onclick="deleteEvent(${Number(event.id)})">
      Delete
    </button>
  `;
}


async function eventApprovalAction(eventId, action) {
  const label = action === "approve"
    ? "approve this event and make it live"
    : "return this event to sandbox";

  if (!confirm(`Are you sure you want to ${label}?\n\nEvent ID: ${eventId}`)) {
    return;
  }

  try {
    const res = await fetch("/api/admin/event-approval", {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify({
        event_id: Number(eventId),
        action
      })
    });

    const data = await res.json().catch(() => null);

    if (!res.ok || !data || !data.success) {
      setMessage(data?.error || "Approval update failed.");
      return;
    }

    setMessage(data.message || "Approval updated.");
    loadEvents();

  } catch (err) {
    setMessage(err.message || "Approval update failed.");
  }
}

function adminAuthHeaders() {
  return {
    "Authorization": `Bearer ${getAdminToken()}`
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

function normalizeUrl(url) {
  const value = String(url || "").trim();

  if (!value) return "";

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  return `https://${value}`;
}

/* =========================
   FORM SHOW / HIDE
========================= */

function hideEventForms() {
  const full = document.getElementById("fullEventForm");
  const external = document.getElementById("externalEventForm");

  if (full) full.hidden = true;
  if (external) external.hidden = true;
}

function showFullEventForm() {
  if (isExternalOnlyAdmin()) {
    showExternalEventForm();
    setMessage("External-only admin can create external events only.");
    return;
  }

  hideEventForms();

  const full = document.getElementById("fullEventForm");
  if (full) full.hidden = false;

  resetForm();

  setTimeout(() => {
    full?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }, 50);
}

function showExternalEventForm() {
  hideEventForms();

  const external = document.getElementById("externalEventForm");
  if (external) external.hidden = false;

  resetExternalEventForm();

  setTimeout(() => {
    external?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }, 50);
}

/* =========================
   DATE HELPERS
========================= */

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

/* =========================
   IMAGE
========================= */

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

function removeEventImage() {
  const fileInput = document.getElementById("eventImageFile");

  if (fileInput) fileInput.value = "";

  setValue("eventImage", "");
  updateEventImagePreview("");
  setImageStatus("Image removed. Click Save Event to apply.");
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

/* =========================
   CATEGORY EDITOR
========================= */

function addCategoryRow(cat = {}) {
  const box = document.getElementById("categoryEditor");
  if (!box) return;

  const row = document.createElement("div");
  row.className = "cat-row";

  const id = escapeHtml(cat.id || "");
  const name = escapeHtml(String(cat.name || "").toUpperCase());
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
    <button type="button" class="danger cat-remove-btn">Remove</button>
  `;

  box.appendChild(row);
}

function getCategoriesFromForm() {
  return Array.from(document.querySelectorAll(".cat-row"))
    .map(row => ({
      id: row.querySelector(".cat-id")?.value || "",
      name: String(row.querySelector(".cat-name")?.value || "").trim().toUpperCase(),
      price: Number(row.querySelector(".cat-price")?.value || 0),
      slot_limit: Number(row.querySelector(".cat-limit")?.value || 0),
      is_active: Number(row.querySelector(".cat-active")?.value || 1)
    }))
    .filter(cat => cat.name);
}

/* =========================
   INTERNAL EVENT FORM
========================= */

function resetForm() {
  const formTitle = document.getElementById("formTitle");
  if (formTitle) formTitle.textContent = "Create Event";

  setValue("editingId", "");

  [
    "slug",
    "title",
    "eventType",
    "venue",
    "organizerName",
    "organizerUrl",
    "eventDate",
    "openAt",
    "closeAt",
    "totalLimit",
    "sortOrder",
    "shortDescription",
    "postageFee"
  ].forEach(id => setValue(id, ""));

  setValue("statusMode", "force_closed");
  setValue("isVisible", "1");
  setValue("showSlotCounter", "0");
  setValue("postageEnabled", "0");

  clearEventImageInput();

  const box = document.getElementById("categoryEditor");
  if (box) box.innerHTML = "";

  addCategoryRow();
}

function buildEventPayload() {
  return {
    registration_mode: "internal",
    external_registration_url: "",

    slug: getValue("slug"),
    title: getValue("title"),
    event_type: getValue("eventType"),
    short_description: getValue("shortDescription"),
    venue: getValue("venue"),
    organizer_name: getValue("organizerName"),
    organizer_url: getValue("organizerUrl"),
    event_date: getValue("eventDate"),
    status_mode: getValue("statusMode"),
    open_at: toIsoMalaysia(getValue("openAt")),
    close_at: toIsoMalaysia(getValue("closeAt")),
    total_limit: Number(getValue("totalLimit") || 0),
    show_slot_counter: Number(getValue("showSlotCounter") || 0),
    is_visible: Number(getValue("isVisible") || 1),
    sort_order: Number(getValue("sortOrder") || 0),
    event_image: getValue("eventImage"),
    postage_enabled: Number(getValue("postageEnabled") || 0),
    postage_fee: Number(getValue("postageFee") || 0),
    categories: getCategoriesFromForm()
  };
}

async function saveEvent() {
  const id = getValue("editingId");
  const payload = buildEventPayload();

  if (!payload.slug || !payload.title) {
    setMessage("Event URL and title are required.");
    return;
  }

  const url = id ? `/api/admin/event?id=${encodeURIComponent(id)}` : "/api/admin/events";
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
    hideEventForms();
    loadEvents();
  } catch (err) {
    setMessage(err.message || "Save failed.");
  }
}

/* =========================
   EXTERNAL EVENT FORM
========================= */

function resetExternalEventForm() {
  [
    "externalEditingId",
    "externalCategoryId",
    "externalSlug",
    "externalRegistrationUrl",
    "externalTitle",
    "externalVenue",
    "externalEventDate",
    "externalCategories",
    "externalSlots",
    "externalOrganizerName",
    "externalOrganizerUrl",
    "externalShortDescription",
    "externalEventImage"
  ].forEach(id => setValue(id, ""));
}

function populateExternalEventForm(event, categories) {
  hideEventForms();

  const external = document.getElementById("externalEventForm");
  if (external) external.hidden = false;

  const firstCategory = (categories || [])[0] || {};

  setValue("externalEditingId", event.id || "");
  setValue("externalCategoryId", firstCategory.id || "");

  setValue("externalSlug", event.slug || "");
  setValue("externalRegistrationUrl", event.external_registration_url || "");
  setValue("externalTitle", event.title || "");
  setValue("externalVenue", event.venue || "");
  setValue("externalEventDate", event.event_date || "");

  setValue(
    "externalCategories",
    (categories || [])
      .map(cat => cat.name)
      .filter(Boolean)
      .join(", ")
      .toUpperCase()
  );

  setValue("externalSlots", Number(event.total_limit || 0) || "");
  setValue("externalOrganizerName", event.organizer_name || "");
  setValue("externalOrganizerUrl", event.organizer_url || "");
  setValue("externalShortDescription", event.short_description || "");
  setValue("externalEventImage", event.event_image || "");

  setTimeout(() => {
    external?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }, 50);
}

async function saveExternalEvent() {
  const id = getValue("externalEditingId");

  const slug = getValue("externalSlug").toLowerCase();
  const title = getValue("externalTitle");
  const externalUrl = normalizeUrl(getValue("externalRegistrationUrl"));
  const categoriesText = getValue("externalCategories").toUpperCase();
  const externalSlots = Number(getValue("externalSlots") || 0);

  if (!slug || !title || !externalUrl) {
    setMessage("Event URL, title, and external registration URL are required.");
    return;
  }

  const payload = {
    registration_mode: "external",
    external_registration_url: externalUrl,

    slug,
    title,
    event_type: "External Event",
    short_description: getValue("externalShortDescription"),
    venue: getValue("externalVenue"),
    event_date: getValue("externalEventDate"),

    status_mode: "force_open",
    open_at: "",
    close_at: "",
    total_limit: externalSlots,
    show_slot_counter: externalSlots > 0 ? 1 : 0,
    is_visible: 1,
    sort_order: 0,

    event_image: getValue("externalEventImage"),
    postage_enabled: 0,
    postage_fee: 0,

    organizer_name: getValue("externalOrganizerName"),
    organizer_url: getValue("externalOrganizerUrl"),

    categories: categoriesText
      ? [
          {
            id: getValue("externalCategoryId"),
            name: categoriesText,
            price: 0,
            slot_limit: 0,
            is_active: 1
          }
        ]
      : []
  };

  const url = id ? `/api/admin/event?id=${encodeURIComponent(id)}` : "/api/admin/events";
  const method = id ? "PATCH" : "POST";

  try {
    const res = await fetch(url, {
      method,
      headers: adminHeaders(),
      body: JSON.stringify(payload)
    });

    const data = await res.json().catch(() => null);

    if (!res.ok || !data || !data.success) {
      setMessage(data?.error || "Save external event failed.");
      return;
    }

    setMessage(id ? "External event updated." : "External event added.");
    resetExternalEventForm();
    hideEventForms();
    loadEvents();
  } catch (err) {
    setMessage(err.message || "Save external event failed.");
  }
}

/* =========================
   EDIT EVENT
========================= */

async function editEvent(id) {
  try {
    const res = await fetch(`/api/admin/event?id=${encodeURIComponent(id)}`, {
      headers: adminHeaders()
    });

    const data = await res.json().catch(() => null);

    if (!res.ok || !data || !data.success) {
      setMessage(data?.error || "Failed to load event.");
      return;
    }

    const event = data.event;
    const categories = data.categories || [];
    const mode = String(event.registration_mode || "internal").toLowerCase();

    if (mode === "external") {
      populateExternalEventForm(event, categories);
      return;
    }

    hideEventForms();

    const full = document.getElementById("fullEventForm");
    if (full) full.hidden = false;

    const formTitle = document.getElementById("formTitle");
    if (formTitle) formTitle.textContent = "Edit Event";

    setValue("editingId", event.id);
    setValue("slug", event.slug || "");
    setValue("title", event.title || "");
    setValue("eventType", event.event_type || "");
    setValue("venue", event.venue || "");
    setValue("organizerName", event.organizer_name || "");
    setValue("organizerUrl", event.organizer_url || "");
    setValue("eventDate", event.event_date || "");
    setValue("statusMode", event.status_mode || "force_closed");
    setValue("openAt", fromIsoToDatetimeLocal(event.open_at));
    setValue("closeAt", fromIsoToDatetimeLocal(event.close_at));
    setValue("totalLimit", event.total_limit || 0);
    setValue("showSlotCounter", String(event.show_slot_counter ?? 0));
    setValue("isVisible", String(event.is_visible ?? 1));
    setValue("sortOrder", event.sort_order || 0);
    setValue("shortDescription", event.short_description || "");
    setValue("postageEnabled", String(event.postage_enabled ?? 0));
    setValue("postageFee", event.postage_fee || "");

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

    setTimeout(() => {
      full?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }, 50);

  } catch (err) {
    setMessage(err.message || "Failed to load event.");
  }
}

/* =========================
   DELETE EVENT
========================= */

function deleteEvent(id) {
  pendingDeleteEventId = Number(id || 0);

  const modal = document.getElementById("deleteEventModal");
  const idText = document.getElementById("deleteEventIdText");
  const input = document.getElementById("deleteEventConfirmInput");
  const error = document.getElementById("deleteEventError");

  if (!modal || !idText || !input) return;

  idText.textContent = pendingDeleteEventId;
  input.value = "";

  if (error) error.textContent = "";

  modal.classList.add("show");

  setTimeout(() => {
    input.focus();
  }, 50);
}

function closeDeleteEventModal() {
  pendingDeleteEventId = null;

  const modal = document.getElementById("deleteEventModal");
  const input = document.getElementById("deleteEventConfirmInput");
  const error = document.getElementById("deleteEventError");

  if (modal) modal.classList.remove("show");
  if (input) input.value = "";
  if (error) error.textContent = "";
}

async function confirmDeleteEvent() {
  const id = Number(pendingDeleteEventId || 0);
  const input = document.getElementById("deleteEventConfirmInput");
  const error = document.getElementById("deleteEventError");

  const typed = String(input?.value || "").trim();

  if (!id) {
    if (error) error.textContent = "Invalid event ID.";
    return;
  }

  if (typed !== String(id)) {
    if (error) error.textContent = `Type Event ID ${id} to confirm delete.`;
    return;
  }

  try {
    const res = await fetch(`/api/admin/event?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: adminHeaders()
    });

    const data = await res.json().catch(() => null);

    if (!res.ok || !data || !data.success) {
      if (error) error.textContent = data?.error || "Delete failed.";
      return;
    }

    const editingId = getValue("editingId");
    const externalEditingId = getValue("externalEditingId");

    if (String(editingId) === String(id)) {
      resetForm();
      hideEventForms();
    }

    if (String(externalEditingId) === String(id)) {
      resetExternalEventForm();
      hideEventForms();
    }

    closeDeleteEventModal();
    setMessage("Event deleted.");
    loadEvents();

  } catch (err) {
    if (error) error.textContent = err.message || "Delete failed.";
  }
}

/* =========================
   EVENT LIST
========================= */

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
      const mode = String(event.registration_mode || "internal").toLowerCase();
      const modeText = mode === "external" ? "External" : "Runation";
      const usedSlots = escapeHtml(event.used_slots || 0);
      const totalLimit = escapeHtml(event.total_limit || "Unlimited");
      const status = escapeHtml(event.status);
      const imageText = event.event_image ? "Yes" : "No";

      const postageText = Number(event.postage_enabled || 0) === 1
        ? `On - RM${Number(event.postage_fee || 0).toFixed(2)}`
        : "Off";

      return `
        <div class="event-row">
          <div class="event-row-top">
            <div>
              <h3>${title}</h3>
              <div class="muted">Slug: ${slug}</div>
              <div class="muted">Mode: ${modeText}</div>
              <div class="muted">Date: ${date}</div>
              <div class="muted">Registered: ${usedSlots} / ${totalLimit}</div>
              ${renderApprovalText(event)}
              <div class="muted">Image: ${imageText}</div>
              <div class="muted">Postage: ${postageText}</div>
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

${renderApprovalButton(event)}

${renderDeleteButton(event)}

          </div>
        </div>
      `;
    }).join("");

  } catch (err) {
    box.innerHTML = `<div class="muted">${escapeHtml(err.message || "Unable to load events.")}</div>`;
  }
}

function lockExternalOnlyUi() {
  if (!isExternalOnlyAdmin()) return;

  document.querySelectorAll("button, a").forEach(el => {
    const onclick = String(el.getAttribute("onclick") || "");
    const text = String(el.textContent || "").toLowerCase();

    if (
      onclick.includes("showFullEventForm") ||
      text === "create event" ||
      text === "add event"
    ) {
      el.style.display = "none";
    }
  });
}

/* =========================
   GLOBAL EVENTS
========================= */

document.addEventListener("click", function (e) {
  if (!e.target) return;

  if (e.target.classList.contains("cat-remove-btn")) {
    const row = e.target.closest(".cat-row");
    const rows = document.querySelectorAll(".cat-row");

    if (!row) return;

    if (rows.length <= 1) {
      row.querySelector(".cat-id").value = "";
      row.querySelector(".cat-name").value = "";
      row.querySelector(".cat-price").value = "";
      row.querySelector(".cat-limit").value = "0";
      row.querySelector(".cat-active").value = "1";
      return;
    }

    row.remove();
  }
});

document.addEventListener("input", function (e) {
  if (!e.target) return;

  if (
    e.target.id === "externalCategories" ||
    e.target.classList.contains("cat-name")
  ) {
    const start = e.target.selectionStart;
    const end = e.target.selectionEnd;

    e.target.value = String(e.target.value || "").toUpperCase();

    try {
      e.target.setSelectionRange(start, end);
    } catch (err) {}
  }
});

/* =========================
   INIT
========================= */

document.addEventListener("DOMContentLoaded", function () {
  resetForm();
  resetExternalEventForm();
  hideEventForms();
  
  if (isExternalOnlyAdmin()) {
	  showExternalEventForm();
	  lockExternalOnlyUi();
  }

  const uploadBtn = document.getElementById("uploadEventImageBtn");
  if (uploadBtn) {
    uploadBtn.addEventListener("click", uploadEventImage);
  }

  const removeImageBtn = document.getElementById("removeEventImageBtn");
  if (removeImageBtn) {
    removeImageBtn.addEventListener("click", removeEventImage);
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

  const eventImageInput = document.getElementById("eventImage");
  if (eventImageInput) {
    eventImageInput.addEventListener("input", function () {
      const url = getValue("eventImage");

      updateEventImagePreview(url);

      if (url) {
        setImageStatus("Image URL ready. Click Save Event to apply.");
      } else {
        setImageStatus("");
      }
    });
  }

  if (getAdminToken()) {
    loadEvents();
  }
  
    const role = String(sessionStorage.getItem("RUNATION_ADMIN_ROLE") || "").toLowerCase();
  const accessMode = String(sessionStorage.getItem("RUNATION_ADMIN_ACCESS_MODE") || "").toLowerCase();
  const isMaster = role === "master" || accessMode === "master";

  document.querySelectorAll("[data-master-only]").forEach(el => {
    el.style.display = isMaster ? "" : "none";
  });
});
