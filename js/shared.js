function formatDateOnly(value) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("en-MY", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function formatDateTime(value) {
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

// admin.js & admin-events.js
function getAdminToken() {
  return sessionStorage.getItem("RUNATION_ADMIN_TOKEN") || "";
}

function requireAdminLogin(nextPage) {
  const token = getAdminToken();

  if (!token) {
    location.replace(`login.html?next=${encodeURIComponent(nextPage)}`);
    return false;
  }

  return true;
}

function logoutAdmin() {
  sessionStorage.removeItem("RUNATION_ADMIN_TOKEN");
  location.href = "login.html";
}