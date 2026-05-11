import {
  json,
  cleanText,
  hashPassword,
  createSessionToken
} from "./_auth.js";

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();

    const username = cleanText(body.username).toLowerCase();
    const password = cleanText(body.password);

    if (!username || !password) {
      return json({
        success: false,
        error: "Username and password are required."
      }, 400);
    }

    const validUsername = cleanText(context.env.ADMIN_USERNAME).toLowerCase();
    const validPassword = cleanText(context.env.ADMIN_PASSWORD);
    const adminToken = cleanText(context.env.ADMIN_TOKEN);

    /*
      MASTER ADMIN LOGIN
      Existing login masih kekal:
      ADMIN_USERNAME + ADMIN_PASSWORD => ADMIN_TOKEN
    */
    if (
      validUsername &&
      validPassword &&
      adminToken &&
      username === validUsername &&
      password === validPassword
    ) {
      return json({
        success: true,
        token: adminToken,
        username: validUsername,
        role: "master",
        access_mode: "master",
        event_slug: ""
      });
    }

    /*
      EVENT ADMIN LOGIN
      Login dari D1 table admin_users
    */
    const user = await context.env.DB.prepare(`
      SELECT
        id,
        username,
        password_salt,
        password_hash,
        role,
        access_mode,
        event_slug,
        is_active
      FROM admin_users
      WHERE lower(username) = ?
        AND is_active = 1
      LIMIT 1
    `).bind(username).first();

    if (!user) {
      return json({
        success: false,
        error: "Invalid username or password."
      }, 401);
    }

    const inputHash = await hashPassword(password, user.password_salt);

    if (inputHash !== user.password_hash) {
      return json({
        success: false,
        error: "Invalid username or password."
      }, 401);
    }

    await context.env.DB.prepare(`
      DELETE FROM admin_sessions
      WHERE admin_user_id = ?
    `).bind(user.id).run();

    const token = createSessionToken();

    await context.env.DB.prepare(`
      INSERT INTO admin_sessions (
        token,
        admin_user_id,
        expires_at,
        created_at
      )
      VALUES (
        ?,
        ?,
        datetime('now', '+12 hours'),
        CURRENT_TIMESTAMP
      )
    `).bind(token, user.id).run();

    return json({
      success: true,
      token,
      username: user.username,
      role: user.role,
      access_mode: user.access_mode || "own_event",
      event_slug: user.event_slug || ""
    });

  } catch (err) {
    return json({
      success: false,
      error: err.message
    }, 500);
  }
}