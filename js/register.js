const form = document.getElementById("registrationForm");
const message = document.getElementById("message");
const submitBtn = document.getElementById("submitBtn");

const continuePaymentForm = document.getElementById("continuePaymentForm");
const continueRef = document.getElementById("continueRef");
const continueBtn = document.getElementById("continueBtn");

function val(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : "";
}

function getFormData(extra = {}) {
  return {
    event_slug: val("event_slug"),
    name: val("name"),
    ic: val("ic"),
    email: val("email"),
    phone: val("phone"),
    address: val("address"),
    category: val("category"),
    event_tee_size: val("event_tee_size"),
    finisher_tee_size: val("finisher_tee_size"),
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
      <p>This IC / Passport already has an unpaid registration for this event.</p>

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
      "Create new registration? The old pending registration for this event will be deleted."
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

    message.innerHTML = `
      <div class="success-box">
        <h3>Registration Saved</h3>
        <p><b>Registration No:</b> ${result.registration.reg_no}</p>
        <p><b>Name:</b> ${result.registration.name}</p>
        <p><b>Event:</b> ${result.registration.event_name || "-"}</p>
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

if (form) {
  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    await submitRegistration(getFormData());
  });
}

if (continuePaymentForm) {
  continuePaymentForm.addEventListener("submit", async e => {
    e.preventDefault();

    message.innerHTML = "";
    continueBtn.disabled = true;
    continueBtn.textContent = "CHECKING...";

    const value = continueRef.value.trim();
    const eventSlug = val("event_slug");

    try {
      const payload = value.toUpperCase().startsWith("REG-") || value.toUpperCase().startsWith("TKHM-") || value.toUpperCase().startsWith("LSPTK-")
        ? { ref: value.toUpperCase(), event_slug: eventSlug }
        : { ic: value, event_slug: eventSlug };

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
            <p><b>Event:</b> ${reg.event_name || "-"}</p>
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
            <p><b>Event:</b> ${reg.event_name || "-"}</p>
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