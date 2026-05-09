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
      : `${cat.name} - RM${cat.price}`;

    return `
      <option value="${cat.id}" ${isFull ? "disabled" : ""}>
        ${label}
      </option>
    `;
  }).join("");
}

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
    const categories = data.categories || [];

    document.title = `${event.title} | Runation`;

    setText("eventTitle", event.title);
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