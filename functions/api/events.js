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
    const { env } = context;

    const rows = await env.DB.prepare(`
      SELECT
        e.id,
        e.slug,
        e.title,
        e.event_type,
        e.short_description,
        e.venue,
        e.event_date,
        e.status_mode,
        e.open_at,
        e.close_at,
        e.total_limit,
        e.used_slots,
		e.show_slot_counter,
        e.sort_order,

        COALESCE(GROUP_CONCAT(c.name, ' / '), '-') AS categories_text,
        MIN(CASE WHEN c.is_active = 1 THEN c.price END) AS fee_from

      FROM events e
      LEFT JOIN event_categories c
        ON c.event_id = e.id
        AND c.is_active = 1

      WHERE e.is_visible = 1

      GROUP BY e.id
      ORDER BY e.sort_order ASC, e.id DESC
    `).all();

    const events = (rows.results || []).map(event => ({
      ...event,
      status: calculateEventStatus(event)
    }));

    return json({
      success: true,
      events
    });

  } catch (err) {
    return json({
      success: false,
      error: err.message
    }, 500);
  }
}