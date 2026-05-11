import {
  json,
  requireAdmin,
  isMaster
} from "./_auth.js";

function cleanText(value) {
  return String(value || "").trim();
}

function calculateEventStatus(event) {
  const now = new Date();

  if (event.status_mode === "force_open") return "OPEN";
  if (event.status_mode === "force_closed") return "CLOSED";

  if (event.open_at) {
    const openAt = new Date(event.open_at);
    if (now < openAt) return "UPCOMING";
  }

  if (event.close_at) {
    const closeAt = new Date(event.close_at);
    if (now > closeAt) return "CLOSED";
  }

  const totalLimit = Number(event.total_limit || 0);
  const usedSlots = Number(event.used_slots || 0);

  if (totalLimit > 0 && usedSlots >= totalLimit) return "FULL";

  return "OPEN";
}

async function insertCategories(env, eventId, categories) {
  for (const cat of categories || []) {
    const name = cleanText(cat.name);
    if (!name) continue;

    await env.DB.prepare(`
      INSERT INTO event_categories (
        event_id,
        name,
        price,
        slot_limit,
        used_slots,
        is_active
      )
      VALUES (?, ?, ?, ?, 0, ?)
    `).bind(
      eventId,
      name,
      Number(cat.price || 0),
      Number(cat.slot_limit || 0),
      Number(cat.is_active ?? 1)
    ).run();
  }
}

export async function onRequestGet(context) {
  const auth = await requireAdmin(context);
  if (!auth.ok) return auth.response;

  const admin = auth.admin;

  let result;

  if (isMaster(admin)) {
    result = await context.env.DB.prepare(`
      SELECT *
      FROM events
      ORDER BY sort_order ASC, id DESC
    `).all();
  } else {
    result = await context.env.DB.prepare(`
      SELECT *
      FROM events
      WHERE owner_admin_id = ?
         OR lower(slug) = ?
      ORDER BY sort_order ASC, id DESC
    `).bind(
      admin.id,
      String(admin.event_slug || "").toLowerCase()
    ).all();
  }

  return json({
    success: true,
    events: result.results || []
  });
}

export async function onRequestPost(context) {
  const auth = await requireAdmin(context);
  if (!auth.ok) return auth.response;

  const admin = auth.admin;
  const body = await context.request.json();

  const slug = cleanText(body.slug).toLowerCase();
  const title = cleanText(body.title);

  if (!slug || !title) {
    return json({
      success: false,
      error: "Slug and title are required."
    }, 400);
  }

const accessMode = cleanText(admin.access_mode || "own_event").toLowerCase();
const requestedRegistrationMode = cleanText(body.registration_mode || "internal").toLowerCase();

let registrationMode = requestedRegistrationMode;
let externalRegistrationUrl = cleanText(body.external_registration_url);

if (!isMaster(admin)) {
  if (accessMode === "own_event") {
    if (requestedRegistrationMode === "external") {
      return json({
        success: false,
        error: "This admin can only create own/internal events."
      }, 403);
    }

    registrationMode = "internal";
    externalRegistrationUrl = "";
  }

  else if (accessMode === "external_only") {
    registrationMode = "external";

    if (!externalRegistrationUrl) {
      return json({
        success: false,
        error: "External registration URL is required."
      }, 400);
    }
  }

  else {
    return json({
      success: false,
      error: "Invalid admin access mode."
    }, 403);
  }
}

const ownerAdminId = isMaster(admin) ? null : admin.id;
const ownerUsername = isMaster(admin) ? "" : admin.username;

const approvalStatus = isMaster(admin) ? "live" : "sandbox";
const approvedBy = isMaster(admin) ? admin.id : null;
const approvedAt = isMaster(admin) ? new Date().toISOString() : null;

const createdByAdminId = isMaster(admin) ? null : admin.id;
const createdByUsername = isMaster(admin) ? "master" : admin.username;

  const organizerName = cleanText(body.organizer_name);
  const organizerUrl = cleanText(body.organizer_url);

  const result = await context.env.DB.prepare(`
INSERT INTO events (
  slug,
  title,
  event_type,
  short_description,
  venue,
  organizer_name,
  organizer_url,
  event_date,
  status_mode,
  open_at,
  close_at,
  total_limit,
  used_slots,
  show_slot_counter,
  is_visible,
  sort_order,
  event_image,
  registration_mode,
  external_registration_url,
  postage_enabled,
  postage_fee,
  owner_admin_id,
  owner_username,
  approval_status,
  approved_by,
  approved_at,
  created_by_admin_id,
  created_by_username,
  created_at,
  updated_at
)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  `).bind(
    slug,
    title,
    cleanText(body.event_type),
    cleanText(body.short_description),
    cleanText(body.venue),
    organizerName,
    organizerUrl,
    cleanText(body.event_date),
    cleanText(body.status_mode || "force_closed"),
    cleanText(body.open_at),
    cleanText(body.close_at),
    Number(body.total_limit || 0),
    Number(body.show_slot_counter || 0),
    Number(body.is_visible ?? 1),
    Number(body.sort_order || 0),
    cleanText(body.event_image),
    registrationMode,
    externalRegistrationUrl,
    Number(body.postage_enabled || 0),
	Number(body.postage_fee || 0),
	ownerAdminId,
	ownerUsername,
	approvalStatus,
	approvedBy,
	approvedAt,
	createdByAdminId,
	createdByUsername
  ).run();

  const eventId = result.meta.last_row_id;

if (registrationMode === "internal") {
  await insertCategories(context.env, eventId, body.categories || []);
}

if (!isMaster(admin)) {
  await context.env.DB.prepare(`
    INSERT INTO master_notifications (
      type,
      title,
      message,
      related_event_id,
      related_event_slug,
      created_by_admin_id,
      created_by_username,
      is_read,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP)
  `).bind(
    "event_pending_approval",
    "New event pending approval",
    `${admin.username} created a new ${registrationMode} event: ${title}`,
    eventId,
    slug,
    admin.id,
    admin.username
  ).run();
}

  return json({
    success: true,
    id: eventId
  });
}