const form = document.getElementById("registrationForm");
const message = document.getElementById("message");
const submitBtn = document.getElementById("submitBtn");

form.addEventListener("submit", async function (e) {
  e.preventDefault();

  message.innerHTML = "";
  submitBtn.disabled = true;
  submitBtn.textContent = "SAVING...";

  const data = {
    name: document.getElementById("name").value.trim(),
    ic: document.getElementById("ic").value.trim(),
    email: document.getElementById("email").value.trim(),
    phone: document.getElementById("phone").value.trim(),
    category: document.getElementById("category").value,
    tshirt_size: document.getElementById("tshirt_size").value
  };

  try {
    const res = await fetch("/api/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(data)
    });

    const result = await res.json();

    if (!res.ok || !result.success) {
      throw new Error(result.error || "Registration failed");
    }

    message.innerHTML = `
  <div class="success-box">
    <h3>Registration Saved</h3>
    <p><b>Registration No:</b> ${result.registration.reg_no}</p>
    <p><b>Name:</b> ${result.registration.name}</p>
    <p><b>Category:</b> ${result.registration.category}</p>
    <p><b>Status:</b> Redirecting to payment...</p>
  </div>
`;

setTimeout(() => {
  window.location.href = result.payment_url;
}, 800);

  } catch (err) {
    message.innerHTML = `
      <div class="error-box">
        ${err.message}
      </div>
    `;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "REGISTER";
  }
});