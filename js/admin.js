requireAdminLogin("admin.html");

if (String(sessionStorage.getItem("RUNATION_ADMIN_ACCESS_MODE") || "").toLowerCase() === "external_only") {
  window.location.href = "admin-events.html";
}

let CURRENT_ROWS = [];
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

  const events = data.events || [];
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
    ...CURRENT_ROWS.map(row => headers.map(key => escapeCsv(row[key])).join(","))
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
});