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

function toNumber(value) {
  return Number(value || 0);
}

export async function onRequestGet(context) {
  try {
    const auth = await requireAdmin(context);
    if (!auth.ok) return auth.response;

    const admin = auth.admin;
    const url = new URL(context.request.url);

    const eventSlug = normalizeText(url.searchParams.get("event_slug"));
    const status = cleanText(url.searchParams.get("status")).toUpperCase();
    const search = cleanText(url.searchParams.get("search"));

    const totalWhere = ["UPPER(payment_status) = 'PAID'"];
    const totalBind = [];

    const filteredWhere = ["UPPER(payment_status) = 'PAID'"];
    const filteredBind = [];

    if (!isMaster(admin)) {
      const adminEventSlug = normalizeText(admin.event_slug);

      totalWhere.push("LOWER(event_slug) = ?");
      totalBind.push(adminEventSlug);

      filteredWhere.push("LOWER(event_slug) = ?");
      filteredBind.push(adminEventSlug);
    }

    if (eventSlug) {
      filteredWhere.push("LOWER(event_slug) = ?");
      filteredBind.push(eventSlug);
    }

    if (status) {
      filteredWhere.push("UPPER(payment_status) = ?");
      filteredBind.push(status);
    }

    if (search) {
      const like = `%${search}%`;

      filteredWhere.push(`
        (
          reg_no LIKE ?
          OR name LIKE ?
          OR ic LIKE ?
          OR phone LIKE ?
          OR email LIKE ?
          OR category LIKE ?
          OR event_name LIKE ?
          OR payment_ref LIKE ?
        )
      `);

      filteredBind.push(
        like,
        like,
        like,
        like,
        like,
        like,
        like,
        like
      );
    }

    const totalRow = await context.env.DB.prepare(`
      SELECT COALESCE(SUM(amount), 0) AS income_sen
      FROM registrations
      WHERE ${totalWhere.join(" AND ")}
    `).bind(...totalBind).first();

    const filteredRow = await context.env.DB.prepare(`
      SELECT COALESCE(SUM(amount), 0) AS income_sen
      FROM registrations
      WHERE ${filteredWhere.join(" AND ")}
    `).bind(...filteredBind).first();

    return json({
      success: true,
      total_income_sen: toNumber(totalRow?.income_sen),
      filtered_income_sen: toNumber(filteredRow?.income_sen)
    });

  } catch (err) {
    return json({
      success: false,
      error: err.message || "LOAD_INCOME_FAILED"
    }, 500);
  }
}