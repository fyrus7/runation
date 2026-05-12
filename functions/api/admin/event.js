import {
  json,
  requireAdmin,
  isMaster
} from "./_auth.js";

function cleanText(value) {
  return String(value || "").trim();
}

function normalizeText(value) {
  return cleanText(value).toLowerCase();
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

function canManageEvent(admin, event) {
  if (!admin || !event) return false;
  if (isMaster(admin)) return true;

  const adminId = Number(admin.id || 0);
  const ownerAdminId = Number(event.owner_admin_id || 0);

  if (adminId && ownerAdminId && adminId === ownerAdminId) {
    return true;
  }

  // Fallback untuk event lama yang belum ada owner_admin_id
  return normalizeText(event.slug) === normalizeText(admin.event_slug);
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
  const auth = await requireAdmin(context);
  if (!auth.ok) return auth.response;

  const admin = auth.admin;
  const id = Number(new URL(context.request.url).searchParams.get("id") || 0);

  if (!id) {
    return json({ success: false, error: "INVALID_EVENT_ID" }, 400);
  }

  const data = await getEventWithCategories(context.env, id);

  if (!data) {
    return json({ success: false, error: "EVENT_NOT_FOUND" }, 404);
  }

  if (!canManageEvent(admin, data.event)) {
    return json({ success: false, error: "FORBIDDEN_EVENT" }, 403);
  }

  return json({
    success: true,
    ...data
  });
}

export async function onRequestPatch(context) {
  const auth = await requireAdmin(context);
  if (!auth.ok) return auth.response;

  const admin = auth.admin;
  const id = Number(new URL(context.request.url).searchParams.get("id") || 0);
  const body = await context.request.json();

  if (!id) {
    return json({ success: false, error: "INVALID_EVENT_ID" }, 400);
  }

  const existing = await context.env.DB.prepare(`
    SELECT
      id,
      slug,
      owner_admin_id,
      owner_username,
      registration_mode,
      external_registration_url
    FROM events
    WHERE id = ?
    LIMIT 1
  `).bind(id).first();

  if (!existing) {
    return json({ success: false, error: "EVENT_NOT_FOUND" }, 404);
  }

  if (!canManageEvent(admin, existing)) {
    return json({ success: false, error: "FORBIDDEN_EVENT" }, 403);
  }

  const accessMode = String(admin.access_mode || "own_event").toLowerCase();

  let registrationMode = cleanText(body.registration_mode || existing.registration_mode || "internal").toLowerCase();

  if (!["internal", "external"].includes(registrationMode)) {
    registrationMode = "internal";
  }

  if (!isMaster(admin)) {
    if (accessMode === "external_only") {
      registrationMode = "external";
    } else {
      registrationMode = "internal";
    }
  }

  let externalRegistrationUrl = "";

  if (registrationMode === "external") {
    externalRegistrationUrl = cleanText(
      body.external_registration_url || existing.external_registration_url
    );

    if (!externalRegistrationUrl) {
      return json({
        success: false,
        error: "External registration URL is required."
      }, 400);
    }
  }
<<<<<<< HEAD
=======
  
  const showSlotCounter = Number(body.show_slot_counter || 0) ? 1 : 0;
  const isVisible = Number(body.is_visible ?? 1) ? 1 : 0;
>>>>>>> cleanup-file-structure

  await context.env.DB.prepare(`
    UPDATE events
    SET
      slug = ?,
      title = ?,
      event_type = ?,
      short_description = ?,
      venue = ?,
      organizer_name = ?,
      organizer_url = ?,
      event_date = ?,
	  racepack_location = ?,
	  racepack_date = ?,
	  racepack_time = ?,
      status_mode = ?,
      open_at = ?,
      close_at = ?,
      total_limit = ?,
      show_slot_counter = ?,
      is_visible = ?,
      sort_order = ?,
      event_image = ?,
      registration_mode = ?,
      external_registration_url = ?,
      postage_enabled = ?,
      postage_fee = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(
    normalizeText(body.slug),
    cleanText(body.title),
    cleanText(body.event_type),
    cleanText(body.short_description),
    cleanText(body.venue),
    cleanText(body.organizer_name),
    cleanText(body.organizer_url),
    cleanText(body.event_date),
	cleanText(body.racepack_location),
	cleanText(body.racepack_date),
	cleanText(body.racepack_time),
    cleanText(body.status_mode || "force_closed"),
    cleanText(body.open_at),
    cleanText(body.close_at),
    Number(body.total_limit || 0),
	showSlotCounter,
	isVisible,
	Number(body.sort_order || 0),
    cleanText(body.event_image),
    registrationMode,
    externalRegistrationUrl,
    Number(body.postage_enabled || 0),
    Number(body.postage_fee || 0),
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
    const auth = await requireAdmin(context);
    if (!auth.ok) return auth.response;

    const admin = auth.admin;
	if (!isMaster(admin)) {
  return json({
    success: false,
    error: "Master only. Event admins can hide events instead of deleting."
  }, 403);
}
    const id = Number(new URL(context.request.url).searchParams.get("id") || 0);

    if (!id) {
      return json({ success: false, error: "INVALID_EVENT_ID" }, 400);
    }

    const event = await context.env.DB.prepare(`
      SELECT
        id,
        slug,
        owner_admin_id,
        owner_username
      FROM events
      WHERE id = ?
      LIMIT 1
    `).bind(id).first();

    if (!event) {
      return json({ success: false, error: "EVENT_NOT_FOUND" }, 404);
    }

    if (!canManageEvent(admin, event)) {
      return json({ success: false, error: "FORBIDDEN_EVENT" }, 403);
    }

    const regTableInfo = await context.env.DB.prepare(`
      PRAGMA table_info(registrations)
    `).all();

    const regColumns = new Set(
      (regTableInfo.results || []).map(col => col.name)
    );

    let regCount = { total: 0 };

    if (regColumns.has("event_id")) {
      regCount = await context.env.DB.prepare(`
        SELECT COUNT(*) AS total
        FROM registrations
        WHERE event_id = ?
      `).bind(id).first();

    } else if (regColumns.has("event_slug")) {
      regCount = await context.env.DB.prepare(`
        SELECT COUNT(*) AS total
        FROM registrations
        WHERE event_slug = ?
      `).bind(event.slug).first();

    } else if (regColumns.has("slug")) {
      regCount = await context.env.DB.prepare(`
        SELECT COUNT(*) AS total
        FROM registrations
        WHERE slug = ?
      `).bind(event.slug).first();

    } else {
      return json({
        success: false,
        error: "Cannot verify registrations. No event_id, event_slug, or slug column found in registrations table."
      }, 400);
    }

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