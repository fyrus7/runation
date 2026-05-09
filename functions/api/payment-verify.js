export async function onRequestPost(context) {
  try {
    const body = await context.request.json();

    const ref = String(body.reg_no || body.ref || body.group_id || "").trim();
    const billcode = String(body.billcode || body.billCode || body.BillCode || "").trim();

    if (!ref || !billcode) {
      return Response.json(
        {
          success: false,
          error: "Missing payment reference or billcode"
        },
        { status: 400 }
      );
    }

    const existing = await context.env.DB
      .prepare(`
        SELECT
          id,
          reg_no,
          group_id,
          payment_ref,
          payment_status,
          amount,
          event_slug,
          event_name
        FROM registrations
        WHERE payment_ref = ?
          AND (
            reg_no = ?
            OR group_id = ?
          )
        ORDER BY participant_index ASC, id ASC
        LIMIT 1
      `)
      .bind(billcode, ref, ref)
      .first();

    if (!existing) {
      return Response.json(
        {
          success: false,
          error: "Registration not found"
        },
        { status: 404 }
      );
    }

    const summary = await context.env.DB
      .prepare(`
        SELECT
          COUNT(*) AS participant_count,
          SUM(amount) AS total_amount
        FROM registrations
        WHERE payment_ref = ?
          AND (
            reg_no = ?
            OR group_id = ?
          )
      `)
      .bind(billcode, ref, ref)
      .first();

    const form = new URLSearchParams();
    form.append("billCode", billcode);
    form.append("billpaymentStatus", "1");

    const toyyibpayBase =
      context.env.TOYYIBPAY_MODE === "sandbox"
        ? "https://dev.toyyibpay.com"
        : "https://toyyibpay.com";

    const toyRes = await fetch(`${toyyibpayBase}/index.php/api/getBillTransactions`, {
      method: "POST",
      body: form
    });

    const raw = await toyRes.text();

    let toyData;
    try {
      toyData = JSON.parse(raw);
    } catch (e) {
      throw new Error("Invalid ToyyibPay response: " + raw);
    }

    const tx = Array.isArray(toyData) ? toyData[0] : null;

    if (!tx) {
      return Response.json({
        success: true,
        paid: false,
        message: "No successful ToyyibPay transaction found",
        registration_status: existing.payment_status,
        registration_no: existing.reg_no,
        group_id: existing.group_id || existing.reg_no,
        participant_count: Number(summary?.participant_count || 1),
        total_amount: Number(summary?.total_amount || existing.amount || 0),
        event_slug: existing.event_slug,
        event_name: existing.event_name,
        raw: toyData
      });
    }

    const billStatus = String(tx.billpaymentStatus || tx.billStatus || "");
    const externalRef = String(tx.billExternalReferenceNo || "");

    if (externalRef && externalRef !== ref) {
      return Response.json(
        {
          success: false,
          error: "ToyyibPay reference does not match payment reference",
          expected: ref,
          received: externalRef
        },
        { status: 409 }
      );
    }

    if (billStatus === "1") {
      const now = new Date().toISOString();

      await context.env.DB
        .prepare(`
          UPDATE registrations
          SET
            payment_status = 'PAID',
            paid_at = COALESCE(paid_at, ?),
            updated_at = ?
          WHERE payment_ref = ?
            AND (
              reg_no = ?
              OR group_id = ?
            )
        `)
        .bind(now, now, billcode, ref, ref)
        .run();

      return Response.json({
        success: true,
        paid: true,
        payment_status: "PAID",
        transaction_id: tx.billpaymentInvoiceNo || "",
        payment_date: tx.billPaymentDate || "",
        registration_no: existing.reg_no,
        group_id: existing.group_id || existing.reg_no,
        participant_count: Number(summary?.participant_count || 1),
        total_amount: Number(summary?.total_amount || existing.amount || 0),
        event_slug: existing.event_slug,
        event_name: existing.event_name
      });
    }

    return Response.json({
      success: true,
      paid: false,
      payment_status: existing.payment_status,
      billpaymentStatus: billStatus,
      registration_no: existing.reg_no,
      group_id: existing.group_id || existing.reg_no,
      participant_count: Number(summary?.participant_count || 1),
      total_amount: Number(summary?.total_amount || existing.amount || 0),
      event_slug: existing.event_slug,
      event_name: existing.event_name
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