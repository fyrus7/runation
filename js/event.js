let additionalParticipantCount = 0;

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

function applyPostageOption(event) {
  const box = document.getElementById("postageOptionBox");
  const delivery = document.getElementById("deliveryMethod");
  const feeText = document.getElementById("postageFeeText");
  const address = document.getElementById("participantAddress");

  if (!box || !delivery) return;

  const enabled = Number(event.postage_enabled || 0) === 1;
  const fee = Number(event.postage_fee || 0);

  if (!enabled) {
    box.style.display = "none";
    delivery.value = "pickup";

    if (feeText) feeText.textContent = "";
    if (address) address.placeholder = "Enter full address";
    return;
  }

  box.style.display = "block";

  if (feeText) {
    feeText.textContent = fee > 0
      ? `Postage charge: RM${fee.toFixed(2)}`
      : "Postage available.";
  }

  if (address) {
    address.placeholder = "Required if postage selected";
  }
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
  const formBtn = document.getElementById("registerBtn");
  const openBtn = document.getElementById("openRegistrationBtn");
  const statusBox = document.getElementById("eventStatus");

  const status = String(event.status || "").toUpperCase();

  if (statusBox) {
    statusBox.textContent = status || "-";
    statusBox.className = `event-status-pill status-${status.toLowerCase()}`;
  }

  const isOpen = status === "OPEN";

  if (openBtn) {
    openBtn.disabled = !isOpen;

    if (status === "OPEN") {
      openBtn.textContent = "Register Now";
    } else if (status === "UPCOMING") {
      openBtn.textContent = "Registration Not Open Yet";
    } else if (status === "FULL") {
      openBtn.textContent = "Event Full";
    } else {
      openBtn.textContent = "Registration Closed";
    }
  }

  if (!formBtn) return;

  formBtn.disabled = !isOpen;

  if (status === "OPEN") {
    formBtn.textContent = "Proceed to Payment";
    setEventMessage("");
  } else if (status === "UPCOMING") {
    formBtn.textContent = "Registration Not Open Yet";
    setEventMessage("Registration is not open yet.");
  } else if (status === "FULL") {
    formBtn.textContent = "Event Full";
    setEventMessage("This event is already full.");
  } else {
    formBtn.textContent = "Registration Closed";
    setEventMessage("Registration for this event is closed.");
  }
}

function getActiveCategories(categories) {
  return (categories || []).filter(cat => Number(cat.is_active) === 1);
}

function renderEventDetails(event, categories) {
  const activeCategories = getActiveCategories(categories);

  const categoryText = activeCategories.length
    ? activeCategories.map(cat => cat.name).join(", ")
    : "-";

  setText("eventCategories", categoryText);

  const showSlotCounter = Number(event.show_slot_counter || 0) === 1;

  if (!showSlotCounter) {
    setText("eventSlots", "Available");
    return;
  }

  let totalLimit = Number(event.total_limit || 0);
  let usedSlots = Number(event.used_slots || 0);

  if (!totalLimit && activeCategories.length) {
    totalLimit = activeCategories.reduce((sum, cat) => {
      return sum + Number(cat.slot_limit || 0);
    }, 0);
  }

  if (!usedSlots && activeCategories.length) {
    usedSlots = activeCategories.reduce((sum, cat) => {
      return sum + Number(cat.used_slots || 0);
    }, 0);
  }

  if (!totalLimit) {
    setText("eventSlots", "Available");
    return;
  }

  const balance = Math.max(totalLimit - usedSlots, 0);

  setText("eventSlots", `${balance} / ${totalLimit} slots left`);
}

function normalizeWebsiteUrl(url) {
  const value = String(url || "").trim();

  if (!value) return "";

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  return `https://${value}`;
}

