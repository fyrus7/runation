import { json } from "../../server/lib/response.js";

function parseRunationDateTime(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  let text = raw.replace(" ", "T");

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    text = `${text}T00:00:00+08:00`;
  } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text)) {
    text = `${text}:00+08:00`;
  } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(text)) {
    text = `${text}+08:00`;
  }

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getEventDateEnd(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const dateOnly = raw.slice(0, 10);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
    return null;
  }

  const date = new Date(`${dateOnly}T23:59:59+08:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function calculateEventStatus(event) {
  const now = new Date();

  const statusMode = String(event.status_mode || "").trim();
  const openAt = parseRunationDateTime(event.open_at);
  const closeAt = parseRunationDateTime(event.close_at);
  const eventDateEnd = getEventDateEnd(event.event_date);

  const totalLimit = Number(event.total_limit || 0);
  const usedSlots = Number(event.used_slots || 0);

  if (statusMode === "force_closed") {
    return "CLOSED";
  }

  if (openAt && now < openAt) {
    return "UPCOMING";
  }

  if (closeAt && now > closeAt) {
    return "CLOSED";
  }

  if (eventDateEnd && now > eventDateEnd) {
    return "CLOSED";
  }

  if (totalLimit > 0 && usedSlots >= totalLimit) {
    return "FULL";
  }

  if (statusMode === "force_open") {
    return "OPEN";
  }

  return "CLOSED";
}

export async function onRequestGet(context) {
  try {
    const { env } = context;
    const slug = String(
      new URL(context.request.url).searchParams.get("slug") || ""
    ).trim();

    if (!slug) {
      return json({
        success: false,
        error: "MISSING_EVENT_SLUG"
      }, 400);
    }

const event = await env.DB.prepare(`
  SELECT *
  FROM events
  WHERE slug = ?
    AND COALESCE(approval_status, 'live') IN ('live', 'sandbox')
  LIMIT 1
`).bind(slug).first();

    if (!event) {
      return json({
        success: false,
        error: "EVENT_NOT_FOUND"
      }, 404);
    }

    const categories = await env.DB.prepare(`
      SELECT
        id,
        name,
        price,
        slot_limit,
        used_slots,
        is_active
      FROM event_categories
      WHERE event_id = ?
      ORDER BY id ASC
    `).bind(event.id).all();

    return json({
      success: true,
      event: {
        ...event,
        postage_enabled: Number(event.postage_enabled || 0),
        postage_fee: Number(event.postage_fee || 0),
        show_slot_counter: Number(event.show_slot_counter || 0),
        total_limit: Number(event.total_limit || 0),
        used_slots: Number(event.used_slots || 0),
        organizer_name: event.organizer_name || "",
        organizer_url: event.organizer_url || "",
		racepack_location: event.racepack_location || "",
		racepack_date: event.racepack_date || "",
		racepack_time: event.racepack_time || "",
        status: String(event.approval_status || "").toLowerCase() === "sandbox"
  		  ? "OPEN"
		  : calculateEventStatus(event)
      },
      categories: categories.results || []
    });

  } catch (err) {
    return json({
      success: false,
      error: err.message
    }, 500);
  }
}