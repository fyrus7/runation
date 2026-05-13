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

function canManagePromo(admin, promo) {
  if (!admin || !promo) return false;
  if (isMaster(admin)) return true;

  const adminId = Number(admin.id || 0);
  const ownerAdminId = Number(promo.owner_admin_id || 0);

  if (adminId && ownerAdminId && adminId === ownerAdminId) {
    return true;
  }

  return normalizeText(promo.event_slug) === normalizeText(admin.event_slug);
}

async function getPromo(context, id) {
  const promo = await context.env.DB.prepare(`
    SELECT
      p.id,
      p.event_id,
      p.code,
      p.prefix,
      p.discount_amount,
      p.usage_limit,
      p.used_count,
      p.is_active,
      e.slug AS event_slug,
      e.owner_admin_id,
      e.owner_username
    FROM event_promo_codes p
    JOIN events e ON e.id = p.event_id
    WHERE p.id = ?
    LIMIT 1
  `).bind(id).first();

  return promo || null;
}

export async function onRequestPatch(context) {
  try {
    const auth = await requireAdmin(context);
    if (!auth.ok) return auth.response;

    const admin = auth.admin;
    const url = new URL(context.request.url);
    const id = Number(url.searchParams.get("id") || 0);
    const body = await context.request.json();

    if (!id) {
      return json({
        success: false,
        error: "Missing promo code ID."
      }, 400);
    }

    const promo = await getPromo(context, id);

    if (!promo) {
      return json({
        success: false,
        error: "Promo code not found."
      }, 404);
    }

    if (!canManagePromo(admin, promo)) {
      return json({
        success: false,
        error: "Forbidden promo code."
      }, 403);
    }

    const discountAmount = Number(body.discount_amount || 0);
    const usageLimit = Number(body.usage_limit || 0);
    const isActive = Number(body.is_active ?? 1) ? 1 : 0;

    if (discountAmount <= 0) {
      return json({
        success: false,
        error: "Discount amount is required."
      }, 400);
    }

    await context.env.DB.prepare(`
      UPDATE event_promo_codes
      SET
        discount_amount = ?,
        usage_limit = ?,
        is_active = ?,
        updated_at = ?
      WHERE id = ?
    `).bind(
      discountAmount,
      usageLimit,
      isActive,
      new Date().toISOString(),
      id
    ).run();

    return json({
      success: true,
      message: "Promo code updated."
    });

  } catch (err) {
    return json({
      success: false,
      error: err.message || "UPDATE_PROMO_CODE_FAILED"
    }, 500);
  }
}

export async function onRequestDelete(context) {
  try {
    const auth = await requireAdmin(context);
    if (!auth.ok) return auth.response;

    const admin = auth.admin;
    const url = new URL(context.request.url);
    const id = Number(url.searchParams.get("id") || 0);

    if (!id) {
      return json({
        success: false,
        error: "Missing promo code ID."
      }, 400);
    }

    const promo = await getPromo(context, id);

    if (!promo) {
      return json({
        success: false,
        error: "Promo code not found."
      }, 404);
    }

    if (!canManagePromo(admin, promo)) {
      return json({
        success: false,
        error: "Forbidden promo code."
      }, 403);
    }

    if (Number(promo.used_count || 0) > 0) {
      await context.env.DB.prepare(`
        UPDATE event_promo_codes
        SET
          is_active = 0,
          updated_at = ?
        WHERE id = ?
      `).bind(
        new Date().toISOString(),
        id
      ).run();

      return json({
        success: true,
        message: "Promo code already used, so it was disabled instead."
      });
    }

    await context.env.DB.prepare(`
      DELETE FROM event_promo_codes
      WHERE id = ?
    `).bind(id).run();

    return json({
      success: true,
      message: "Promo code deleted."
    });

  } catch (err) {
    return json({
      success: false,
      error: err.message || "DELETE_PROMO_CODE_FAILED"
    }, 500);
  }
}