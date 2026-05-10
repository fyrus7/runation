function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8"
    }
  });
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

export async function onRequestGet(context) {
  try {
    const { env, params } = context;
    const slug = String(params.slug || "").trim();

    if (!slug) {
      return json({
        success: false,
        error: "MISSING_EVENT_SLUG"
      }, 400);
    }

    const event = await env.DB.prepare(`
      SELECT *
      FROM events
      WHERE slug = ?
      LIMIT 1
    `).bind(slug).first();

    if (!event) {
      return json({
        success: false,
        error: "EVENT_NOT_FOUND"
      }, 404);
    }

    const categories = await env.DB.prepare(`
      SELECT
        id,
        name,
        price,
        slot_limit,
        used_slots,
        is_active
      FROM event_categories
      WHERE event_id = ?
      ORDER BY id ASC
    `).bind(event.id).all();

    return json({
      success: true,
      event: {
        ...event,
        postage_enabled: Number(event.postage_enabled || 0),
        postage_fee: Number(event.postage_fee || 0),
        show_slot_counter: Number(event.show_slot_counter || 0),
        total_limit: Number(event.total_limit || 0),
        used_slots: Number(event.used_slots || 0),
        organizer_name: event.organizer_name || "",
        organizer_url: event.organizer_url || "",
        status: calculateEventStatus(event)
      },
      categories: categories.results || []
    });

  } catch (err) {
    return json({
      success: false,
      error: err.message
    }, 500);
  }
}