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

    if (role === "event_admin" && !eventSlug) {
      return json({
        success: false,
        error: "event_slug is required for event admin."
      }, 400);
    }

    if (role === "event_admin") {
      const event = await context.env.DB.prepare(`
        SELECT id
        FROM events
        WHERE lower(slug) = ?
        LIMIT 1
      `).bind(eventSlug).first();

      if (!event) {
        return json({
          success: false,
          error: "Event not found."
        }, 404);
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

    await context.env.DB.prepare(`
      INSERT INTO admin_users (
        username,
        password_salt,
        password_hash,
        role,
        event_slug,
        is_active,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).bind(
      username,
      salt,
      hash,
      role,
      role === "master" ? "" : eventSlug
    ).run();

    return json({
      success: true,
      message: "Admin user created.",
      username,
      role,
      event_slug: role === "master" ? "" : eventSlug
    });

  } catch (err) {
    return json({
      success: false,
      error: err.message
    }, 500);
  }
}