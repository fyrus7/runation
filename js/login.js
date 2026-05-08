const loginForm = document.getElementById("loginForm");
const loginBtn = document.getElementById("loginBtn");
const message = document.getElementById("message");

loginForm.addEventListener("submit", async e => {
  e.preventDefault();

  message.innerHTML = "";
  loginBtn.disabled = true;
  loginBtn.textContent = "LOGGING IN...";

  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;

  try {
    const res = await fetch("/api/admin-login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.error || "Login failed");
    }

    localStorage.setItem("adminToken", data.token);
    window.location.href = "admin.html";

  } catch (err) {
    message.innerHTML = `
      <div class="error-box">
        ${err.message}
      </div>
    `;
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = "LOGIN";
  }
});