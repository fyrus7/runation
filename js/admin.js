requireAdminLogin("admin.html");

if (String(sessionStorage.getItem("RUNATION_ADMIN_ACCESS_MODE") || "").toLowerCase() === "external_only") {
  window.location.href = "admin-events.html";
}

let CURRENT_ROWS = [];
let ADMIN_EVENTS = [];
let HAS_LOADED_REGISTRATIONS = false;

function setMessage(message) {
  const el = document.getElementById("adminMessage");
  if (el) el.textContent = message || "";
}

function showParticipantEmptyState(message = "Press Refresh to load participants.") {
  const tbody = document.getElementById("registrationRows");
  if (!tbody) return;

  tbody.innerHTML = `
    <tr>
      <td colspan="16">${message}</td>
    </tr>
  `;
}

function adminHeaders() {
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${getAdminToken()}`
  };
}

function getValue(id) {
  const el = document.getElementById(id);
  return el ? String(el.value || "").trim() : "";
}

function formatMoneySen(value) {
  const num = Number(value || 0);
  return `RM${(num / 100).toFixed(2)}`;
}

function formatDate(value) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString("en-MY", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function escapeCsv(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function statusClass(status) {
  return `status status-${String(status || "").toLowerCase()}`;
}

async function loadEventsForFilter() {
  const select = document.getElementById("eventFilter");
  if (!select) return;

  const role = sessionStorage.getItem("RUNATION_ADMIN_ROLE") || "master";

  const res = await fetch("/api/admin/events", {
    headers: adminHeaders()
  });

  const data = await res.json();

  if (!res.ok || !data.success) {
    return;
  }

  const events = (data.events || []).filter(event => {
    return String(event.registration_mode || "internal").toLowerCase() !== "external";
  });

  ADMIN_EVENTS = events;

  const current = select.value;

  select.innerHTML = role === "event_admin"
    ? ""
    : `<option value="">All Events</option>`;

  events.forEach(event => {
    const opt = document.createElement("option");
    opt.value = event.slug;
    opt.textContent = event.title;
    select.appendChild(opt);
  });

  if (role === "event_admin") {
    const hasCurrent = events.some(event => event.slug === current);

    select.value = hasCurrent
      ? current
      : (events[0]?.slug || "");

    select.disabled = events.length <= 1;
  } else {
    select.value = current;
    select.disabled = false;
  }
}

function buildQuery() {
  const params = new URLSearchParams();

  const eventSlug = getValue("eventFilter");
  const status = getValue("statusFilter");
  const search = getValue("searchInput");

  if (eventSlug) params.set("event_slug", eventSlug);
  if (status) params.set("status", status);
  if (search) params.set("search", search);

  return params.toString();
}

function updateSummary(rows) {
  const total = rows.length;
  const paid = rows.filter(r => String(r.payment_status).toUpperCase() === "PAID").length;
  const pending = rows.filter(r => String(r.payment_status).toUpperCase() === "PENDING_PAYMENT").length;
  const failed = rows.filter(r => String(r.payment_status).toUpperCase() === "FAILED").length;
  const expired = rows.filter(r => String(r.payment_status).toUpperCase() === "EXPIRED").length;

  document.getElementById("sumTotal").textContent = total;
  document.getElementById("sumPaid").textContent = paid;
  document.getElementById("sumPending").textContent = pending;
  document.getElementById("sumFailed").textContent = failed;
}

function findSelectedEvent() {
  const slug = getValue("eventFilter");

  if (!slug) return null;

  return ADMIN_EVENTS.find(event => {
    return String(event.slug || "") === slug;
  }) || null;
}

function renderCategoryGraphMessage(message) {
  const box = document.getElementById("categoryGraphBox");
  if (!box) return;

  box.innerHTML = `<div class="muted">${message}</div>`;
}

function renderCategoryGraph(categories) {
  const box = document.getElementById("categoryGraphBox");
  if (!box) return;

  const activeCategories = (categories || []).filter(cat => {
    return Number(cat.is_active ?? 1) === 1;
  });

  if (!activeCategories.length) {
    renderCategoryGraphMessage("No active categories found.");
    return;
  }

  box.innerHTML = activeCategories.map(cat => {
    const name = String(cat.name || "-");
    const used = Number(cat.used_slots || 0);
    const limit = Number(cat.slot_limit || 0);

    let percent = 0;
    let meta = "";

    if (limit > 0) {
      const balance = Math.max(limit - used, 0);
      percent = Math.min((used / limit) * 100, 100);
      meta = `${used} registered / ${limit} slots · ${balance} balance`;
    } else {
      percent = used > 0 ? 100 : 0;
      meta = `${used} registered · No slot limit`;
    }

    return `
      <div class="category-progress-item">
        <div class="category-progress-head">
          <strong>${name}</strong>
          <span>${Math.round(percent)}%</span>
        </div>

        <div class="category-progress-bar">
          <div style="width:${percent}%"></div>
        </div>

        <div class="category-progress-meta">
          ${meta}
        </div>
      </div>
    `;
  }).join("");
}

async function loadCategoryGraph() {
  const selectedEvent = findSelectedEvent();

  if (!selectedEvent) {
    renderCategoryGraphMessage("Select a specific event to view category progress.");
    return;
  }

  renderCategoryGraphMessage("Loading category progress...");

  try {
    const res = await fetch(`/api/admin/event?id=${encodeURIComponent(selectedEvent.id)}`, {
      headers: adminHeaders()
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      renderCategoryGraphMessage(data.error || "Unable to load category progress.");
      return;
    }

    renderCategoryGraph(data.categories || []);
  } catch (err) {
    renderCategoryGraphMessage(err.message || "Unable to load category progress.");
  }
}

function renderRows(rows) {
  const tbody = document.getElementById("registrationRows");

  if (!rows.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="16">No registrations found.</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = rows.map(row => `
    <tr>
      <td>
        <strong>${row.reg_no || "-"}</strong>
        <div class="muted">${row.payment_ref || ""}</div>
      </td>

      <td>
        <span class="${statusClass(row.payment_status)}">
          ${row.payment_status || "-"}
        </span>
      </td>

      <td>${row.name || "-"}</td>
      <td>${row.ic || "-"}</td>
      <td>${row.phone || "-"}</td>
      <td>${row.email || "-"}</td>
      <td>${row.gender || "-"}</td>
      <td>${row.category || "-"}</td>
      <td>${row.event_tee_size || "-"}</td>
      <td>${row.finisher_tee_size || "-"}</td>

      <td>
        ${row.emergency_name || "-"}
        <div class="muted">${row.emergency_phone || ""}</div>
      </td>

      <td>
        ${row.event_name || "-"}
        <div class="muted">${row.event_slug || ""}</div>
      </td>

      <td>${formatMoneySen(row.amount)}</td>
      <td>${formatDateTime(row.created_at)}</td>
      <td>${formatDateTime(row.paid_at)}</td>

<td>
  <div class="action-buttons">
    <button class="paid-btn" type="button" onclick="registrationAction('${row.reg_no}', 'mark_paid')">
      Paid
    </button>

    <button class="expire-btn" type="button" onclick="registrationAction('${row.reg_no}', 'expire')">
      Expire
    </button>

    <button class="cancel-btn" type="button" onclick="registrationAction('${row.reg_no}', 'cancel')">
      Cancel
    </button>

    <button class="danger" type="button" onclick="deleteRegistration('${row.reg_no}')">
      Delete
    </button>
  </div>
</td>
    </tr>
  `).join("");
}

async function loadRegistrations() {
	HAS_LOADED_REGISTRATIONS = true;
	
  const tbody = document.getElementById("registrationRows");
  tbody.innerHTML = `
    <tr>
      <td colspan="16">Loading...</td>
    </tr>
  `;

  const query = buildQuery();
  const url = query ? `/api/admin/registrations?${query}` : "/api/admin/registrations";

  const res = await fetch(url, {
    headers: adminHeaders()
  });

  const data = await res.json();

  if (!res.ok || !data.success) {
    tbody.innerHTML = `
      <tr>
        <td colspan="16">${data.error || "Unable to load registrations."}</td>
      </tr>
    `;
    return;
  }

CURRENT_ROWS = data.registrations || [];
updateSummary(CURRENT_ROWS);
renderRows(CURRENT_ROWS);
loadCategoryGraph();

setMessage(`${CURRENT_ROWS.length} registrations loaded.`);
}

async function registrationAction(regNo, action) {
  const labels = {
    mark_paid: "mark this registration as PAID",
    expire: "expire this registration",
    cancel: "cancel this registration"
  };

  const confirmText = `Are you sure you want to ${labels[action] || action}?\n\nRegistration No: ${regNo}`;

  if (!confirm(confirmText)) {
    return;
  }

  setMessage("Processing action...");

  const res = await fetch("/api/admin/registration-action", {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({
      reg_no: regNo,
      action
    })
  });

  const data = await res.json();

  if (!res.ok || !data.success) {
    setMessage(data.error || "Action failed.");
    return;
  }

  setMessage(data.message || "Action completed.");
  loadRegistrations();
}

async function deleteRegistration(regNo) {
  const confirmText =
    `Delete this registration permanently?\n\n` +
    `Registration No: ${regNo}\n\n` +
    `This cannot be undone. Export CSV first if needed.`;

  if (!confirm(confirmText)) {
    return;
  }

  setMessage("Deleting registration...");

  const res = await fetch("/api/admin/registration-delete", {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({
      mode: "single",
      reg_no: regNo
    })
  });

  const data = await res.json().catch(() => null);

  if (!res.ok || !data || !data.success) {
    setMessage(data?.error || "Delete failed.");
    return;
  }

  setMessage(data.message || "Registration deleted.");
  loadRegistrations();
}

async function deleteCurrentList() {
  if (!CURRENT_ROWS.length) {
    setMessage("No loaded registrations to delete.");
    return;
  }

  const eventSlug = getValue("eventFilter");
  const status = getValue("statusFilter");
  const search = getValue("searchInput");

  const confirmText =
    `Delete ${CURRENT_ROWS.length} loaded registration(s)?\n\n` +
    `This follows the current Event / Status / Search filter.\n` +
    `Export CSV first if needed.\n\n` +
    `Type DELETE to confirm.`;

  const typed = prompt(confirmText);

  if (typed !== "DELETE") {
    setMessage("Delete cancelled.");
    return;
  }

  setMessage("Deleting current list...");

  const res = await fetch("/api/admin/registration-delete", {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({
      mode: "current_list",
      event_slug: eventSlug,
      status,
      search
    })
  });

  const data = await res.json().catch(() => null);

  if (!res.ok || !data || !data.success) {
    setMessage(data?.error || "Delete current list failed.");
    return;
  }

  CURRENT_ROWS = [];
  updateSummary(CURRENT_ROWS);
  renderRows(CURRENT_ROWS);
  setMessage(data.message || `Deleted ${data.deleted_count || 0} registration(s).`);
}


async function expirePending() {
  setMessage("Checking expired pending payments...");

  const res = await fetch("/api/admin/expire-pending", {
    method: "POST",
    headers: adminHeaders()
  });

  const data = await res.json();

  if (!res.ok || !data.success) {
    setMessage(data.error || "Failed to expire pending payments.");
    return;
  }

  setMessage(
    `Expired ${data.expired_count} pending registrations. Released ${data.released_event_slots} event slots and ${data.released_category_slots} category slots.`
  );

  if (HAS_LOADED_REGISTRATIONS) {
  loadRegistrations();
}
}

function escapeCsvText(value) {
  const text = String(value ?? "").trim();

  if (!text) return "";

  const escaped = text.replace(/"/g, '""');

  return `"=""${escaped}"""`;
}

function formatExportValue(key, value) {
  const forceTextFields = new Set([
    "reg_no",
    "ic",
    "phone",
    "emergency_phone",
    "payment_ref"
  ]);

  if (forceTextFields.has(key)) {
    return escapeCsvText(value);
  }

  return escapeCsv(value);
}

function exportCsv() {
  if (!CURRENT_ROWS.length) {
    setMessage("No data to export.");
    return;
  }

  const headers = [
    "reg_no",
    "payment_status",
    "name",
    "ic",
    "email",
    "phone",
    "gender",
    "category",
    "address",
    "event_tee_size",
    "finisher_tee_size",
    "emergency_name",
    "emergency_phone",
    "event_slug",
    "event_name",
    "amount",
    "payment_ref",
    "payment_url",
    "created_at",
    "paid_at",
    "updated_at"
  ];

  const lines = [
  headers.map(escapeCsv).join(","),
  ...CURRENT_ROWS.map(row => headers.map(key => formatExportValue(key, row[key])).join(","))
];

  const blob = new Blob([lines.join("\n")], {
    type: "text/csv;charset=utf-8"
  });

  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `runation-registrations-${Date.now()}.csv`;
  a.click();

  URL.revokeObjectURL(url);
}

document.addEventListener("DOMContentLoaded", function () {
  showParticipantEmptyState();

  ["eventFilter", "statusFilter"].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;

    el.addEventListener("change", function () {
      if (HAS_LOADED_REGISTRATIONS) {
        loadRegistrations();
      }
    });
  });

  const searchInput = document.getElementById("searchInput");
  if (searchInput) {
    searchInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        loadRegistrations();
      }
    });
  }

  if (getAdminToken()) {
    loadEventsForFilter();
  }

  const role = String(sessionStorage.getItem("RUNATION_ADMIN_ROLE") || "").toLowerCase();
  const accessMode = String(sessionStorage.getItem("RUNATION_ADMIN_ACCESS_MODE") || "").toLowerCase();
  const isMaster = role === "master" || accessMode === "master";

  document.querySelectorAll("[data-master-only]").forEach(el => {
    el.style.display = isMaster ? "" : "none";
  });
  
  const sidebarUsername = document.getElementById("sidebarUsername");
if (sidebarUsername) {
  sidebarUsername.textContent =
    sessionStorage.getItem("RUNATION_ADMIN_USERNAME") ||
    sessionStorage.getItem("RUNATION_ADMIN_ROLE") ||
    "Admin";
}
});