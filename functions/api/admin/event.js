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

function cleanStatusMode(value) {
  const mode = cleanText(value);

  if (mode === "force_open") return "force_open";
  return "force_closed";
}

function parseRunationDateTime(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  let text = raw.replace(" ", "T");

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    text = `${text}T00:00:00+08:00`;
  } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text)) {
    text = `${text}:00+08:00`;
  } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(text)) {
    text = `${text}+08:00`;
  }

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getEventDateEnd(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const dateOnly = raw.slice(0, 10);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
    return null;
  }

  const date = new Date(`${dateOnly}T23:59:59+08:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function calculateEventStatus(event) {
  const now = new Date();

  const statusMode = String(event.status_mode || "").trim();
  const openAt = parseRunationDateTime(event.open_at);
  const closeAt = parseRunationDateTime(event.close_at);
  const eventDateEnd = getEventDateEnd(event.event_date);

  const totalLimit = Number(event.total_limit || 0);
  const usedSlots = Number(event.used_slots || 0);

  if (statusMode === "force_closed") {
    return "CLOSED";
  }

  if (openAt && now < openAt) {
    return "UPCOMING";
  }

  if (closeAt && now > closeAt) {
    return "CLOSED";
  }

  if (eventDateEnd && now > eventDateEnd) {
    return "CLOSED";
  }

  if (totalLimit > 0 && usedSlots >= totalLimit) {
    return "FULL";
  }

  if (statusMode === "force_open") {
    return "OPEN";
  }

  return "CLOSED";
}

function canManageEvent(admin, event) {
  if (!admin || !event) return false;
  if (isMaster(admin)) return true;

  const adminId = Number(admin.id || 0);
  const ownerAdminId = Number(event.owner_admin_id || 0);

  if (adminId && ownerAdminId && adminId === ownerAdminId) {
    return true;
  }

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
      AND is_active = 1
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
  try {
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

    let registrationMode = cleanText(
      body.registration_mode || existing.registration_mode || "internal"
    ).toLowerCase();

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

    const showSlotCounter = Number(body.show_slot_counter || 0) ? 1 : 0;
    const isVisible = Number(body.is_visible ?? 1) ? 1 : 0;

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
		event_tee_enabled = ?,
		finisher_tee_enabled = ?,
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
      cleanStatusMode(body.status_mode),
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
	  Number(body.event_tee_enabled ?? 1),
	  Number(body.finisher_tee_enabled ?? 0),
      id
    ).run();

    if (Array.isArray(body.categories)) {
      const categories = body.categories;
      const keptCategoryIds = [];

      for (const cat of categories) {
        const catId = Number(cat.id || 0);
        const name = cleanText(cat.name).toUpperCase();

        if (!name) continue;

        const price = Number(cat.price || 0);
        const slotLimit = Number(cat.slot_limit || 0);
        const isActive = Number(cat.is_active ?? 1) ? 1 : 0;

        if (catId > 0) {
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
            price,
            slotLimit,
            isActive,
            catId,
            id
          ).run();

          keptCategoryIds.push(catId);
} else {
  const inserted = await context.env.DB.prepare(`
    INSERT INTO event_categories (
      event_id,
      name,
      price,
      slot_limit,
      used_slots,
      is_active
    )
    VALUES (?, ?, ?, ?, 0, 1)
    RETURNING id
  `).bind(
    id,
    name,
    price,
    slotLimit
  ).first();

  const newId = Number(inserted?.id || 0);

  if (newId > 0) {
    keptCategoryIds.push(newId);
  }
}
      }

      if (keptCategoryIds.length > 0) {
        const placeholders = keptCategoryIds.map(() => "?").join(",");

        await context.env.DB.prepare(`
          UPDATE event_categories
          SET is_active = 0
          WHERE event_id = ?
            AND id NOT IN (${placeholders})
        `).bind(
          id,
          ...keptCategoryIds
        ).run();
      } else if (categories.length === 0) {
        await context.env.DB.prepare(`
          UPDATE event_categories
          SET is_active = 0
          WHERE event_id = ?
        `).bind(id).run();
      }
    }

    return json({
      success: true
    });

  } catch (err) {
    return json({
      success: false,
      error: err.message || "UPDATE_EVENT_FAILED",
      stack: err.stack || ""
    }, 500);
  }
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