export async function onRequestPost(context) {
  try {
    const body = await context.request.json();

    const reg_no = String(body.reg_no || "").trim();
    const billcode = String(body.billcode || "").trim();

    if (!reg_no || !billcode) {
      return Response.json(
        {
          success: false,
          error: "Missing reg_no or billcode"
        },
        { status: 400 }
      );
    }

    const existing = await context.env.DB
      .prepare(`
        SELECT id, reg_no, payment_ref, payment_status, amount
        FROM registrations
        WHERE reg_no = ?
          AND payment_ref = ?
        LIMIT 1
      `)
      .bind(reg_no, billcode)
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

    const form = new URLSearchParams();
    form.append("billCode", billcode);
    form.append("billpaymentStatus", "1");

    const toyRes = await fetch("https://toyyibpay.com/index.php/api/getBillTransactions", {
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
        raw: toyData
      });
    }

    const billStatus = String(tx.billpaymentStatus || tx.billStatus || "");
    const externalRef = String(tx.billExternalReferenceNo || "");

    if (externalRef && externalRef !== reg_no) {
      return Response.json(
        {
          success: false,
          error: "ToyyibPay reference does not match registration",
          expected: reg_no,
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
          WHERE reg_no = ?
            AND payment_ref = ?
        `)
        .bind(now, now, reg_no, billcode)
        .run();

      return Response.json({
        success: true,
        paid: true,
        payment_status: "PAID",
        transaction_id: tx.billpaymentInvoiceNo || "",
        payment_date: tx.billPaymentDate || "",
        registration_no: reg_no
      });
    }

    return Response.json({
      success: true,
      paid: false,
      payment_status: existing.payment_status,
      billpaymentStatus: billStatus
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