function renderOrganizerDetails(event) {
  setText("eventOrganizer", event.organizer_name || "-");

  const link = document.getElementById("eventOrganizerWebsite");
  if (!link) return;

  const rawUrl = String(event.organizer_url || "").trim();
  const finalUrl = normalizeWebsiteUrl(rawUrl);

  if (!rawUrl) {
    link.textContent = "-";
    link.href = "#";
    link.classList.add("is-empty");
    return;
  }

  link.textContent = rawUrl.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  link.href = finalUrl;
  link.classList.remove("is-empty");
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


function sanitizeDigitsElement(el, maxLength) {
  if (!el) return;

  el.value = String(el.value || "")
    .replace(/\D/g, "")
    .slice(0, maxLength || 99);
}

function cleanPassportElement(el) {
  if (!el) return;

  el.value = String(el.value || "")
    .toUpperCase()
    .replace(/\s/g, "")
    .slice(0, 9);
}

function getAdditionalCategoryOptionsHtml() {
  const mainSelect = document.getElementById("categorySelect");

  if (!mainSelect || !mainSelect.innerHTML.trim()) {
    return `<option value="">Select category</option>`;
  }

  return mainSelect.innerHTML;
}

function getAdditionalIdType(card) {
  return card.querySelector(".additional-id-type")?.value || "ic";
}

function updateAdditionalIdInputMode(card) {
  const type = getAdditionalIdType(card);
  const input = card.querySelector(".additional-ic");
  const label = card.querySelector(".additional-ic-label");

  if (!input) return;

  input.classList.remove("input-error");

  if (type === "ic") {
    input.placeholder = "12 digit IC number";
    input.maxLength = 12;
    input.inputMode = "numeric";

    if (label) label.textContent = "IC Number";

    sanitizeDigitsElement(input, 12);
    autoSetAdditionalGenderFromIc(card);
    return;
  }

  input.placeholder = "Passport number";
  input.maxLength = 9;
  input.inputMode = "text";

  if (label) label.textContent = "Passport Number";

  cleanPassportElement(input);
}

function autoSetAdditionalGenderFromIc(card) {
  if (getAdditionalIdType(card) !== "ic") return;

  const input = card.querySelector(".additional-ic");
  const gender = card.querySelector(".additional-gender");

  if (!input || !gender) return;

  const ic = String(input.value || "").trim();

  if (!/^\d{12}$/.test(ic)) return;

  const lastDigit = Number(ic.slice(-1));
  gender.value = lastDigit % 2 === 1 ? "MEN" : "WOMEN";
  gender.classList.remove("input-error");
}

function toggleAdditionalFinisherTee(card) {
  const select = card.querySelector(".additional-category");
  const box = card.querySelector(".additional-finisher-box");
  const finisherSelect = card.querySelector(".additional-finisher-size");

  if (!select || !box) return;

  const selectedOption = select.options[select.selectedIndex];
  const categoryName = String(selectedOption?.dataset?.name || "").toUpperCase();

  const needFinisherTee = categoryName.includes("21KM");

  box.style.display = needFinisherTee ? "block" : "none";

  if (!needFinisherTee && finisherSelect) {
    finisherSelect.value = "";
    finisherSelect.classList.remove("input-error");
  }
}

function renumberAdditionalParticipants() {
  const cards = document.querySelectorAll(".additional-participant-card");

  cards.forEach((card, index) => {
    const title = card.querySelector(".additional-participant-title");
    if (title) title.textContent = `Participant ${index + 2}`;
  });
}

function addAdditionalParticipant() {
  additionalParticipantCount += 1;

  const container = document.getElementById("additionalParticipants");
  if (!container) return;

  const card = document.createElement("div");
  card.className = "additional-participant-card";
  card.dataset.participantIndex = String(additionalParticipantCount);

  card.innerHTML = `
    <div class="additional-participant-head">
      <h3 class="additional-participant-title">Participant</h3>
      <button type="button" class="remove-participant-btn">Remove</button>
    </div>

    <div class="form-grid">
      <div class="form-group">
        <label>Category</label>
        <select class="additional-category">
          ${getAdditionalCategoryOptionsHtml()}
        </select>
      </div>

      <div class="form-group">
        <label>Full Name</label>
        <input class="additional-name" type="text" placeholder="Enter full name">
      </div>

      <div class="form-group">
        <label>ID Type</label>
        <select class="additional-id-type">
          <option value="ic">IC</option>
          <option value="passport">Passport</option>
        </select>

        <label class="field-sub-label additional-ic-label">IC Number</label>
        <input
          class="additional-ic"
          type="text"
          placeholder="12 digit IC number"
          inputmode="numeric"
          maxlength="12"
          autocomplete="off"
        >
      </div>

      <div class="form-group">
        <label>Phone Number</label>
        <input
          class="additional-phone"
          type="tel"
          placeholder="Enter phone number"
          inputmode="numeric"
          autocomplete="off"
        >
      </div>

      <div class="form-group">
        <label>Gender</label>
        <select class="additional-gender">
          <option value="">Select gender</option>
          <option value="MEN">Men</option>
          <option value="WOMEN">Women</option>
        </select>
      </div>

      <div class="form-group">
        <label>Email</label>
        <input class="additional-email" type="email" placeholder="Enter email">
      </div>

      <div class="form-group">
        <label>T-Shirt Size</label>
        <select class="additional-tee-size">
          <option value="">Select size</option>
          <option value="XS">XS</option>
          <option value="S">S</option>
          <option value="M">M</option>
          <option value="L">L</option>
          <option value="XL">XL</option>
          <option value="2XL">2XL</option>
          <option value="3XL">3XL</option>
          <option value="4XL">4XL</option>
          <option value="5XL">5XL</option>
        </select>
      </div>

      <div class="form-group additional-finisher-box" style="display:none;">
        <label>Finisher Tee Size</label>
        <select class="additional-finisher-size">
          <option value="">Select finisher tee size</option>
          <option value="XS">XS</option>
          <option value="S">S</option>
          <option value="M">M</option>
          <option value="L">L</option>
          <option value="XL">XL</option>
          <option value="2XL">2XL</option>
          <option value="3XL">3XL</option>
          <option value="4XL">4XL</option>
          <option value="5XL">5XL</option>
        </select>
      </div>

      <div class="form-group">
        <label>Emergency Contact Name</label>
        <input class="additional-emergency-name" type="text" placeholder="Emergency contact name">
      </div>

      <div class="form-group">
        <label>Emergency Contact Number</label>
        <input
          class="additional-emergency-phone"
          type="tel"
          placeholder="Emergency contact number"
          inputmode="numeric"
          autocomplete="off"
        >
      </div>
    </div>
  `;

  container.appendChild(card);

  updateAdditionalIdInputMode(card);
  toggleAdditionalFinisherTee(card);
  renumberAdditionalParticipants();
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
	"deliveryMethod",
    "participantAddress",
    "teeSize",
    "finisherTeeSize",
    "emergencyName",
    "emergencyPhone"
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove("input-error");
  });
  
  document
  .querySelectorAll("#additionalParticipants .input-error")
  .forEach(el => el.classList.remove("input-error"));
}

