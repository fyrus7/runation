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
  if (status === "OPEN") return "View Event & Register";
  return "View Event";
}

function money(value) {
  const num = Number(value || 0);
  if (!num) return "-";
  return `RM${num.toFixed(2)}`;
}

function getImageClass(event) {
  const slug = String(event.slug || "").toLowerCase();

  if (slug.includes("tanjongkarang") || slug.includes("tkhm")) {
    return "tk-event";
  }

  if (slug.includes("lsptk") || slug.includes("sawah")) {
    return "sawah-event";
  }

  return "tk-event";
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
  const eventType = event.event_type || "Running Event";
  const categories = event.categories_text || "-";
  const feeFrom = money(event.fee_from);
  const featuredClass = index === 0 ? " featured-event" : "";
  
  const imageStyle = event.event_image
    ? `style="background-image:
      linear-gradient(135deg, rgba(37,99,235,0.08), rgba(15,23,42,0.1)),
      url('${event.event_image}')"`
    : "";

  const totalLimit = Number(event.total_limit || 0);
  const usedSlots = Number(event.used_slots || 0);
  const showCounter = Number(event.show_slot_counter || 0) === 1;

  const slotText = totalLimit > 0
    ? (showCounter ? `${usedSlots} / ${totalLimit}` : `${totalLimit} slots`)
    : "Unlimited";

  return `
    <article class="event-card${featuredClass}">
      <div class="event-image" ${imageStyle}>
        <div class="event-status">${getStatusText(status)}</div>
      </div>

      <div class="event-content">
        <p class="event-type">${eventType}</p>

        <h3>${event.title || "-"}</h3>

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
            <small>Slots</small>
            <strong>${slotText}</strong>
          </div>
        </div>

        <p class="event-desc">
          ${event.short_description || ""}
        </p>

        <div class="event-price-row">
          <span>Fee From</span>
          <strong>${feeFrom}</strong>
        </div>

        <a href="event.html?event=${encodeURIComponent(event.slug)}" class="event-btn">
          ${getButtonText(status)}
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