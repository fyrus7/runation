export async function onRequestGet(context) {
  try {
    const url = new URL(context.request.url);

    const q = String(url.searchParams.get("q") || "").trim();
    const status = String(url.searchParams.get("status") || "").trim();
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10), 200);
    const offset = Math.max(parseInt(url.searchParams.get("offset") || "0", 10), 0);

    const where = [];
    const binds = [];

    if (q) {
      where.push(`
        (
          reg_no LIKE ?
          OR name LIKE ?
          OR ic LIKE ?
          OR phone LIKE ?
          OR email LIKE ?
        )
      `);

      const search = `%${q}%`;
      binds.push(search, search, search, search, search);
    }

    if (status) {
      where.push(`payment_status = ?`);
      binds.push(status);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const countRow = await context.env.DB
      .prepare(`
        SELECT COUNT(*) AS total
        FROM registrations
        ${whereSql}
      `)
      .bind(...binds)
      .first();

    const rows = await context.env.DB
      .prepare(`
        SELECT
          reg_no,
          name,
          ic,
          email,
          phone,
          category,
          tshirt_size,
          amount,
          payment_status,
          payment_gateway,
          payment_ref,
          payment_url,
          created_at,
          paid_at,
          updated_at
        FROM registrations
        ${whereSql}
        ORDER BY created_at DESC
        LIMIT ?
        OFFSET ?
      `)
      .bind(...binds, limit, offset)
      .all();

    return Response.json({
      success: true,
      total: countRow?.total || 0,
      limit,
      offset,
      participants: rows.results || []
    });

  } catch (err) {
    return Response.json(
      {
        success: false,
        error: err.message
      },
      { status: 500 }
    );
  }
}