function markInvalidField(id) {
  // Address masih required, tapi jangan merahkan field address
  if (id === "participantAddress") return;

  const el = document.getElementById(id);
  if (el) el.classList.add("input-error");
}

function markInvalidElement(el) {
  if (el) el.classList.add("input-error");
}

function getAdditionalField(card, selector) {
  return card.querySelector(selector);
}

function getAdditionalValue(card, selector) {
  const el = getAdditionalField(card, selector);
  return el ? String(el.value || "").trim() : "";
}

function validateAdditionalParticipants() {
  const cards = Array.from(document.querySelectorAll(".additional-participant-card"));
  let isValid = true;

  cards.forEach(card => {
    const required = [
      [".additional-category", "Category"],
      [".additional-name", "Full name"],
      [".additional-phone", "Phone number"],
      [".additional-gender", "Gender"],
      [".additional-email", "Email"],
      [".additional-tee-size", "T-shirt size"],
      [".additional-emergency-name", "Emergency contact name"],
      [".additional-emergency-phone", "Emergency contact number"]
    ];

    required.forEach(([selector]) => {
      const el = getAdditionalField(card, selector);

      if (!String(el?.value || "").trim()) {
        markInvalidElement(el);
        isValid = false;
      }
    });

    const idType = getAdditionalValue(card, ".additional-id-type") || "ic";
    const idValue = getAdditionalValue(card, ".additional-ic");
    const icInput = getAdditionalField(card, ".additional-ic");

    if (!idValue) {
      markInvalidElement(icInput);
      isValid = false;
    } else if (idType === "ic" && !/^\d{12}$/.test(idValue)) {
      markInvalidElement(icInput);
      isValid = false;
    } else if (idType === "passport" && !/^[A-Z0-9]{1,9}$/i.test(idValue)) {
      markInvalidElement(icInput);
      isValid = false;
    }

    const phone = getAdditionalValue(card, ".additional-phone");
    const phoneInput = getAdditionalField(card, ".additional-phone");

    if (phone && !/^\d+$/.test(phone)) {
      markInvalidElement(phoneInput);
      isValid = false;
    }

    const emergencyPhone = getAdditionalValue(card, ".additional-emergency-phone");
    const emergencyPhoneInput = getAdditionalField(card, ".additional-emergency-phone");

    if (emergencyPhone && !/^\d+$/.test(emergencyPhone)) {
      markInvalidElement(emergencyPhoneInput);
      isValid = false;
    }

    const email = getAdditionalValue(card, ".additional-email");
    const emailInput = getAdditionalField(card, ".additional-email");

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      markInvalidElement(emailInput);
      isValid = false;
    }

    const categorySelect = getAdditionalField(card, ".additional-category");
    const selectedOption = categorySelect?.options?.[categorySelect.selectedIndex];
    const categoryName = String(selectedOption?.dataset?.name || "").toUpperCase();

    if (categoryName.includes("21KM")) {
      const finisher = getAdditionalField(card, ".additional-finisher-size");

      if (!String(finisher?.value || "").trim()) {
        markInvalidElement(finisher);
        isValid = false;
      }
    }
  });

  return isValid;
}


