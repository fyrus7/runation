import { json } from "../../server/lib/response.js";

function malaysiaNow() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");
}

function getToyyibPayConfig(env, registration) {
  const gateway = String(registration.payment_gateway || "").toUpperCase();
  const isTest = Number(registration.is_test || 0) === 1;

  if (gateway === "TOYYIBPAY_SANDBOX" || isTest) {
    return {
      baseUrl: env.TOYYIBPAY_SANDBOX_BASE_URL || "https://dev.toyyibpay.com"
    };
  }

  return {
    baseUrl: env.TOYYIBPAY_LIVE_BASE_URL || env.TOYYIBPAY_BASE_URL || "https://toyyibpay.com"
  };
}

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();

    const ref = String(body.reg_no || body.ref || body.group_id || "").trim();
    const billcode = String(body.billcode || body.billCode || body.BillCode || "").trim();

    if (!ref || !billcode) {
      return json(
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
          payment_gateway,
          is_test,
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
      return json(
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

    const toyyib = getToyyibPayConfig(context.env, existing);

    const form = new URLSearchParams();
    form.append("billCode", billcode);
    form.append("billpaymentStatus", "1");

    const toyRes = await fetch(`${toyyib.baseUrl}/index.php/api/getBillTransactions`, {
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
      return json({
        success: true,
        paid: false,
        message: "No successful ToyyibPay transaction found",
        registration_status: existing.payment_status,
        payment_gateway: existing.payment_gateway,
        is_test: Number(existing.is_test || 0),
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
      return json(
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
      const now = malaysiaNow();

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

      return json({
        success: true,
        paid: true,
        payment_status: "PAID",
        payment_gateway: existing.payment_gateway,
        is_test: Number(existing.is_test || 0),
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

    return json({
      success: true,
      paid: false,
      payment_status: existing.payment_status,
      payment_gateway: existing.payment_gateway,
      is_test: Number(existing.is_test || 0),
      billpaymentStatus: billStatus,
      registration_no: existing.reg_no,
      group_id: existing.group_id || existing.reg_no,
      participant_count: Number(summary?.participant_count || 1),
      total_amount: Number(summary?.total_amount || existing.amount || 0),
      event_slug: existing.event_slug,
      event_name: existing.event_name
    });

  } catch (err) {
    return json(
      {
        success: false,
        error: err.message
      },
      { status: 500 }
    );
  }
}