const ADMIN_TOKEN_NOW = sessionStorage.getItem("RUNATION_ADMIN_TOKEN") || "";

if (!ADMIN_TOKEN_NOW) {
  location.replace(`login.html?next=${encodeURIComponent("admin-registrations.html")}`);
}

let CURRENT_ROWS = [];

function setMessage(message) {
  const el = document.getElementById("adminMessage");
  if (el) el.textContent = message || "";
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

  const res = await fetch("/api/admin/events", {
    headers: adminHeaders()
  });

  const data = await res.json();

  if (!res.ok || !data.success) {
    return;
  }

  const current = select.value;

  select.innerHTML = `<option value="">All Events</option>`;

  (data.events || []).forEach(event => {
    const opt = document.createElement("option");
    opt.value = event.slug;
    opt.textContent = event.title;
    select.appendChild(opt);
  });

  select.value = current;
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
        <td colspan="15">No registrations found.</td>
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
      <td>${formatDate(row.created_at)}</td>
      <td>${formatDate(row.paid_at)}</td>
    </tr>
  `).join("");
}

async function loadRegistrations() {
  const tbody = document.getElementById("registrationRows");
  tbody.innerHTML = `
    <tr>
      <td colspan="15">Loading...</td>
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
        <td colspan="15">${data.error || "Unable to load registrations."}</td>
      </tr>
    `;
    return;
  }

  CURRENT_ROWS = data.registrations || [];
  updateSummary(CURRENT_ROWS);
  renderRows(CURRENT_ROWS);

  setMessage(`${CURRENT_ROWS.length} registrations loaded.`);
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

  ["eventFilter", "statusFilter"].forEach(id => {
    document.getElementById(id).addEventListener("change", loadRegistrations);
  });

  document.getElementById("searchInput").addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      loadRegistrations();
    }
  });

  if (getToken()) {
    loadEventsForFilter();
    loadRegistrations();
  }
});