function validateRegistrationForm() {
  clearInvalidFields();

  const required = [
    ["participantName", "Full name"],
    ["participantPhone", "Phone number"],
    ["participantGender", "Gender"],
    ["participantEmail", "Email"],
    ["categorySelect", "Category"],
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
  
  const deliveryMethod = getValue("deliveryMethod") || "pickup";
  
  if (deliveryMethod === "postage" && !getValue("participantAddress")) {
    missing.push("Address");
    markInvalidField("participantAddress");
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
  
  if (!validateAdditionalParticipants()) {
   missing.push("Additional participant details");
  }

  if (missing.length) {
    setEventMessage("Please complete all required fields correctly.");
    return false;
  }

  setEventMessage("");
  return true;
}


function buildPrimaryParticipantPayload() {
  return {
    category_id: Number(getValue("categorySelect")),
    full_name: getValue("participantName"),
    id_type: getIdType(),
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
}

function buildAdditionalParticipantsPayload() {
  return Array.from(document.querySelectorAll(".additional-participant-card"))
    .map(card => ({
      category_id: Number(getAdditionalValue(card, ".additional-category")),
      full_name: getAdditionalValue(card, ".additional-name"),
      id_type: getAdditionalValue(card, ".additional-id-type") || "ic",
      ic_passport: getAdditionalValue(card, ".additional-ic"),
      email: getAdditionalValue(card, ".additional-email"),
      phone: getAdditionalValue(card, ".additional-phone"),
      gender: getAdditionalValue(card, ".additional-gender"),
      tee_size: getAdditionalValue(card, ".additional-tee-size"),
      finisher_tee_size: getAdditionalValue(card, ".additional-finisher-size"),
      emergency_name: getAdditionalValue(card, ".additional-emergency-name"),
      emergency_phone: getAdditionalValue(card, ".additional-emergency-phone")
    }));
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
  
  const primaryParticipant = buildPrimaryParticipantPayload();
  const additionalParticipants = buildAdditionalParticipantsPayload();
  const allParticipants = [primaryParticipant, ...additionalParticipants];

  const payload = {
    event_id: window.RUNATION_EVENT.id,
    category_id: Number(getValue("categorySelect")),
	participants: allParticipants,

    full_name: getValue("participantName"),
    ic_passport: getValue("participantIc"),
    email: getValue("participantEmail"),
    phone: getValue("participantPhone"),
    gender: getValue("participantGender"),
    address: getValue("participantAddress"),
	delivery_method: getValue("deliveryMethod") || "pickup",

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
  
  const card = e.target.closest(".additional-participant-card");

if (card) {
  if (e.target.classList.contains("additional-ic")) {
    if (getAdditionalIdType(card) === "ic") {
      sanitizeDigitsElement(e.target, 12);
      autoSetAdditionalGenderFromIc(card);
    } else {
      cleanPassportElement(e.target);
    }
  }

  if (e.target.classList.contains("additional-phone")) {
    sanitizeDigitsElement(e.target, 15);
  }

  if (e.target.classList.contains("additional-emergency-phone")) {
    sanitizeDigitsElement(e.target, 15);
  }
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
  
  const card = e.target.closest(".additional-participant-card");

if (card) {
  if (e.target.classList.contains("additional-id-type")) {
    updateAdditionalIdInputMode(card);
  }

  if (e.target.classList.contains("additional-category")) {
    toggleAdditionalFinisherTee(card);
  }
}

  if (e.target.classList.contains("input-error")) {
    if (String(e.target.value || "").trim()) {
      e.target.classList.remove("input-error");
    }
  }
});

document.addEventListener("click", function (e) {
  if (!e.target) return;
  
    if (e.target.id === "cancelRegistrationBtn") {
    const section = document.getElementById("registrationSection");
    const openBtn = document.getElementById("openRegistrationBtn");

    if (section) section.hidden = true;
    if (openBtn) openBtn.hidden = false;

    setEventMessage("");

    if (openBtn) {
      setTimeout(() => {
        openBtn.scrollIntoView({
          behavior: "smooth",
          block: "center"
        });
      }, 50);
    }

    return;
  }

  if (e.target.id === "addParticipantBtn") {
    addAdditionalParticipant();
    return;
  }

  if (e.target.classList.contains("remove-participant-btn")) {
    const card = e.target.closest(".additional-participant-card");
    if (card) card.remove();
    renumberAdditionalParticipants();
    return;
  }

  if (e.target.id === "registerBtn") {
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
	applyPostageOption(event);
    const categories = data.categories || [];

    document.title = `${event.title} | Runation`;

    setText("eventTitle", event.title);
	setText("eventVisualTitle", event.title);
	setText("eventVisualStatus", event.status);
    setText("eventDescription", event.short_description);
    setText("eventVenue", event.venue || "-");
    setText("eventDate", formatDate(event.event_date));
	
	renderEventDetails(event, categories);
	renderOrganizerDetails(event);
	renderCategories(categories);
	applyEventStatus(event);
	
	const registrationMode = String(event.registration_mode || "internal").toLowerCase();
	
	if (registrationMode === "external") {
		const externalUrl = normalizeWebsiteUrl(event.external_registration_url || "");
		
	if (registrationSection) registrationSection.hidden = true;
	
	if (openRegistrationBtn) {
		openRegistrationBtn.hidden = false;
		
		if (externalUrl) {
			openRegistrationBtn.disabled = String(event.status || "").toUpperCase() !== "OPEN";
			openRegistrationBtn.textContent = "Register Now";
		} else {
			openRegistrationBtn.disabled = true;
			openRegistrationBtn.textContent = "Registration URL Missing";
		}
	  }
    }

    window.RUNATION_EVENT = event;
    window.RUNATION_CATEGORIES = categories;

  } catch (err) {
    console.error(err);
    setText("eventTitle", "Unable to load event");
    setEventMessage("Please try again later.");
  }
}

const openRegistrationBtn = document.getElementById("openRegistrationBtn");
const registrationSection = document.getElementById("registrationSection");

if (openRegistrationBtn && registrationSection) {
  openRegistrationBtn.disabled = true;
  openRegistrationBtn.textContent = "Loading...";

  openRegistrationBtn.addEventListener("click", () => {
    const event = window.RUNATION_EVENT;
    const status = String(event?.status || "").toUpperCase();

    if (status !== "OPEN") {
      return;
    }

    const mode = String(event?.registration_mode || "internal").toLowerCase();
    const externalUrl = normalizeWebsiteUrl(event?.external_registration_url || "");

    if (mode === "external") {
      if (!externalUrl) {
        setEventMessage("Registration URL is not available.");
        return;
      }

      window.location.href = externalUrl;
      return;
    }

    registrationSection.hidden = false;
    openRegistrationBtn.hidden = true;

    setTimeout(() => {
      registrationSection.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }, 50);
  });
}

updateIdInputMode();
loadEvent();