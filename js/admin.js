const adminToken = localStorage.getItem("adminToken");

if (!adminToken) {
  window.location.href = "login.html";
}

const participantsBody = document.getElementById("participantsBody");
const searchInput = document.getElementById("searchInput");
const statusFilter = document.getElementById("statusFilter");
const searchBtn = document.getElementById("searchBtn");
const clearBtn = document.getElementById("clearBtn");
const refreshBtn = document.getElementById("refreshBtn");
const logoutBtn = document.getElementById("logoutBtn");
const exportBtn = document.getElementById("exportBtn");
const message = document.getElementById("message");

const totalCount = document.getElementById("totalCount");
const showingCount = document.getElementById("showingCount");
const paidCount = document.getElementById("paidCount");
const pendingCount = document.getElementById("pendingCount");

const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const pageInfo = document.getElementById("pageInfo");

let limit = 50;
let offset = 0;
let total = 0;
let currentParticipants = [];

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatAmount(amount) {
  const sen = Number(amount) || 0;
  return "RM " + (sen / 100).toFixed(2);
}

function formatDate(value) {
  if (!value) return "-";

  const d = new Date(value);

  if (isNaN(d.getTime())) return value;

  return d.toLocaleString("en-MY", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function statusBadge(status) {
  const s = String(status || "").toUpperCase();

  let className = "badge";

  if (s === "PAID") className += " badge-paid";
  else if (s === "PENDING_PAYMENT") className += " badge-pending";
  else if (s === "FAILED") className += " badge-failed";
  else className += " badge-default";

  return `<span class="${className}">${escapeHtml(s)}</span>`;
}

function setLoading() {
  participantsBody.innerHTML = `
    <tr>
      <td colspan="10" class="empty-cell">Loading registrations...</td>
    </tr>
  `;
}

function showError(text) {
  message.innerHTML = `
    <div class="error-box">
      ${escapeHtml(text)}
    </div>
  `;
}

function clearMessage() {
  message.innerHTML = "";
}

function getCurrentParams() {
  const q = searchInput.value.trim();
  const status = statusFilter.value;

  const params = new URLSearchParams();
  params.set("limit", limit);
  params.set("offset", offset);

  if (q) params.set("q", q);
  if (status) params.set("status", status);

  return params;
}

function getExportParams() {
  const q = searchInput.value.trim();
  const status = statusFilter.value;

  const params = new URLSearchParams();

  if (q) params.set("q", q);
  if (status) params.set("status", status);

  return params;
}

function renderRows(participants) {
  currentParticipants = participants;

  if (!participants.length) {
    participantsBody.innerHTML = `
      <tr>
        <td colspan="10" class="empty-cell">No registration found</td>
      </tr>
    `;
    updateVisibleStats();
    return;
  }

  participantsBody.innerHTML = participants.map(p => {
    return `
      <tr>
        <td><strong>${escapeHtml(p.reg_no)}</strong></td>
        <td class="name-cell">${escapeHtml(p.name)}</td>
        <td>${escapeHtml(p.ic)}</td>
        <td>${escapeHtml(p.phone)}</td>
        <td>${escapeHtml(p.email || "-")}</td>
        <td>${escapeHtml(p.category)}</td>
        <td>${escapeHtml(p.tshirt_size || "-")}</td>
        <td>${formatAmount(p.amount)}</td>
        <td>${statusBadge(p.payment_status)}</td>
        <td>${formatDate(p.paid_at)}</td>
      </tr>
    `;
  }).join("");

  updateVisibleStats();
}

function updateVisibleStats() {
  const paid = currentParticipants.filter(p => p.payment_status === "PAID").length;
  const pending = currentParticipants.filter(p => p.payment_status === "PENDING_PAYMENT").length;

  showingCount.textContent = currentParticipants.length;
  paidCount.textContent = paid;
  pendingCount.textContent = pending;
}

function updatePagination() {
  const page = Math.floor(offset / limit) + 1;
  const totalPages = Math.max(Math.ceil(total / limit), 1);

  pageInfo.textContent = `Page ${page} of ${totalPages}`;

  prevBtn.disabled = offset <= 0;
  nextBtn.disabled = offset + limit >= total;
}

async function loadParticipants() {
  clearMessage();
  setLoading();

  const params = getCurrentParams();

  try {
    const res = await fetch(`/api/participants?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${adminToken}`
      }
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.error || "Failed to load participants");
    }

    total = Number(data.total) || 0;

    totalCount.textContent = total;

    renderRows(data.participants || []);
    updatePagination();

  } catch (err) {
    participantsBody.innerHTML = `
      <tr>
        <td colspan="10" class="empty-cell">Failed to load data</td>
      </tr>
    `;

    if (err.message === "Unauthorized") {
      localStorage.removeItem("adminToken");
      window.location.href = "login.html";
    } else {
      showError(err.message);
    }
  }
}

async function exportCsv() {
  clearMessage();

  exportBtn.disabled = true;
  exportBtn.textContent = "Exporting...";

  const params = getExportParams();

  try {
    const res = await fetch(`/api/export?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${adminToken}`
      }
    });

    if (!res.ok) {
      let errText = await res.text();

      try {
        const parsed = JSON.parse(errText);
        errText = parsed.error || errText;
      } catch (e) {}

      throw new Error(errText || "Export failed");
    }

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);

    const date = new Date().toISOString().slice(0, 10);
    const a = document.createElement("a");
    a.href = url;
    a.download = `runation-registrations-${date}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();

    window.URL.revokeObjectURL(url);

  } catch (err) {
    if (err.message === "Unauthorized") {
      localStorage.removeItem("adminToken");
      window.location.href = "login.html";
    } else {
      showError(err.message);
    }
  } finally {
    exportBtn.disabled = false;
    exportBtn.textContent = "Export CSV";
  }
}

searchBtn.addEventListener("click", () => {
  offset = 0;
  loadParticipants();
});

clearBtn.addEventListener("click", () => {
  searchInput.value = "";
  statusFilter.value = "";
  offset = 0;
  loadParticipants();
});

refreshBtn.addEventListener("click", () => {
  loadParticipants();
});

exportBtn.addEventListener("click", () => {
  exportCsv();
});

logoutBtn.addEventListener("click", () => {
  localStorage.removeItem("adminToken");
  window.location.href = "login.html";
});

searchInput.addEventListener("keydown", e => {
  if (e.key === "Enter") {
    offset = 0;
    loadParticipants();
  }
});

statusFilter.addEventListener("change", () => {
  offset = 0;
  loadParticipants();
});

prevBtn.addEventListener("click", () => {
  if (offset <= 0) return;
  offset -= limit;
  loadParticipants();
});

nextBtn.addEventListener("click", () => {
  if (offset + limit >= total) return;
  offset += limit;
  loadParticipants();
});

loadParticipants();