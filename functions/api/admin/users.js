import {
  json,
  requireAdmin,
  isMaster,
  createSalt,
  hashPassword
} from "./_auth.js";

function cleanText(value) {
  return String(value || "").trim();
}

function normalizeText(value) {
  return cleanText(value).toLowerCase();
}

async function requireMasterAdmin(context) {
  const auth = await requireAdmin(context);
  if (!auth.ok) return auth;

  if (!isMaster(auth.admin)) {
    return {
      ok: false,
      response: json({
        success: false,
        error: "Master only."
      }, 403)
    };
  }

  return auth;
}

async function getEventBySlug(env, slug) {
  if (!slug) return null;

  return env.DB.prepare(`
    SELECT
      id,
      slug,
      title,
      owner_admin_id
    FROM events
    WHERE lower(slug) = ?
    LIMIT 1
  `).bind(normalizeText(slug)).first();
}

async function assignEventOwner(env, user, eventSlug) {
  if (!eventSlug) return;

  await env.DB.prepare(`
    UPDATE events
    SET
      owner_admin_id = ?,
      owner_username = ?,
      created_by_admin_id = COALESCE(created_by_admin_id, ?),
      created_by_username = COALESCE(created_by_username, ?),
      updated_at = CURRENT_TIMESTAMP
    WHERE lower(slug) = ?
  `).bind(
    user.id,
    user.username,
    user.id,
    user.username,
    normalizeText(eventSlug)
  ).run();
}

export async function onRequestGet(context) {
  const auth = await requireMasterAdmin(context);
  if (!auth.ok) return auth.response;

  const rows = await context.env.DB.prepare(`
    SELECT
      u.id,
      u.username,
      u.role,
      u.access_mode,
      u.event_slug,
      u.is_active,
      u.created_at,
      u.updated_at,
      (
        SELECT COUNT(*)
        FROM events e
        WHERE e.owner_admin_id = u.id
           OR lower(e.owner_username) = lower(u.username)
      ) AS owned_event_count
    FROM admin_users u
    ORDER BY u.id DESC
  `).all();

  return json({
    success: true,
    users: rows.results || []
  });
}

