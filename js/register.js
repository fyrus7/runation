const form = document.getElementById("registrationForm");
const message = document.getElementById("message");
const submitBtn = document.getElementById("submitBtn");

const continuePaymentForm = document.getElementById("continuePaymentForm");
const continueRef = document.getElementById("continueRef");
const continueBtn = document.getElementById("continueBtn");

function getFormData(extra = {}) {
  return {
    name: document.getElementById("name").value.trim(),
    ic: document.getElementById("ic").value.trim(),
    email: document.getElementById("email").value.trim(),
    phone: document.getElementById("phone").value.trim(),
    address: document.getElementById("address").value.trim(),
    category: document.getElementById("category").value,
    event_tee_size: document.getElementById("event_tee_size").value,
    finisher_tee_size: document.getElementById("finisher_tee_size").value,
    ...extra
  };
}

function showDuplicatePending(result, originalData) {
  message.innerHTML = `
    <div class="success-box">
      <h3>Pending Registration Found</h3>
      <p><b>Registration No:</b> ${result.registration.reg_no}</p>
      <p><b>Name:</b> ${result.registration.name}</p>
      <p><b>Category:</b> ${result.registration.category}</p>
      <p>This IC already has an unpaid registration.</p>

      <div class="duplicate-actions">
        <button type="button" id="dupContinueBtn">CONTINUE PAYMENT</button>
        <button type="button" id="dupCreateNewBtn" class="danger-btn">CREATE NEW</button>
      </div>
    </div>
  `;

  document.getElementById("dupContinueBtn").addEventListener("click", () => {
    window.location.href = result.payment_url;
  });

  document.getElementById("dupCreateNewBtn").addEventListener("click", async () => {
    const confirmNew = confirm(
      "Create new registration? The old pending registration will be deleted."
    );

    if (!confirmNew) return;

    await submitRegistration({
      ...originalData,
      recreate: true
    });
  });
}

async function submitRegistration(data) {
  message.innerHTML = "";
  submitBtn.disabled = true;
  submitBtn.textContent = "SAVING...";

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

    if (result.duplicate_pending) {
      showDuplicatePending(result, data);
      return;
    }

    if (result.continue_payment && result.payment_url) {
      message.innerHTML = `
        <div class="success-box">
          <h3>Pending Registration Found</h3>
          <p><b>Registration No:</b> ${result.registration.reg_no}</p>
          <p><b>Name:</b> ${result.registration.name}</p>
          <p><b>Category:</b> ${result.registration.category}</p>
          <p>Redirecting to payment...</p>
        </div>
      `;

      setTimeout(() => {
        window.location.href = result.payment_url;
      }, 800);

      return;
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
    submitBtn.textContent = "REGISTER NOW";
  }
}

form.addEventListener("submit", async function (e) {
  e.preventDefault();
  await submitRegistration(getFormData());
});

if (continuePaymentForm) {
  continuePaymentForm.addEventListener("submit", async e => {
    e.preventDefault();

    message.innerHTML = "";
    continueBtn.disabled = true;
    continueBtn.textContent = "CHECKING...";

    const value = continueRef.value.trim();

    try {
      const payload = value.toUpperCase().startsWith("REG-")
        ? { ref: value.toUpperCase() }
        : { ic: value };

      const res = await fetch("/api/registration-status", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Registration not found");
      }

      const reg = data.registration;

      if (reg.payment_status === "PAID") {
        message.innerHTML = `
          <div class="success-box">
            <h3>Registration Already Paid</h3>
            <p><b>Registration No:</b> ${reg.reg_no}</p>
            <p><b>Name:</b> ${reg.name}</p>
            <p><b>Category:</b> ${reg.category}</p>
          </div>
        `;
        return;
      }

      if (reg.payment_status === "PENDING_PAYMENT" && reg.payment_url) {
        message.innerHTML = `
          <div class="success-box">
            <h3>Pending Payment Found</h3>
            <p><b>Registration No:</b> ${reg.reg_no}</p>
            <p><b>Name:</b> ${reg.name}</p>
            <p><b>Category:</b> ${reg.category}</p>
            <p>Redirecting to payment...</p>
          </div>
        `;

        setTimeout(() => {
          window.location.href = reg.payment_url;
        }, 800);

        return;
      }

      message.innerHTML = `
        <div class="error-box">
          Payment link is not available. Please contact organizer.
        </div>
      `;

    } catch (err) {
      message.innerHTML = `
        <div class="error-box">
          ${err.message}
        </div>
      `;
    } finally {
      continueBtn.disabled = false;
      continueBtn.textContent = "CONTINUE PAYMENT";
    }
  });
}