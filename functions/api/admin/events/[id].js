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

async function getEventWithCategories(env, id) {
  const event = await env.DB.prepare(`
    SELECT *
    FROM events
    WHERE id = ?
    LIMIT 1
  `).bind(id).first();

  if (!event) return null;

  const categories = await env.DB.prepare(`
    SELECT *
    FROM event_categories
    WHERE event_id = ?
    ORDER BY id ASC
  `).bind(id).all();

  return {
    event: {
      ...event,
      status: calculateEventStatus(event)
    },
    categories: categories.results || []
  };
}

export async function onRequestGet(context) {
  if (!isAdmin(context)) {
    return json({ success: false, error: "UNAUTHORIZED" }, 401);
  }

  const id = Number(context.params.id || 0);

  const data = await getEventWithCategories(context.env, id);

  if (!data) {
    return json({ success: false, error: "EVENT_NOT_FOUND" }, 404);
  }

  return json({
    success: true,
    ...data
  });
}

export async function onRequestPatch(context) {
  if (!isAdmin(context)) {
    return json({ success: false, error: "UNAUTHORIZED" }, 401);
  }

  const id = Number(context.params.id || 0);
  const body = await context.request.json();

  const existing = await context.env.DB.prepare(`
    SELECT id
    FROM events
    WHERE id = ?
    LIMIT 1
  `).bind(id).first();

  if (!existing) {
    return json({ success: false, error: "EVENT_NOT_FOUND" }, 404);
  }

  await context.env.DB.prepare(`
    UPDATE events
    SET
      slug = ?,
      title = ?,
      event_type = ?,
      short_description = ?,
      venue = ?,
      event_date = ?,
      status_mode = ?,
      open_at = ?,
      close_at = ?,
      total_limit = ?,
	  show_slot_counter = ?,
      is_visible = ?,
      sort_order = ?,
	  event_image = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(
    cleanText(body.slug).toLowerCase(),
    cleanText(body.title),
    cleanText(body.event_type),
    cleanText(body.short_description),
    cleanText(body.venue),
    cleanText(body.event_date),
    cleanText(body.status_mode || "force_closed"),
    cleanText(body.open_at),
    cleanText(body.close_at),
    Number(body.total_limit || 0),
	Number(body.show_slot_counter || 0),
    Number(body.is_visible ?? 1),
    Number(body.sort_order || 0),
	 cleanText(body.event_image),
    id
  ).run();

  const categories = body.categories || [];

  for (const cat of categories) {
    const catId = Number(cat.id || 0);
    const name = cleanText(cat.name);

    if (!name) continue;

    if (catId) {
      await context.env.DB.prepare(`
        UPDATE event_categories
        SET
          name = ?,
          price = ?,
          slot_limit = ?,
          is_active = ?
        WHERE id = ?
          AND event_id = ?
      `).bind(
        name,
        Number(cat.price || 0),
        Number(cat.slot_limit || 0),
        Number(cat.is_active ?? 1),
        catId,
        id
      ).run();
    } else {
      await context.env.DB.prepare(`
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
        id,
        name,
        Number(cat.price || 0),
        Number(cat.slot_limit || 0),
        Number(cat.is_active ?? 1)
      ).run();
    }
  }

  return json({
    success: true
  });
}


export async function onRequestDelete(context) {
  try {
    if (!isAdmin(context)) {
      return json({ success: false, error: "UNAUTHORIZED" }, 401);
    }

    const id = Number(context.params.id || 0);

    if (!id) {
      return json({ success: false, error: "INVALID_EVENT_ID" }, 400);
    }

    const existing = await context.env.DB.prepare(`
      SELECT id
      FROM events
      WHERE id = ?
      LIMIT 1
    `).bind(id).first();

    if (!existing) {
      return json({ success: false, error: "EVENT_NOT_FOUND" }, 404);
    }

    const regCount = await context.env.DB.prepare(`
      SELECT COUNT(*) AS total
      FROM registrations
      WHERE event_id = ?
    `).bind(id).first();

    if (Number(regCount?.total || 0) > 0) {
      return json({
        success: false,
        error: "Cannot delete event with existing registrations. Hide the event instead."
      }, 400);
    }

    await context.env.DB.prepare(`
      DELETE FROM event_categories
      WHERE event_id = ?
    `).bind(id).run();

    await context.env.DB.prepare(`
      DELETE FROM events
      WHERE id = ?
    `).bind(id).run();

    return json({
      success: true
    });

  } catch (err) {
    return json({
      success: false,
      error: err.message || "DELETE_EVENT_FAILED"
    }, 500);
  }
}