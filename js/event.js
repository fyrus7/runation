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

function getSelectedCategoryName() {
  const select = document.getElementById("categorySelect");
  if (!select) return "";

  const option = select.options[select.selectedIndex];
  return String(option?.dataset?.name || option?.textContent || "").trim();
}

function validateRegistrationForm() {
  const required = [
    ["participantName", "Full name is required."],
    ["participantIc", "IC / Passport is required."],
    ["participantPhone", "Phone number is required."],
    ["participantGender", "Gender is required."],
	["participantEmail", "Email is required."],
    ["categorySelect", "Category is required."],
    ["participantAddress", "Address is required."],
    ["teeSize", "T-shirt size is required."],
    ["emergencyName", "Emergency contact name is required."],
    ["emergencyPhone", "Emergency contact number is required."]
  ];

  for (const [id, message] of required) {
    if (!getValue(id)) {
      setEventMessage(message);
      return false;
    }
  }
  
  const email = getValue("participantEmail");
  
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
	setEventMessage("Please enter a valid email address.");
	return false;
  }

  const categoryName = getSelectedCategoryName().toUpperCase();

  if (categoryName.includes("21KM") && !getValue("finisherTeeSize")) {
    setEventMessage("Finisher tee size is required for 21KM.");
    return false;
  }

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

document.addEventListener("change", function (e) {
  if (e.target && e.target.id === "categorySelect") {
    toggleFinisherTee();
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

loadEvent();