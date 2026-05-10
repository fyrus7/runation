import { json } from "../../../server/lib/response.js";

function isAdmin(context) {
  const auth = context.request.headers.get("Authorization") || "";
  return auth === `Bearer ${context.env.ADMIN_TOKEN}`;
}

export async function onRequestPost(context) {
  if (!isAdmin(context)) {
    return json({ success: false, error: "UNAUTHORIZED" }, 401);
  }

  try {
    const rows = await context.env.DB.prepare(`
      SELECT
        r.id,
        r.reg_no,
        r.event_slug,
        r.category,
        r.payment_status,
        r.created_at,
        e.id AS event_id
      FROM registrations r
      LEFT JOIN events e
        ON e.slug = r.event_slug
      WHERE r.payment_status = 'PENDING_PAYMENT'
        AND r.created_at <= datetime('now', '-1 hour')
      ORDER BY r.id ASC
      LIMIT 500
    `).all();

    const expiredRows = rows.results || [];

    let expiredCount = 0;
    let releasedEventSlots = 0;
    let releasedCategorySlots = 0;

    for (const row of expiredRows) {
      const updateReg = await context.env.DB.prepare(`
        UPDATE registrations
        SET
          payment_status = 'EXPIRED',
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
          AND payment_status = 'PENDING_PAYMENT'
      `).bind(row.id).run();

      if (!updateReg.meta || updateReg.meta.changes < 1) {
        continue;
      }

      expiredCount++;

      const eventUpdate = await context.env.DB.prepare(`
        UPDATE events
        SET
          used_slots = CASE
            WHEN used_slots > 0 THEN used_slots - 1
            ELSE 0
          END,
          updated_at = CURRENT_TIMESTAMP
        WHERE slug = ?
      `).bind(row.event_slug).run();

      if (eventUpdate.meta && eventUpdate.meta.changes > 0) {
        releasedEventSlots++;
      }

      if (row.event_id && row.category) {
        const catUpdate = await context.env.DB.prepare(`
          UPDATE event_categories
          SET
            used_slots = CASE
              WHEN used_slots > 0 THEN used_slots - 1
              ELSE 0
            END
          WHERE event_id = ?
            AND UPPER(name) = UPPER(?)
        `).bind(row.event_id, row.category).run();

        if (catUpdate.meta && catUpdate.meta.changes > 0) {
          releasedCategorySlots++;
        }
      }
    }

    return json({
      success: true,
      expired_count: expiredCount,
      released_event_slots: releasedEventSlots,
      released_category_slots: releasedCategorySlots,
      checked: expiredRows.length
    });

  } catch (err) {
    return json({
      success: false,
      error: err.message
    }, 500);
  }
}