function getSlug() {
  const params = new URLSearchParams(location.search);
  return params.get("event") || "";
}

function formatDate(value) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("en-MY", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}


function applyEventFormBanner(event) {
  const banner = document.getElementById("eventFormBanner");
  if (!banner) return;

  const imageUrl = event.event_image || "";

  if (!imageUrl) {
    banner.hidden = true;
    banner.style.backgroundImage = "";
    return;
  }

  banner.hidden = false;
  banner.style.backgroundImage = `
    url("${imageUrl}")
  `;
}


function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value || "";
}

function setEventMessage(message) {
  const el = document.getElementById("eventMessage");
  if (el) el.textContent = message || "";
}

function applyEventStatus(event) {
  const btn = document.getElementById("registerBtn");
  const statusBox = document.getElementById("eventStatus");

  if (statusBox) {
    statusBox.textContent = event.status || "-";
    statusBox.className = `event-status-pill status-${String(event.status || "").toLowerCase()}`;
  }

  if (!btn) return;

  if (event.status === "OPEN") {
    btn.disabled = false;
    btn.textContent = "Register Now";
    setEventMessage("");
    return;
  }

  btn.disabled = true;

  if (event.status === "UPCOMING") {
    btn.textContent = "Registration Not Open Yet";
    setEventMessage("Registration is not open yet.");
  } else if (event.status === "FULL") {
    btn.textContent = "Event Full";
    setEventMessage("This event is already full.");
  } else {
    btn.textContent = "Registration Closed";
    setEventMessage("Registration for this event is closed.");
  }
}

function renderCategories(categories) {
  const select = document.getElementById("categorySelect");
  if (!select) return;

  const activeCategories = (categories || []).filter(cat => Number(cat.is_active) === 1);

  if (!activeCategories.length) {
    select.innerHTML = `<option value="">No category available</option>`;
    return;
  }

  select.innerHTML = activeCategories.map(cat => {
    const limit = Number(cat.slot_limit || 0);
    const used = Number(cat.used_slots || 0);
    const isFull = limit > 0 && used >= limit;

    const label = isFull
      ? `${cat.name} - FULL`
      : `${cat.name} - RM${Number(cat.price || 0).toFixed(2)}`;

    return `
      <option 
        value="${cat.id}" 
        data-name="${cat.name}"
        ${isFull ? "disabled" : ""}
      >
        ${label}
      </option>
    `;
  }).join("");

  toggleFinisherTee();
}

function toggleFinisherTee() {
  const select = document.getElementById("categorySelect");
  const box = document.getElementById("finisherTeeBox");
  const finisherSelect = document.getElementById("finisherTeeSize");

  if (!select || !box) return;

  const selectedOption = select.options[select.selectedIndex];
  const categoryName = String(selectedOption?.dataset?.name || "").toUpperCase();

  const needFinisherTee = categoryName.includes("21KM");

  box.style.display = needFinisherTee ? "block" : "none";

  if (!needFinisherTee && finisherSelect) {
    finisherSelect.value = "";
  }
}

function getValue(id) {
  const el = document.getElementById(id);
  return el ? String(el.value || "").trim() : "";
}

function setValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value ?? "";
}

function getIdType() {
  return getValue("participantIdType") || "ic";
}

function onlyDigits(id, maxLength) {
  const el = document.getElementById(id);
  if (!el) return;

  el.value = String(el.value || "")
    .replace(/\D/g, "")
    .slice(0, maxLength || 99);
}

function cleanPassportInput() {
  const el = document.getElementById("participantIc");
  if (!el) return;

  el.value = String(el.value || "")
    .toUpperCase()
    .replace(/\s/g, "")
    .slice(0, 9);
}

function autoSetGenderFromIc() {
  if (getIdType() !== "ic") return;

  const ic = getValue("participantIc");

  if (!/^\d{12}$/.test(ic)) return;

  const lastDigit = Number(ic.slice(-1));

  if (lastDigit % 2 === 1) {
    setValue("participantGender", "MEN");
  } else {
    setValue("participantGender", "WOMEN");
  }

  const gender = document.getElementById("participantGender");
  if (gender) gender.classList.remove("input-error");
}

function updateIdInputMode() {
  const type = getIdType();
  const input = document.getElementById("participantIc");
  const label = document.getElementById("participantIcLabel");

  if (!input) return;

  input.classList.remove("input-error");

  if (type === "ic") {
    input.placeholder = "12 digit IC number";
    input.maxLength = 12;
    input.inputMode = "numeric";

    if (label) label.textContent = "IC Number";

    onlyDigits("participantIc", 12);
    autoSetGenderFromIc();
    return;
  }

  input.placeholder = "Passport number";
  input.maxLength = 9;
  input.inputMode = "text";

  if (label) label.textContent = "Passport Number";

  cleanPassportInput();
}


function getSelectedCategoryName() {
  const select = document.getElementById("categorySelect");
  if (!select) return "";

  const option = select.options[select.selectedIndex];
  return String(option?.dataset?.name || option?.textContent || "").trim();
}


function clearInvalidFields() {
  [
    "participantName",
    "participantIdType",
    "participantIc",
    "participantPhone",
    "participantGender",
    "participantEmail",
    "categorySelect",
    "participantAddress",
    "teeSize",
    "finisherTeeSize",
    "emergencyName",
    "emergencyPhone"
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove("input-error");
  });
}

function markInvalidField(id) {
  // Address masih required, tapi jangan merahkan field address
  if (id === "participantAddress") return;

  const el = document.getElementById(id);
  if (el) el.classList.add("input-error");
}

