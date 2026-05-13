import {
  json,
  requireAdmin,
  isMaster
} from "./_auth.js";

function cleanText(value) {
  return String(value || "").trim();
}

function normalizeText(value) {
  return cleanText(value).toLowerCase();
}

function cleanCode(value) {
  return String(value || "").trim().toUpperCase();
}

function generatePromoCode(prefix) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let tail = "";

  for (let i = 0; i < 6; i++) {
    tail += chars[Math.floor(Math.random() * chars.length)];
  }

  return `${cleanCode(prefix)}-${tail}`;
}

function canManageEvent(admin, event) {
  if (!admin || !event) return false;
  if (isMaster(admin)) return true;

  const adminId = Number(admin.id || 0);
  const ownerAdminId = Number(event.owner_admin_id || 0);

  if (adminId && ownerAdminId && adminId === ownerAdminId) {
    return true;
  }

  return normalizeText(event.slug) === normalizeText(admin.event_slug);
}

async function getEvent(context, eventId) {
  const event = await context.env.DB.prepare(`
    SELECT
      id,
      slug,
      title,
      owner_admin_id,
      owner_username,
      registration_mode
    FROM events
    WHERE id = ?
    LIMIT 1
  `).bind(eventId).first();

  return event || null;
}

export async function onRequestGet(context) {
  try {
    const auth = await requireAdmin(context);
    if (!auth.ok) return auth.response;

    const admin = auth.admin;
    const url = new URL(context.request.url);
    const eventId = Number(url.searchParams.get("event_id") || 0);

    if (!eventId) {
      return json({
        success: false,
        error: "Missing event ID."
      }, 400);
    }

    const event = await getEvent(context, eventId);

    if (!event) {
      return json({
        success: false,
        error: "Event not found."
      }, 404);
    }

    if (!canManageEvent(admin, event)) {
      return json({
        success: false,
        error: "Forbidden event."
      }, 403);
    }

    const rows = await context.env.DB.prepare(`
      SELECT
        id,
        event_id,
        code,
        prefix,
        discount_amount,
        usage_limit,
        used_count,
        is_active,
        created_at,
        updated_at
      FROM event_promo_codes
      WHERE event_id = ?
      ORDER BY id DESC
    `).bind(eventId).all();

    return json({
      success: true,
      promo_codes: rows.results || []
    });

  } catch (err) {
    return json({
      success: false,
      error: err.message || "LOAD_PROMO_CODES_FAILED"
    }, 500);
  }
}

export async function onRequestPost(context) {
  try {
    const auth = await requireAdmin(context);
    if (!auth.ok) return auth.response;

    const admin = auth.admin;
    const body = await context.request.json();

    const eventId = Number(body.event_id || 0);
    const prefix = cleanCode(body.prefix);
    const manualCode = cleanCode(body.code);
    const discountAmount = Number(body.discount_amount || 0);
    const usageLimit = Number(body.usage_limit || 0);
    const isActive = Number(body.is_active ?? 1) ? 1 : 0;

    if (!eventId) {
      return json({
        success: false,
        error: "Missing event ID."
      }, 400);
    }

    if (!prefix && !manualCode) {
      return json({
        success: false,
        error: "Prefix or promo code is required."
      }, 400);
    }

    if (discountAmount <= 0) {
      return json({
        success: false,
        error: "Discount amount is required."
      }, 400);
    }

    const event = await getEvent(context, eventId);

    if (!event) {
      return json({
        success: false,
        error: "Event not found."
      }, 404);
    }

    if (!canManageEvent(admin, event)) {
      return json({
        success: false,
        error: "Forbidden event."
      }, 403);
    }

    if (String(event.registration_mode || "internal").toLowerCase() === "external") {
      return json({
        success: false,
        error: "Promo code is only for internal events."
      }, 400);
    }

    const code = manualCode || generatePromoCode(prefix);
    const now = new Date().toISOString();

    await context.env.DB.prepare(`
      INSERT INTO event_promo_codes (
        event_id,
        code,
        prefix,
        discount_amount,
        usage_limit,
        used_count,
        is_active,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)
    `).bind(
      eventId,
      code,
      prefix,
      discountAmount,
      usageLimit,
      isActive,
      now,
      now
    ).run();

    return json({
      success: true,
      message: "Promo code created.",
      code
    });

  } catch (err) {
    return json({
      success: false,
      error: err.message || "CREATE_PROMO_CODE_FAILED"
    }, 500);
  }
}