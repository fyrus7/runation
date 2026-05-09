const loginForm = document.getElementById("loginForm");
const message = document.getElementById("message");
const loginBtn = document.getElementById("loginBtn");

function setMessage(text) {
  if (message) message.textContent = text || "";
}

loginForm.addEventListener("submit", async function (e) {
  e.preventDefault();

  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value.trim();

  if (!username || !password) {
    setMessage("Please enter username and password.");
    return;
  }

  try {
    loginBtn.disabled = true;
    loginBtn.textContent = "CHECKING...";
    setMessage("");

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

    sessionStorage.setItem("RUNATION_ADMIN_TOKEN", data.token);

    const params = new URLSearchParams(location.search);
    const next = params.get("next") || "admin.html";

    location.href = next;

  } catch (err) {
    setMessage(err.message || "Login failed.");

    loginBtn.disabled = false;
    loginBtn.textContent = "LOGIN";
  }
});