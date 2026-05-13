requireAdminLogin("admin-users.html");

let ADMIN_USERS = [];

function getAdminToken() {
  return sessionStorage.getItem("RUNATION_ADMIN_TOKEN") || "";
}

function requireAdminLogin(currentPage) {
  const token = getAdminToken();

  if (!token) {
    window.location.href = `login.html?next=${encodeURIComponent(currentPage || "admin.html")}`;
    return;
  }
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

function setValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value ?? "";
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value ?? "";
}

function setMessage(message) {
  setText("adminUsersMessage", message || "");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function isMasterAdmin() {
  const role = String(sessionStorage.getItem("RUNATION_ADMIN_ROLE") || "").toLowerCase();
  const accessMode = String(sessionStorage.getItem("RUNATION_ADMIN_ACCESS_MODE") || "").toLowerCase();

  return role === "master" || accessMode === "master";
}

function logoutAdmin() {
  sessionStorage.removeItem("RUNATION_ADMIN_TOKEN");
  sessionStorage.removeItem("RUNATION_ADMIN_USERNAME");
  sessionStorage.removeItem("RUNATION_ADMIN_ROLE");
  sessionStorage.removeItem("RUNATION_ADMIN_ACCESS_MODE");
  sessionStorage.removeItem("RUNATION_ADMIN_EVENT");

  window.location.href = "login.html";
}

function resetUserForm() {
  setValue("editingUserId", "");
  setValue("adminUsername", "");
  setValue("adminPassword", "");
  setValue("adminAccessMode", "own_event");
  setValue("adminEventSlug", "");
  setValue("adminIsActive", "1");

  const title = document.getElementById("userFormTitle");
  if (title) title.textContent = "Create Admin User";

  setMessage("");
}

function updateStats() {
  const total = ADMIN_USERS.length;
  const active = ADMIN_USERS.filter(u => Number(u.is_active || 0) === 1).length;
  const external = ADMIN_USERS.filter(u => String(u.access_mode || "") === "external_only").length;
  const ownEvent = ADMIN_USERS.filter(u => String(u.access_mode || "") === "own_event").length;

  setText("statTotalUsers", total);
  setText("statActiveUsers", active);
  setText("statExternalUsers", external);
  setText("statOwnEventUsers", ownEvent);
}

function renderAccessBadge(accessMode) {
  const label = accessMode === "external_only"
    ? "External Only"
    : "Own Event";

  return `<span class="badge badge-default">${escapeHtml(label)}</span>`;
}

function renderStatusBadge(isActive) {
  const active = Number(isActive || 0) === 1;

  return active
    ? `<span class="badge badge-paid">Active</span>`
    : `<span class="badge badge-failed">Inactive</span>`;
}

function renderUsers() {
  const tbody = document.getElementById("adminUsersRows");
  if (!tbody) return;

  updateStats();

  if (!ADMIN_USERS.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="empty-cell">No admin users found.</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = ADMIN_USERS.map(user => `
    <tr>
      <td>
        <div class="name-cell">${escapeHtml(user.username)}</div>
        <div class="muted">ID: ${Number(user.id)}</div>
      </td>

      <td>${renderAccessBadge(String(user.access_mode || "own_event"))}</td>

      <td>${escapeHtml(user.event_slug || "-")}</td>

      <td>${Number(user.owned_event_count || 0)}</td>

      <td>${renderStatusBadge(user.is_active)}</td>

      <td>${escapeHtml(user.updated_at || "-")}</td>

      <td>
        <div class="action-buttons">
          <button type="button" class="secondary" onclick="editAdminUser(${Number(user.id)})">
            Edit
          </button>

          <button type="button" class="danger" onclick="deleteAdminUser(${Number(user.id)})">
            Delete
          </button>
        </div>
      </td>
    </tr>
  `).join("");
}

async function loadAdminUsers() {
  const tbody = document.getElementById("adminUsersRows");

  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="empty-cell">Loading...</td>
      </tr>
    `;
  }

  try {
    const res = await fetch("/api/admin/users", {
      headers: adminHeaders()
    });

    const data = await res.json().catch(() => null);

    if (!res.ok || !data || !data.success) {
      if (tbody) {
        tbody.innerHTML = `
          <tr>
            <td colspan="7" class="empty-cell">${escapeHtml(data?.error || "Unable to load users.")}</td>
          </tr>
        `;
      }
      return;
    }

    ADMIN_USERS = data.users || [];
    renderUsers();

  } catch (err) {
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="empty-cell">${escapeHtml(err.message || "Unable to load users.")}</td>
        </tr>
      `;
    }
  }
}

