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

export async function onRequestGet(context) {
  const auth = await requireAdmin(context);
  if (!auth.ok) return auth.response;

  const admin = auth.admin;
  const url = new URL(context.request.url);

  const requestedEventSlug = normalizeText(url.searchParams.get("event_slug"));
  const status = cleanText(url.searchParams.get("status"));
  const search = cleanText(url.searchParams.get("search"));

  const where = [];
  const binds = [];

  if (isMaster(admin)) {
    if (requestedEventSlug) {
      where.push("lower(r.event_slug) = ?");
      binds.push(requestedEventSlug);
    }
  } else {
    where.push(`
      EXISTS (
        SELECT 1
        FROM events e
        WHERE lower(e.slug) = lower(r.event_slug)
          AND (
            e.owner_admin_id = ?
            OR lower(e.owner_username) = ?
            OR lower(e.slug) = ?
          )
      )
    `);

    binds.push(
      Number(admin.id || 0),
      normalizeText(admin.username),
      normalizeText(admin.event_slug)
    );

    if (requestedEventSlug) {
      where.push("lower(r.event_slug) = ?");
      binds.push(requestedEventSlug);
    }
  }

  if (status) {
    where.push("upper(r.payment_status) = upper(?)");
    binds.push(status);
  }

  if (search) {
    where.push(`(
      r.reg_no LIKE ?
      OR r.name LIKE ?
      OR r.ic LIKE ?
      OR r.phone LIKE ?
      OR r.email LIKE ?
    )`);

    const like = `%${search}%`;
    binds.push(like, like, like, like, like);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const rows = await context.env.DB.prepare(`
    SELECT
      r.id,
      r.reg_no,
      r.name,
      r.ic,
      r.email,
      r.phone,
      r.gender,
      r.category,
      r.address,
      r.event_tee_size,
      r.finisher_tee_size,
      r.emergency_name,
      r.emergency_phone,
      r.event_slug,
      r.event_name,
      r.amount,
      r.payment_status,
      r.payment_gateway,
      r.payment_ref,
      r.payment_url,
      r.created_at,
      r.paid_at,
      r.updated_at
    FROM registrations r
    ${whereSql}
    ORDER BY r.id DESC
    LIMIT 500
  `).bind(...binds).all();

  return json({
    success: true,
    registrations: rows.results || []
  });
}