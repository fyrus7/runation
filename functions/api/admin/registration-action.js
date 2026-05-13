import {
  json,
  requireAdmin,
  canAccessEvent
} from "./_auth.js";

function malaysiaNow() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");
}

function cleanText(value) {
  return String(value || "").trim();
}

async function releaseSlot(env, registration) {
  const now = malaysiaNow();

  const event = await env.DB.prepare(`
    SELECT id
    FROM events
    WHERE slug = ?
    LIMIT 1
  `).bind(registration.event_slug).first();

  await env.DB.prepare(`
    UPDATE events
    SET
      used_slots = CASE
        WHEN used_slots > 0 THEN used_slots - 1
        ELSE 0
      END,
      updated_at = ?
    WHERE slug = ?
  `).bind(now, registration.event_slug).run();

  if (event && registration.category) {
    await env.DB.prepare(`
      UPDATE event_categories
      SET
        used_slots = CASE
          WHEN used_slots > 0 THEN used_slots - 1
          ELSE 0
        END
      WHERE event_id = ?
        AND UPPER(name) = UPPER(?)
    `).bind(
      event.id,
      registration.category
    ).run();
  }
}

async function releasePromoUsage(env, registration) {
  const promoCode = String(registration.promo_code || "").trim().toUpperCase();

  if (!promoCode || !registration.event_id) return 0;

  const now = malaysiaNow();

  const result = await env.DB.prepare(`
    UPDATE event_promo_codes
    SET
      used_count = CASE
        WHEN used_count > 0 THEN used_count - 1
        ELSE 0
      END,
      updated_at = ?
    WHERE event_id = ?
      AND UPPER(code) = UPPER(?)
  `).bind(
    now,
    registration.event_id,
    promoCode
  ).run();

  return result.meta && result.meta.changes > 0 ? 1 : 0;
}

export async function onRequestPost(context) {
  const auth = await requireAdmin(context);
  if (!auth.ok) return auth.response;

  const admin = auth.admin;

  try {
    const body = await context.request.json();
	const now = malaysiaNow();

    const regNo = cleanText(body.reg_no);
    const action = cleanText(body.action);

    if (!regNo || !action) {
      return json({
        success: false,
        error: "Missing reg_no or action."
      }, 400);
    }

    const allowed = ["mark_paid", "cancel", "expire"];

    if (!allowed.includes(action)) {
      return json({
        success: false,
        error: "Invalid action."
      }, 400);
    }

const registration = await context.env.DB.prepare(`
  SELECT
    r.id,
    r.reg_no,
    r.group_id,
    r.event_slug,
    r.category,
    r.payment_status,
    r.paid_at,
    r.promo_code,
    r.promo_discount,
    e.id AS event_id
  FROM registrations r
  LEFT JOIN events e
    ON e.slug = r.event_slug
  WHERE r.reg_no = ?
  LIMIT 1
`).bind(regNo).first();

    if (!registration) {
      return json({
        success: false,
        error: "Registration not found."
      }, 404);
    }

    if (!canAccessEvent(admin, registration.event_slug)) {
      return json({
        success: false,
        error: "FORBIDDEN_EVENT"
      }, 403);
    }

    const currentStatus = String(registration.payment_status || "").toUpperCase();

    if (action === "mark_paid") {
      if (currentStatus === "PAID") {
        return json({
          success: true,
          message: "Registration already marked as PAID."
        });
      }

      await context.env.DB.prepare(`
  UPDATE registrations
  SET
    payment_status = 'PAID',
    paid_at = COALESCE(paid_at, ?),
    updated_at = ?
  WHERE reg_no = ?
`).bind(now, now, regNo).run();

      return json({
        success: true,
        message: "Registration marked as PAID."
      });
    }

    if (action === "cancel") {
      if (currentStatus === "PAID") {
        return json({
          success: false,
          error: "Cannot cancel a PAID registration here."
        }, 400);
      }

      if (currentStatus === "PENDING_PAYMENT") {
        await releaseSlot(context.env, registration);
		await releasePromoUsage(context.env, registration);
      }

      await context.env.DB.prepare(`
  UPDATE registrations
  SET
    payment_status = 'CANCELLED',
    updated_at = ?
  WHERE reg_no = ?
`).bind(now, regNo).run();

      return json({
        success: true,
        message: "Registration cancelled."
      });
    }

    if (action === "expire") {
      if (currentStatus === "PAID") {
        return json({
          success: false,
          error: "Cannot expire a PAID registration."
        }, 400);
      }

      if (currentStatus === "PENDING_PAYMENT") {
        await releaseSlot(context.env, registration);
		await releasePromoUsage(context.env, registration);
      }

      await context.env.DB.prepare(`
  UPDATE registrations
  SET
    payment_status = 'EXPIRED',
    updated_at = ?
  WHERE reg_no = ?
`).bind(now, regNo).run();

      return json({
        success: true,
        message: "Registration expired."
      });
    }

    return json({
      success: false,
      error: "Unhandled action."
    }, 400);

  } catch (err) {
    return json({
      success: false,
      error: err.message
    }, 500);
  }
}