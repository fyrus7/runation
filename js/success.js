const params = new URLSearchParams(window.location.search);

const ref = params.get("ref") || params.get("order_id") || "";
const statusId = params.get("status_id") || "";
const msg = params.get("msg") || "";
const transactionId = params.get("transaction_id") || "";
const billcode =
  params.get("billcode") ||
  params.get("billCode") ||
  params.get("BillCode") ||
  "";

const box = document.getElementById("statusBox");

function formatMoney(value) {
  const amount = Number(value || 0);

  if (!Number.isFinite(amount) || amount <= 0) {
    return "";
  }

  return `RM${amount.toFixed(2)}`;
}

function getPaidAmount(result) {
  return (
    result.total_amount ||
    result.amount ||
    result.registration?.amount ||
    0
  );
}

function okButton(eventSlug) {
  const href = eventSlug
    ? `event.html?event=${encodeURIComponent(eventSlug)}`
    : "index.html";

  return `
    <a class="success-ok-btn" href="${href}">
      OK
    </a>
  `;
}

async function verifyPayment() {
  try {
    if (!ref || !billcode) {
      throw new Error("Missing registration reference or bill code.");
    }

    const res = await fetch("/api/payment-verify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        reg_no: ref,
        billcode: billcode
      })
    });

    const result = await res.json();

    if (!res.ok || !result.success) {
      throw new Error(result.error || "Payment verification failed.");
    }

    const eventSlug = result.event_slug || "";
	const paidAmountText = formatMoney(getPaidAmount(result));

    if (result.paid) {
      box.innerHTML = `
        <div class="success-box">
          <h1>Payment Successful</h1>
          <p><b>Payment Ref:</b> ${ref}</p>
          <p><b>Transaction ID:</b> ${result.transaction_id || transactionId || "-"}</p>
          <p><b>Bill Code:</b> ${billcode}</p>
          ${
            result.participant_count
              ? `<p><b>Participants:</b> ${result.participant_count}</p>`
              : ""
          }
		  ${
			  paidAmountText
			    ? `<p><b>Total Paid:</b> ${paidAmountText}</p>`
				: ""
		  }
          <p>Your registration has been confirmed.</p>
          ${okButton(eventSlug)}
        </div>
      `;
    } else if (statusId === "1" && msg.toLowerCase() === "ok") {
      box.innerHTML = `
        <div class="success-box">
          <h1>Payment Received</h1>
          <p><b>Payment Ref:</b> ${ref}</p>
          <p><b>Bill Code:</b> ${billcode}</p>
          <p>Payment was returned as successful, but verification is still pending.</p>
          ${okButton(eventSlug)}
        </div>
      `;
    } else {
      box.innerHTML = `
        <div class="error-box">
          <h1>Payment Pending / Failed</h1>
          <p><b>Payment Ref:</b> ${ref || "-"}</p>
          <p>Please contact the organizer if payment was deducted.</p>
          ${okButton(eventSlug)}
        </div>
      `;
    }

  } catch (err) {
    box.innerHTML = `
      <div class="error-box">
        <h1>Verification Error</h1>
        <p>${err.message}</p>
        <p><b>Payment Ref:</b> ${ref || "-"}</p>
        <p><b>Bill Code:</b> ${billcode || "-"}</p>
        ${okButton("")}
      </div>
    `;
  }
}

verifyPayment();