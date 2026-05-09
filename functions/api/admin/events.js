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
  if (!isAdmin(context)) {
    return json({ success: false, error: "UNAUTHORIZED" }, 401);
  }

  const rows = await context.env.DB.prepare(`
    SELECT *
    FROM events
    ORDER BY sort_order ASC, id DESC
  `).all();

  const events = (rows.results || []).map(event => ({
    ...event,
    status: calculateEventStatus(event)
  }));

  return json({
    success: true,
    events
  });
}

export async function onRequestPost(context) {
  if (!isAdmin(context)) {
    return json({ success: false, error: "UNAUTHORIZED" }, 401);
  }

  const body = await context.request.json();

  const slug = cleanText(body.slug).toLowerCase();
  const title = cleanText(body.title);

  if (!slug || !title) {
    return json({
      success: false,
      error: "Slug and title are required."
    }, 400);
  }

  const result = await context.env.DB.prepare(`
    INSERT INTO events (
      slug,
      title,
      event_type,
      short_description,
      venue,
      event_date,
      status_mode,
      open_at,
      close_at,
      total_limit,
      used_slots,
      is_visible,
      sort_order,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).bind(
    slug,
    title,
    cleanText(body.event_type),
    cleanText(body.short_description),
    cleanText(body.venue),
    cleanText(body.event_date),
    cleanText(body.status_mode || "force_closed"),
    cleanText(body.open_at),
    cleanText(body.close_at),
    Number(body.total_limit || 0),
    Number(body.is_visible ?? 1),
    Number(body.sort_order || 0)
  ).run();

  const eventId = result.meta.last_row_id;

  await insertCategories(context.env, eventId, body.categories || []);

  return json({
    success: true,
    id: eventId
  });
}