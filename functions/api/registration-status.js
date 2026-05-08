export async function onRequestPost(context) {
  try {
    const body = await context.request.json();

    const ref = String(body.ref || "").trim();
    const ic = String(body.ic || "").trim();

    if (!ref && !ic) {
      return Response.json(
        {
          success: false,
          error: "Please enter registration number or IC."
        },
        { status: 400 }
      );
    }

    let row;

    if (ref) {
      row = await context.env.DB
        .prepare(`
          SELECT
            reg_no,
            name,
            ic,
            category,
            amount,
            payment_status,
            payment_url,
            payment_ref,
            paid_at
          FROM registrations
          WHERE reg_no = ?
          LIMIT 1
        `)
        .bind(ref)
        .first();
    } else {
      row = await context.env.DB
        .prepare(`
          SELECT
            reg_no,
            name,
            ic,
            category,
            amount,
            payment_status,
            payment_url,
            payment_ref,
            paid_at
          FROM registrations
          WHERE ic = ?
          LIMIT 1
        `)
        .bind(ic)
        .first();
    }

    if (!row) {
      return Response.json(
        {
          success: false,
          error: "Registration not found."
        },
        { status: 404 }
      );
    }

    return Response.json({
      success: true,
      registration: {
        reg_no: row.reg_no,
        name: row.name,
        category: row.category,
        amount: row.amount,
        payment_status: row.payment_status,
        payment_url: row.payment_url,
        payment_ref: row.payment_ref,
        paid_at: row.paid_at
      }
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