export async function onRequestPost(context) {
  const auth = await requireMasterAdmin(context);
  if (!auth.ok) return auth.response;

  const body = await context.request.json();

  const username = normalizeText(body.username);
  const password = cleanText(body.password);
  const role = normalizeText(body.role || "event_admin");
  const accessMode = normalizeText(body.access_mode || "own_event");
  const eventSlug = normalizeText(body.event_slug);

  if (!username || !password) {
    return json({
      success: false,
      error: "Username and password are required."
    }, 400);
  }

  if (!["event_admin"].includes(role)) {
    return json({
      success: false,
      error: "Only event_admin users can be created here."
    }, 400);
  }

  if (!["own_event", "external_only"].includes(accessMode)) {
    return json({
      success: false,
      error: "Invalid access mode."
    }, 400);
  }

  if (accessMode === "own_event" && eventSlug) {
    const assignedEvent = await getEventBySlug(context.env, eventSlug);

    if (!assignedEvent) {
      return json({
        success: false,
        error: "Assigned event slug not found."
      }, 404);
    }

    if (assignedEvent.owner_admin_id) {
      return json({
        success: false,
        error: "This event already has an owner admin."
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
  const passwordHash = await hashPassword(password, salt);

  const result = await context.env.DB.prepare(`
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
    passwordHash,
    role,
    accessMode === "external_only" ? "" : eventSlug,
    accessMode
  ).run();

  const userId = result.meta?.last_row_id;

  if (accessMode === "own_event" && eventSlug && userId) {
    await assignEventOwner(context.env, {
      id: userId,
      username
    }, eventSlug);
  }

  return json({
    success: true,
    message: "Admin user created.",
    user: {
      id: userId,
      username,
      role,
      access_mode: accessMode,
      event_slug: accessMode === "external_only" ? "" : eventSlug,
      is_active: 1
    }
  });
}

export async function onRequestPatch(context) {
  const auth = await requireMasterAdmin(context);
  if (!auth.ok) return auth.response;

  const url = new URL(context.request.url);
  const id = Number(url.searchParams.get("id") || 0);
  const body = await context.request.json();

  if (!id) {
    return json({
      success: false,
      error: "Invalid user ID."
    }, 400);
  }

  const existing = await context.env.DB.prepare(`
    SELECT *
    FROM admin_users
    WHERE id = ?
    LIMIT 1
  `).bind(id).first();

  if (!existing) {
    return json({
      success: false,
      error: "Admin user not found."
    }, 404);
  }

  const username = normalizeText(body.username || existing.username);
  const password = cleanText(body.password);
  const role = "event_admin";
  const accessMode = normalizeText(body.access_mode || existing.access_mode || "own_event");
  const eventSlug = normalizeText(body.event_slug);
  const isActive = Number(body.is_active ?? existing.is_active ?? 1) === 1 ? 1 : 0;

  if (!username) {
    return json({
      success: false,
      error: "Username is required."
    }, 400);
  }

  if (!["own_event", "external_only"].includes(accessMode)) {
    return json({
      success: false,
      error: "Invalid access mode."
    }, 400);
  }

  const duplicate = await context.env.DB.prepare(`
    SELECT id
    FROM admin_users
    WHERE lower(username) = ?
      AND id != ?
    LIMIT 1
  `).bind(username, id).first();

  if (duplicate) {
    return json({
      success: false,
      error: "Username already exists."
    }, 409);
  }

  if (accessMode === "own_event" && eventSlug) {
    const assignedEvent = await getEventBySlug(context.env, eventSlug);

    if (!assignedEvent) {
      return json({
        success: false,
        error: "Assigned event slug not found."
      }, 404);
    }

    if (
      assignedEvent.owner_admin_id &&
      Number(assignedEvent.owner_admin_id) !== id
    ) {
      return json({
        success: false,
        error: "This event already has another owner admin."
      }, 409);
    }
  }

  if (password) {
    const salt = createSalt();
    const passwordHash = await hashPassword(password, salt);

    await context.env.DB.prepare(`
      UPDATE admin_users
      SET
        username = ?,
        password_salt = ?,
        password_hash = ?,
        role = ?,
        access_mode = ?,
        event_slug = ?,
        is_active = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      username,
      salt,
      passwordHash,
      role,
      accessMode,
      accessMode === "external_only" ? "" : eventSlug,
      isActive,
      id
    ).run();
  } else {
    await context.env.DB.prepare(`
      UPDATE admin_users
      SET
        username = ?,
        role = ?,
        access_mode = ?,
        event_slug = ?,
        is_active = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      username,
      role,
      accessMode,
      accessMode === "external_only" ? "" : eventSlug,
      isActive,
      id
    ).run();
  }

  await context.env.DB.prepare(`
    DELETE FROM admin_sessions
    WHERE admin_user_id = ?
  `).bind(id).run();

  if (accessMode === "own_event" && eventSlug) {
    await assignEventOwner(context.env, {
      id,
      username
    }, eventSlug);
  }

  return json({
    success: true,
    message: "Admin user updated."
  });
}

export async function onRequestDelete(context) {
  const auth = await requireMasterAdmin(context);
  if (!auth.ok) return auth.response;

  const url = new URL(context.request.url);
  const id = Number(url.searchParams.get("id") || 0);

  if (!id) {
    return json({
      success: false,
      error: "Invalid user ID."
    }, 400);
  }

  const existing = await context.env.DB.prepare(`
    SELECT id, username
    FROM admin_users
    WHERE id = ?
    LIMIT 1
  `).bind(id).first();

  if (!existing) {
    return json({
      success: false,
      error: "Admin user not found."
    }, 404);
  }

  await context.env.DB.prepare(`
    UPDATE admin_users
    SET
      is_active = 0,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(id).run();

  await context.env.DB.prepare(`
    DELETE FROM admin_sessions
    WHERE admin_user_id = ?
  `).bind(id).run();

  return json({
    success: true,
    message: "Admin user disabled."
  });
}