function validateRegistrationForm() {
  clearInvalidFields();

  const required = [
    ["participantName", "Full name"],
    ["participantPhone", "Phone number"],
    ["participantGender", "Gender"],
    ["participantEmail", "Email"],
    ["categorySelect", "Category"],
    ["participantAddress", "Address"],
    ["teeSize", "T-shirt size"],
    ["emergencyName", "Emergency contact name"],
    ["emergencyPhone", "Emergency contact number"]
  ];

  const missing = [];

  for (const [id, label] of required) {
    if (!getValue(id)) {
      missing.push(label);
      markInvalidField(id);
    }
  }

  const idType = getIdType();
  const idValue = getValue("participantIc");

  if (!idValue) {
    missing.push(idType === "ic" ? "IC number" : "Passport number");
    markInvalidField("participantIc");
  } else if (idType === "ic" && !/^\d{12}$/.test(idValue)) {
    missing.push("IC must be 12 digits");
    markInvalidField("participantIc");
  } else if (idType === "passport" && !/^[A-Z0-9]{1,9}$/i.test(idValue)) {
    missing.push("Passport must be maximum 9 characters");
    markInvalidField("participantIc");
  }

  const phone = getValue("participantPhone");
  const emergencyPhone = getValue("emergencyPhone");

  if (phone && !/^\d+$/.test(phone)) {
    missing.push("Phone number must contain numbers only");
    markInvalidField("participantPhone");
  }

  if (emergencyPhone && !/^\d+$/.test(emergencyPhone)) {
    missing.push("Emergency contact number must contain numbers only");
    markInvalidField("emergencyPhone");
  }

  const email = getValue("participantEmail");

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    missing.push("valid email address");
    markInvalidField("participantEmail");
  }

  const categoryName = getSelectedCategoryName().toUpperCase();

  if (categoryName.includes("21KM") && !getValue("finisherTeeSize")) {
    missing.push("Finisher tee size");
    markInvalidField("finisherTeeSize");
  }

  if (missing.length) {
    setEventMessage("Please complete all required fields correctly.");
    return false;
  }

  setEventMessage("");
  return true;
}

async function submitRegistration() {
  const btn = document.getElementById("registerBtn");

  if (!window.RUNATION_EVENT) {
    setEventMessage("Event is not ready yet.");
    return;
  }

  if (!validateRegistrationForm()) {
    return;
  }

  const payload = {
    event_id: window.RUNATION_EVENT.id,
    category_id: Number(getValue("categorySelect")),

    full_name: getValue("participantName"),
    ic_passport: getValue("participantIc"),
    email: getValue("participantEmail"),
    phone: getValue("participantPhone"),
    gender: getValue("participantGender"),
    address: getValue("participantAddress"),

    tee_size: getValue("teeSize"),
    finisher_tee_size: getValue("finisherTeeSize"),

    emergency_name: getValue("emergencyName"),
    emergency_phone: getValue("emergencyPhone")
  };

  try {
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Submitting...";
    }

    setEventMessage("");

    const res = await fetch("/api/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.error || "REGISTRATION_FAILED");
    }

    if (data.payment_url) {
      window.location.href = data.payment_url;
	  return;
	}
	
	setEventMessage(`Registration saved. Registration No: ${data.reg_no || data.registration_no}`);
	
	if (btn) {
	  btn.disabled = true;
	  btn.textContent = "Registration Saved";
	}

  } catch (err) {
    console.error(err);

    setEventMessage(err.message || "Registration failed.");

    if (btn) {
      btn.disabled = false;
      btn.textContent = "Register Now";
    }
  }
}


document.addEventListener("input", function (e) {
  if (!e.target) return;

  if (e.target.id === "participantIc") {
    if (getIdType() === "ic") {
      onlyDigits("participantIc", 12);
      autoSetGenderFromIc();
    } else {
      cleanPassportInput();
    }
  }

  if (e.target.id === "participantPhone") {
    onlyDigits("participantPhone", 15);
  }

  if (e.target.id === "emergencyPhone") {
    onlyDigits("emergencyPhone", 15);
  }

  if (e.target.classList.contains("input-error")) {
    if (String(e.target.value || "").trim()) {
      e.target.classList.remove("input-error");
    }
  }
});

document.addEventListener("change", function (e) {
  if (!e.target) return;

  if (e.target.id === "participantIdType") {
    updateIdInputMode();
  }

  if (e.target.id === "categorySelect") {
    toggleFinisherTee();
  }

  if (e.target.classList.contains("input-error")) {
    if (String(e.target.value || "").trim()) {
      e.target.classList.remove("input-error");
    }
  }
});

document.addEventListener("click", function (e) {
  if (e.target && e.target.id === "registerBtn") {
    submitRegistration();
  }
});



async function loadEvent() {
  const slug = getSlug();

  if (!slug) {
    setText("eventTitle", "Event not found");
    setEventMessage("Missing event slug.");
    return;
  }

  try {
    const res = await fetch(`/api/event/${encodeURIComponent(slug)}`);
    const data = await res.json();

    if (!data.success) {
      throw new Error(data.error || "FAILED_LOAD_EVENT");
    }

    const event = data.event;
	applyEventFormBanner(event);
    const categories = data.categories || [];

    document.title = `${event.title} | Runation`;

    setText("eventTitle", event.title);
	setText("eventVisualTitle", event.title);
	setText("eventVisualStatus", event.status);
    setText("eventDescription", event.short_description);
    setText("eventVenue", event.venue || "-");
    setText("eventDate", formatDate(event.event_date));

    renderCategories(categories);
    applyEventStatus(event);

    window.RUNATION_EVENT = event;
    window.RUNATION_CATEGORIES = categories;

  } catch (err) {
    console.error(err);
    setText("eventTitle", "Unable to load event");
    setEventMessage("Please try again later.");
  }
}

updateIdInputMode();
loadEvent();