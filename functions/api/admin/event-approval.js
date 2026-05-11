import {
  json,
  requireAdmin,
  isMaster
} from "./_auth.js";

function cleanText(value) {
  return String(value || "").trim();
}

function getApproverId(admin) {
  return admin.id ?? admin.username ?? "master";
}

async function markApprovalNotificationRead(env, eventId) {
  await env.DB.prepare(`
    UPDATE master_notifications
    SET is_read = 1
    WHERE related_event_id = ?
      AND type = 'event_pending_approval'
  `).bind(eventId).run().catch(() => {});
}

export async function onRequestPost(context) {
  try {
    const auth = await requireAdmin(context);
    if (!auth.ok) return auth.response;

    const admin = auth.admin;

    if (!isMaster(admin)) {
      return json({
        success: false,
        error: "Master only."
      }, 403);
    }

    const body = await context.request.json().catch(() => ({}));

    const eventId = Number(body.event_id || 0);
    const action = cleanText(body.action).toLowerCase();

    if (!eventId) {
      return json({
        success: false,
        error: "Invalid event_id."
      }, 400);
    }

    if (!["approve", "return_to_sandbox"].includes(action)) {
      return json({
        success: false,
        error: "Invalid approval action."
      }, 400);
    }

    const event = await context.env.DB.prepare(`
      SELECT
        id,
        slug,
        title,
        approval_status
      FROM events
      WHERE id = ?
      LIMIT 1
    `).bind(eventId).first();

    if (!event) {
      return json({
        success: false,
        error: "Event not found."
      }, 404);
    }

    if (action === "approve") {
      await context.env.DB.prepare(`
        UPDATE events
        SET approval_status = 'live',
            approved_by = ?,
            approved_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(
        getApproverId(admin),
        eventId
      ).run();

      await markApprovalNotificationRead(context.env, eventId);

      return json({
        success: true,
        message: "Event approved and live.",
        event_id: eventId,
        approval_status: "live"
      });
    }

    if (action === "return_to_sandbox") {
      await context.env.DB.prepare(`
        UPDATE events
        SET approval_status = 'sandbox',
            approved_by = NULL,
            approved_at = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(eventId).run();

      return json({
        success: true,
        message: "Event returned to sandbox.",
        event_id: eventId,
        approval_status: "sandbox"
      });
    }

  } catch (err) {
    return json({
      success: false,
      error: err.message || "Approval update failed."
    }, 500);
  }
}