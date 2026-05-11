import {
  json,
  cleanText,
  hashPassword,
  createSalt,
  requireMaster
} from "./_auth.js";

export async function onRequestPost(context) {
  const auth = await requireMaster(context);
  if (!auth.ok) return auth.response;

  try {
    const body = await context.request.json();

    const username = cleanText(body.username).toLowerCase();
    const password = cleanText(body.password);
    const role = cleanText(body.role || "event_admin").toLowerCase();
    const eventSlug = cleanText(body.event_slug).toLowerCase();

    const requestedAccessMode = cleanText(body.access_mode || "own_event").toLowerCase();

    const accessMode = role === "master"
      ? "master"
      : requestedAccessMode;

    if (!username || !password) {
      return json({
        success: false,
        error: "Username and password are required."
      }, 400);
    }

    if (!["master", "event_admin"].includes(role)) {
      return json({
        success: false,
        error: "Invalid role."
      }, 400);
    }

    if (role === "event_admin" && !["own_event", "external_only"].includes(accessMode)) {
      return json({
        success: false,
        error: "Invalid access mode."
      }, 400);
    }

    let assignedEvent = null;

    if (role === "event_admin" && eventSlug) {
      assignedEvent = await context.env.DB.prepare(`
        SELECT
          id,
          slug,
          owner_admin_id,
          owner_username
        FROM events
        WHERE lower(slug) = ?
        LIMIT 1
      `).bind(eventSlug).first();

      if (!assignedEvent) {
        return json({
          success: false,
          error: "Event not found."
        }, 404);
      }

      if (assignedEvent.owner_admin_id) {
        return json({
          success: false,
          error: "This event already has an owner."
        }, 409);
      }
    }

    const existing = await context.env.DB.prepare(`
      SELECT id
      FROM admin_users
      WHERE lower(username) = ?
      LIMIT 1
    `).bind(username).first();

    if (existing) {
      return json({
        success: false,
        error: "Username already exists."
      }, 409);
    }

    const salt = createSalt();
    const hash = await hashPassword(password, salt);

    const inserted = await context.env.DB.prepare(`
      INSERT INTO admin_users (
        username,
        password_salt,
        password_hash,
        role,
        event_slug,
        access_mode,
        is_active,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).bind(
      username,
      salt,
      hash,
      role,
      role === "master" ? "" : eventSlug,
      accessMode
    ).run();

    const userId = inserted.meta.last_row_id;

    if (role === "event_admin" && assignedEvent) {
      await context.env.DB.prepare(`
        UPDATE events
        SET
          owner_admin_id = ?,
          owner_username = ?,
          created_by_admin_id = COALESCE(created_by_admin_id, ?),
          created_by_username = COALESCE(created_by_username, ?),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(
        userId,
        username,
        userId,
        username,
        assignedEvent.id
      ).run();
    }

    return json({
      success: true,
      message: "Admin user created.",
      id: userId,
      username,
      role,
      access_mode: accessMode,
      event_slug: role === "master" ? "" : eventSlug
    });

  } catch (err) {
    return json({
      success: false,
      error: err.message
    }, 500);
  }
}