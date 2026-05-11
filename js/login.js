const loginForm = document.getElementById("loginForm");
const usernameInput = document.getElementById("username");
const passwordInput = document.getElementById("password");
const loginBtn = document.getElementById("loginBtn");
const messageBox = document.getElementById("message");

function showMessage(text, type = "error") {
  if (!messageBox) return;

  messageBox.textContent = text;
  messageBox.className = type;
}

loginForm.addEventListener("submit", async function (e) {
  e.preventDefault();

  const username = String(usernameInput.value || "").trim();
  const password = String(passwordInput.value || "").trim();

  if (!username || !password) {
    showMessage("Username and password are required.");
    return;
  }

  loginBtn.disabled = true;
  loginBtn.textContent = "LOGGING IN...";
  showMessage("");

  try {
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        username,
        password
      })
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.error || "Login failed.");
    }

    sessionStorage.setItem("RUNATION_ADMIN_TOKEN", data.token || "");
    sessionStorage.setItem("RUNATION_ADMIN_USERNAME", data.username || "");
    sessionStorage.setItem("RUNATION_ADMIN_ROLE", data.role || "master");
    sessionStorage.setItem("RUNATION_ADMIN_EVENT", data.event_slug || "");

    const next = new URLSearchParams(window.location.search).get("next");
    window.location.href = next || "admin.html";

  } catch (err) {
    showMessage(err.message || "Login failed.");
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = "LOGIN";
  }
});