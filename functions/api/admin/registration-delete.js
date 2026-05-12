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

function buildFilterWhere(body, admin) {
  const where = [];
  const binds = [];

  const eventSlug = cleanText(body.event_slug);
  const status = cleanText(body.status).toUpperCase();
  const search = cleanText(body.search);

  if (eventSlug) {
    where.push("event_slug = ?");
    binds.push(eventSlug);
  }

  if (status) {
    where.push("payment_status = ?");
    binds.push(status);
  }

  if (search) {
    const like = `%${search}%`;

    where.push(`
      (
        reg_no LIKE ?
        OR name LIKE ?
        OR ic LIKE ?
        OR phone LIKE ?
        OR email LIKE ?
      )
    `);

    binds.push(like, like, like, like, like);
  }

  if (!isMaster(admin)) {
    const adminEventSlug = cleanText(admin.event_slug);

    if (!adminEventSlug) {
      throw new Error("Admin event access is not configured.");
    }

    if (eventSlug && normalizeText(eventSlug) !== normalizeText(adminEventSlug)) {
      throw new Error("FORBIDDEN_EVENT");
    }

    where.push("event_slug = ?");
    binds.push(adminEventSlug);
  }

  return {
    whereSql: where.length ? `WHERE ${where.join(" AND ")}` : "",
    binds
  };
}

export async function onRequestPost(context) {
  try {
    const auth = await requireAdmin(context);
    if (!auth.ok) return auth.response;

    const admin = auth.admin;
    const body = await context.request.json();

    const mode = cleanText(body.mode);

    if (mode === "single") {
      const regNo = cleanText(body.reg_no);

      if (!regNo) {
        return json({
          success: false,
          error: "Registration number is required."
        }, 400);
      }

      const existing = await context.env.DB.prepare(`
        SELECT reg_no, event_slug
        FROM registrations
        WHERE reg_no = ?
        LIMIT 1
      `).bind(regNo).first();

      if (!existing) {
        return json({
          success: false,
          error: "Registration not found."
        }, 404);
      }

      if (!isMaster(admin)) {
        const adminEventSlug = normalizeText(admin.event_slug);

        if (!adminEventSlug || normalizeText(existing.event_slug) !== adminEventSlug) {
          return json({
            success: false,
            error: "FORBIDDEN_EVENT"
          }, 403);
        }
      }

      await context.env.DB.prepare(`
        DELETE FROM registrations
        WHERE reg_no = ?
      `).bind(regNo).run();

      return json({
        success: true,
        deleted_count: 1,
        message: "Registration deleted."
      });
    }

    if (mode === "current_list") {
      const { whereSql, binds } = buildFilterWhere(body, admin);

      if (!whereSql && !isMaster(admin)) {
        return json({
          success: false,
          error: "Event filter is required."
        }, 400);
      }

      const countRow = await context.env.DB.prepare(`
        SELECT COUNT(*) AS total
        FROM registrations
        ${whereSql}
      `).bind(...binds).first();

      const total = Number(countRow?.total || 0);

      if (total <= 0) {
        return json({
          success: true,
          deleted_count: 0,
          message: "No registrations matched current filter."
        });
      }

      await context.env.DB.prepare(`
        DELETE FROM registrations
        ${whereSql}
      `).bind(...binds).run();

      return json({
        success: true,
        deleted_count: total,
        message: `Deleted ${total} registration(s).`
      });
    }

    return json({
      success: false,
      error: "Invalid delete mode."
    }, 400);

  } catch (err) {
    return json({
      success: false,
      error: err.message || "DELETE_REGISTRATION_FAILED"
    }, 500);
  }
}