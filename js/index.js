function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

function cleanDisplay(value) {
  const text = String(value || "").trim();

  if (!text) return "";
  if (text === "-") return "";

  const lower = text.toLowerCase();

  if (lower === "external event") return "";
  if (lower === "external") return "";

  return text;
}

function formatDate(value) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("en-MY", {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

function getStatusText(status) {
  if (status === "OPEN") return "Registration Open";
  if (status === "UPCOMING") return "Coming Soon";
  if (status === "FULL") return "Event Full";
  if (status === "CLOSED") return "Registration Closed";
  return status || "-";
}

function getButtonText(status) {
  return "Event Info";
}

function money(value) {
  const num = Number(value || 0);
  if (!num) return "-";
  return `RM${num.toFixed(2)}`;
}

function getLandingEventLabel(event) {
  return (
    cleanDisplay(event.event_type) ||
    "Event"
  );
}

function getLandingCategories(event) {
  return (
    cleanDisplay(event.categories_text) ||
    cleanDisplay(event.category) ||
    cleanDisplay(event.event_type) ||
    "-"
  );
}

function getLandingSlotText(event) {
  const showPublicAvailability = Number(event.show_slot_counter || 0) === 1;

  if (!showPublicAvailability) return "";

  const status = String(event.status || "").toUpperCase();

  if (status === "OPEN") return "Available";
  if (status === "FULL") return "Sold Out!";
  if (status === "CLOSED") return "Closed";
  if (status === "UPCOMING") return "Coming Soon";

  return "";
}

async function loadEvents() {
  const box = document.getElementById("eventList");
  if (!box) return;

  try {
    const res = await fetch("/api/events");
    const data = await res.json();

    if (!data.success) {
      throw new Error(data.error || "FAILED_LOAD_EVENTS");
    }

    const events = data.events || [];

    if (!events.length) {
      box.innerHTML = `
        <div class="event-loading">
          No events available right now.
        </div>
      `;
      return;
    }

    box.innerHTML = events.map((event, index) => {
      const status = event.status || "";
      const eventType = getLandingEventLabel(event);
      const categories = getLandingCategories(event);
      const featuredClass = index === 0 ? " featured-event" : "";

      const imageStyle = event.event_image
        ? `style="background-image:
          linear-gradient(135deg, rgba(37,99,235,0.08), rgba(15,23,42,0.1)),
          url('${escapeAttr(event.event_image)}')"`
        : "";

      const slotText = getLandingSlotText(event);

      const slotHtml = slotText
        ? `
          <div>
            <small>Slots</small>
            <strong>${escapeHtml(slotText)}</strong>
          </div>
        `
        : "";

      return `
        <article class="event-card${featuredClass}">
          <div class="event-image" ${imageStyle}>
            <div class="event-status">${escapeHtml(getStatusText(status))}</div>
          </div>

          <div class="event-content">
            <p class="event-type">${escapeHtml(eventType)}</p>

            <h3>${escapeHtml(event.title || "-")}</h3>

            <div class="event-info-grid">
              <div>
                <small>Date</small>
                <strong>${escapeHtml(formatDate(event.event_date))}</strong>
              </div>

              <div>
                <small>Venue</small>
                <strong>${escapeHtml(event.venue || "-")}</strong>
              </div>

              <div>
                <small>Categories</small>
                <strong>${escapeHtml(categories)}</strong>
              </div>

              ${slotHtml}
            </div>

            <a href="/${encodeURIComponent(event.slug)}" class="event-btn">
              ${escapeHtml(getButtonText(status))}
            </a>
          </div>
        </article>
      `;
    }).join("");

  } catch (err) {
    console.error(err);

    box.innerHTML = `
      <div class="event-loading">
        Unable to load events.
      </div>
    `;
  }
}

loadEvents();