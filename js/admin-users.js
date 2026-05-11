requireAdminLogin("admin-users.html");

function getAdminToken() {
  return sessionStorage.getItem("RUNATION_ADMIN_TOKEN") || "";
}

function getValue(id) {
  const el = document.getElementById(id);
  return el ? String(el.value || "").trim() : "";
}

function setMessage(message) {
  const el = document.getElementById("adminUsersMessage");
  if (el) el.textContent = message || "";
}

function adminHeaders() {
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${getAdminToken()}`
  };
}

function isMasterAdmin() {
  const role = String(sessionStorage.getItem("RUNATION_ADMIN_ROLE") || "").toLowerCase();
  const accessMode = String(sessionStorage.getItem("RUNATION_ADMIN_ACCESS_MODE") || "").toLowerCase();

  return role === "master" || accessMode === "master";
}

async function createAdminUser() {
  if (!isMasterAdmin()) {
    setMessage("Master only.");
    return;
  }

  const username = getValue("adminUsername").toLowerCase();
  const password = getValue("adminPassword");
  const accessMode = getValue("adminAccessMode") || "own_event";
  const eventSlug = getValue("adminEventSlug").toLowerCase();

  if (!username || !password) {
    setMessage("Username and password are required.");
    return;
  }

  try {
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify({
        username,
        password,
        role: "event_admin",
        access_mode: accessMode,
        event_slug: eventSlug
      })
    });

    const data = await res.json().catch(() => null);

    if (!res.ok || !data || !data.success) {
      setMessage(data?.error || "Create admin failed.");
      return;
    }

    setMessage(data.message || "Admin user created.");

    document.getElementById("adminUsername").value = "";
    document.getElementById("adminPassword").value = "";
    document.getElementById("adminEventSlug").value = "";

  } catch (err) {
    setMessage(err.message || "Create admin failed.");
  }
}

document.addEventListener("DOMContentLoaded", function () {
  if (!isMasterAdmin()) {
    window.location.href = "admin.html";
  }
});