async function saveAdminUser() {
  if (!isMasterAdmin()) {
    setMessage("Master only.");
    return;
  }

  const id = getValue("editingUserId");
  const username = getValue("adminUsername").toLowerCase();
  const password = getValue("adminPassword");
  const accessMode = getValue("adminAccessMode") || "own_event";
  const eventSlug = getValue("adminEventSlug").toLowerCase();
  const isActive = Number(getValue("adminIsActive") || 1);

  if (!username) {
    setMessage("Username is required.");
    return;
  }

  if (!id && !password) {
    setMessage("Password is required for new user.");
    return;
  }

  try {
    const url = id
      ? `/api/admin/users?id=${encodeURIComponent(id)}`
      : "/api/admin/users";

    const method = id ? "PATCH" : "POST";

    const res = await fetch(url, {
      method,
      headers: adminHeaders(),
      body: JSON.stringify({
        username,
        password,
        role: "event_admin",
        access_mode: accessMode,
        event_slug: eventSlug,
        is_active: isActive
      })
    });

    const data = await res.json().catch(() => null);

    if (!res.ok || !data || !data.success) {
      setMessage(data?.error || "Save admin user failed.");
      return;
    }

    setMessage(data.message || "Admin user saved.");
    resetUserForm();
    await loadAdminUsers();

  } catch (err) {
    setMessage(err.message || "Save admin user failed.");
  }
}

function editAdminUser(id) {
  const user = ADMIN_USERS.find(item => Number(item.id) === Number(id));

  if (!user) {
    setMessage("Admin user not found.");
    return;
  }

  setValue("editingUserId", user.id);
  setValue("adminUsername", user.username || "");
  setValue("adminPassword", "");
  setValue("adminAccessMode", user.access_mode || "own_event");
  setValue("adminEventSlug", user.event_slug || "");
  setValue("adminIsActive", String(user.is_active ?? 1));

  const title = document.getElementById("userFormTitle");
  if (title) title.textContent = `Edit Admin User #${user.id}`;

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });

  setMessage("Editing user. Leave password blank to keep current password.");
}

async function deleteAdminUser(id) {
  const user = ADMIN_USERS.find(item => Number(item.id) === Number(id));

  if (!user) {
    setMessage("Admin user not found.");
    return;
  }

  if (!confirm(`Delete admin user "${user.username}"?\n\nThis will remove login sessions and unassign owned events.`)) {
    return;
  }

  try {
    const res = await fetch(`/api/admin/users?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: adminHeaders()
    });

    const data = await res.json().catch(() => null);

    if (!res.ok || !data || !data.success) {
      setMessage(data?.error || "Delete admin user failed.");
      return;
    }

    setMessage(data.message || "Admin user deleted.");
    resetUserForm();
    await loadAdminUsers();

  } catch (err) {
    setMessage(err.message || "Delete admin user failed.");
  }
}

document.addEventListener("DOMContentLoaded", function () {
  if (!isMasterAdmin()) {
    window.location.href = "admin.html";
    return;
  }

  setText(
    "sidebarUsername",
    sessionStorage.getItem("RUNATION_ADMIN_USERNAME") || "Master"
  );

  loadAdminUsers();
});