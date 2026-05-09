function json(data, status = 200) {
  return Response.json(data, { status });
}

function isAdmin(context) {
  const auth = context.request.headers.get("Authorization") || "";
  return auth === `Bearer ${context.env.ADMIN_TOKEN}`;
}

function cleanText(value) {
  return String(value || "").trim();
}

export async function onRequestGet(context) {
  if (!isAdmin(context)) {
    return json({ success: false, error: "UNAUTHORIZED" }, 401);
  }

  const url = new URL(context.request.url);

  const eventSlug = cleanText(url.searchParams.get("event_slug"));
  const status = cleanText(url.searchParams.get("status"));
  const search = cleanText(url.searchParams.get("search"));

  let where = [];
  let binds = [];

  if (eventSlug) {
    where.push("event_slug = ?");
    binds.push(eventSlug);
  }

  if (status) {
    where.push("payment_status = ?");
    binds.push(status);
  }

  if (search) {
    where.push(`(
      reg_no LIKE ?
      OR name LIKE ?
      OR ic LIKE ?
      OR phone LIKE ?
      OR email LIKE ?
    )`);

    const like = `%${search}%`;
    binds.push(like, like, like, like, like);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const rows = await context.env.DB.prepare(`
    SELECT
      id,
      reg_no,
      name,
      ic,
      email,
      phone,
      gender,
      category,
      address,
      event_tee_size,
      finisher_tee_size,
      emergency_name,
      emergency_phone,
      event_slug,
      event_name,
      amount,
      payment_status,
      payment_gateway,
      payment_ref,
      payment_url,
      created_at,
      paid_at,
      updated_at
    FROM registrations
    ${whereSql}
    ORDER BY id DESC
    LIMIT 500
  `).bind(...binds).all();

  return json({
    success: true,
    registrations: rows.results || []
  });
}