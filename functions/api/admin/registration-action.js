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

async function releaseSlot(env, registration) {
  const event = await env.DB.prepare(`
    SELECT id
    FROM events
    WHERE slug = ?
    LIMIT 1
  `).bind(registration.event_slug).first();

  await env.DB.prepare(`
    UPDATE events
    SET
      used_slots = CASE
        WHEN used_slots > 0 THEN used_slots - 1
        ELSE 0
      END,
      updated_at = CURRENT_TIMESTAMP
    WHERE slug = ?
  `).bind(registration.event_slug).run();

  if (event && registration.category) {
    await env.DB.prepare(`
      UPDATE event_categories
      SET
        used_slots = CASE
          WHEN used_slots > 0 THEN used_slots - 1
          ELSE 0
        END
      WHERE event_id = ?
        AND UPPER(name) = UPPER(?)
    `).bind(
      event.id,
      registration.category
    ).run();
  }
}

export async function onRequestPost(context) {
  if (!isAdmin(context)) {
    return json({ success: false, error: "UNAUTHORIZED" }, 401);
  }

  try {
    const body = await context.request.json();

    const regNo = cleanText(body.reg_no);
    const action = cleanText(body.action);

    if (!regNo || !action) {
      return json({
        success: false,
        error: "Missing reg_no or action."
      }, 400);
    }

    const allowed = ["mark_paid", "cancel", "expire"];

    if (!allowed.includes(action)) {
      return json({
        success: false,
        error: "Invalid action."
      }, 400);
    }

    const registration = await context.env.DB.prepare(`
      SELECT
        id,
        reg_no,
        event_slug,
        category,
        payment_status,
        paid_at
      FROM registrations
      WHERE reg_no = ?
      LIMIT 1
    `).bind(regNo).first();

    if (!registration) {
      return json({
        success: false,
        error: "Registration not found."
      }, 404);
    }

    const currentStatus = String(registration.payment_status || "").toUpperCase();

    if (action === "mark_paid") {
      if (currentStatus === "PAID") {
        return json({
          success: true,
          message: "Registration already marked as PAID."
        });
      }

      await context.env.DB.prepare(`
        UPDATE registrations
        SET
          payment_status = 'PAID',
          paid_at = COALESCE(paid_at, CURRENT_TIMESTAMP),
          updated_at = CURRENT_TIMESTAMP
        WHERE reg_no = ?
      `).bind(regNo).run();

      return json({
        success: true,
        message: "Registration marked as PAID."
      });
    }

    if (action === "cancel") {
      if (currentStatus === "PAID") {
        return json({
          success: false,
          error: "Cannot cancel a PAID registration here."
        }, 400);
      }

      if (currentStatus === "PENDING_PAYMENT") {
        await releaseSlot(context.env, registration);
      }

      await context.env.DB.prepare(`
        UPDATE registrations
        SET
          payment_status = 'CANCELLED',
          updated_at = CURRENT_TIMESTAMP
        WHERE reg_no = ?
      `).bind(regNo).run();

      return json({
        success: true,
        message: "Registration cancelled."
      });
    }

    if (action === "expire") {
      if (currentStatus === "PAID") {
        return json({
          success: false,
          error: "Cannot expire a PAID registration."
        }, 400);
      }

      if (currentStatus === "PENDING_PAYMENT") {
        await releaseSlot(context.env, registration);
      }

      await context.env.DB.prepare(`
        UPDATE registrations
        SET
          payment_status = 'EXPIRED',
          updated_at = CURRENT_TIMESTAMP
        WHERE reg_no = ?
      `).bind(regNo).run();

      return json({
        success: true,
        message: "Registration expired."
      });
    }

  } catch (err) {
    return json({
      success: false,
      error: err.message
    }, 500);
  }
}