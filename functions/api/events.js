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

  const activeCategoryCount = Number(event.active_category_count || 0);
  const limitedCategoryCount = Number(event.limited_category_count || 0);
  const fullCategoryCount = Number(event.full_category_count || 0);

  if (
    activeCategoryCount > 0 &&
    limitedCategoryCount === activeCategoryCount &&
    fullCategoryCount === activeCategoryCount
  ) {
    return "FULL";
  }

  if (statusMode === "force_open") {
    return "OPEN";
  }

  return "CLOSED";
}

export async function onRequestGet(context) {
  try {
    const env = context.env || {};
    const DB = env.DB;

    if (!DB) {
      return json({
        success: false,
        error: "DB binding missing inside /api/events",
        envKeys: Object.keys(env)
      }, 500);
    }

const rows = await DB.prepare(`
  SELECT
    e.id,
    e.slug,
    e.title,
    e.event_type,
    e.short_description,
    e.venue,
    e.event_date,
    e.status_mode,
    e.open_at,
    e.close_at,
    e.total_limit,
    e.used_slots,
    e.show_slot_counter,
    e.sort_order,
    e.event_image,
    e.registration_mode,

    COALESCE(GROUP_CONCAT(c.name, ' / '), '-') AS categories_text,
    MIN(CASE WHEN c.is_active = 1 THEN c.price END) AS fee_from,

    COUNT(c.id) AS active_category_count,
    SUM(CASE WHEN c.slot_limit > 0 THEN 1 ELSE 0 END) AS limited_category_count,
    SUM(
      CASE
        WHEN c.slot_limit > 0
          AND c.used_slots >= c.slot_limit
        THEN 1
        ELSE 0
      END
    ) AS full_category_count

  FROM events e
  LEFT JOIN event_categories c
    ON c.event_id = e.id
    AND c.is_active = 1

  WHERE e.is_visible = 1
    AND COALESCE(e.approval_status, 'live') = 'live'

  GROUP BY e.id
  ORDER BY e.sort_order ASC, e.id DESC
`).all();

    const events = (rows.results || []).map(event => ({
      ...event,
      event_image: event.event_image || "",
      categories_text: event.categories_text || "",
      total_limit: Number(event.total_limit || 0),
      used_slots: Number(event.used_slots || 0),
      show_slot_counter: Number(event.show_slot_counter || 0),
      fee_from: Number(event.fee_from || 0),
      status: calculateEventStatus(event)
    }));

    return json({
      success: true,
      events
    });

  } catch (err) {
    return json({
      success: false,
      error: err.message || String(err),
      stack: err.stack || ""
    }, 500);
  }
}