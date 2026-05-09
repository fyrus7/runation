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

function getYear(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.getFullYear();
}

function getStatusText(status) {
  if (status === "OPEN") return "Registration Open";
  if (status === "UPCOMING") return "Coming Soon";
  if (status === "FULL") return "Event Full";
  if (status === "CLOSED") return "Registration Closed";
  return status || "-";
}

function getButtonText(status) {
  if (status === "OPEN") return "View Event & Register";
  return "View Event";
}

function money(value) {
  const num = Number(value || 0);
  if (!num) return "-";
  return `RM${num.toFixed(2)}`;
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

    box.innerHTML = events.map(event => {
      const status = event.status || "";
      const year = getYear(event.event_date) || event.year || "";
      const eventType = event.event_type || event.short_type || "Running Event";
      const categories = event.categories_text || event.categories || "-";
      const feeFrom = event.fee_from ? money(event.fee_from) : "-";

      return `
        <article class="event-card active-event">
          <div class="event-status">${getStatusText(status)}</div>

          <div class="event-card-top">
            <div>
              <p class="event-type">${eventType}</p>
              <h3>${event.title || "-"}</h3>
            </div>
            <div class="event-year">${year}</div>
          </div>

          <div class="event-mapline">
            <span></span>
            <span></span>
            <span></span>
          </div>

          <div class="event-info-grid">
            <div>
              <small>Date</small>
              <strong>${formatDate(event.event_date)}</strong>
            </div>

            <div>
              <small>Venue</small>
              <strong>${event.venue || "-"}</strong>
            </div>

            <div>
              <small>Categories</small>
              <strong>${categories}</strong>
            </div>

            <div>
              <small>Fee From</small>
              <strong>${feeFrom}</strong>
            </div>
          </div>

          <p class="event-desc">
            ${event.short_description || ""}
          </p>

          <a href="event.html?event=${encodeURIComponent(event.slug)}" class="event-btn">
            ${getButtonText(status)}
          </a>
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