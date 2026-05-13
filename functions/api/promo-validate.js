function json(data, status = 200) {
  return Response.json(data, { status });
}

function cleanText(value) {
  return String(value || "").trim();
}

function normalizeText(value) {
  return cleanText(value).toLowerCase();
}

function cleanCode(value) {
  return String(value || "").trim().toUpperCase();
}

function toSenFromRM(value) {
  return Math.round(Number(value || 0) * 100);
}

function toSen(value) {
  return Math.round(Number(value || 0));
}

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();

    const eventSlug = normalizeText(body.event_slug || body.slug);
    const promoCode = cleanCode(body.promo_code || body.code);
    const subtotalSen = toSen(body.subtotal_sen);

    if (!eventSlug) {
      return json({
        success: false,
        error: "Missing event."
      }, 400);
    }

    if (!promoCode) {
      return json({
        success: false,
        error: "Missing promo code."
      }, 400);
    }

    if (subtotalSen <= 0) {
      return json({
        success: false,
        error: "Invalid subtotal."
      }, 400);
    }

    const event = await context.env.DB.prepare(`
      SELECT
        id,
        slug,
        registration_mode
      FROM events
      WHERE lower(slug) = ?
      LIMIT 1
    `).bind(eventSlug).first();

    if (!event) {
      return json({
        success: false,
        error: "Event not found."
      }, 404);
    }

    if (String(event.registration_mode || "internal").toLowerCase() === "external") {
      return json({
        success: false,
        error: "Promo code is not available for this event."
      }, 400);
    }

    const promo = await context.env.DB.prepare(`
      SELECT
        id,
        code,
        discount_amount,
        usage_limit,
        used_count,
        is_active
      FROM event_promo_codes
      WHERE event_id = ?
        AND upper(code) = ?
      LIMIT 1
    `).bind(
      event.id,
      promoCode
    ).first();

    if (!promo || Number(promo.is_active || 0) !== 1) {
      return json({
        success: false,
        error: "Invalid promo code."
      }, 400);
    }

    const usageLimit = Number(promo.usage_limit || 0);
    const usedCount = Number(promo.used_count || 0);

    if (usageLimit > 0 && usedCount >= usageLimit) {
      return json({
        success: false,
        error: "Promo code limit reached."
      }, 400);
    }

    const discountSen = Math.min(
      toSenFromRM(promo.discount_amount),
      subtotalSen
    );

    const totalSen = Math.max(subtotalSen - discountSen, 0);

    if (totalSen < 100) {
      return json({
        success: false,
        error: "Total after discount must be at least RM1.00."
      }, 400);
    }

    return json({
      success: true,
      promo_code: promo.code,
      subtotal_sen: subtotalSen,
      discount_sen: discountSen,
      total_sen: totalSen
    });

  } catch (err) {
    return json({
      success: false,
      error: err.message || "VALIDATE_PROMO_FAILED"
    }, 500);
  }
}