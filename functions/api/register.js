const EVENTS = {
  "tanjong-karang-half-marathon-2026": {
    slug: "tanjong-karang-half-marathon-2026",
    name: "TANJONG KARANG HALF MARATHON 2026",
    billName: "TKHM 2026",
    prefix: "TKHM",
    requireFinisherTee: true,
    categories: {
      "21KM": 8800
    }
  },

  "lsptk": {
    slug: "lsptk",
    name: "WASIYYAH LARIAN SAWAH PADI TANJONG KARANG",
    billName: "LSPTK 2026",
    prefix: "LSPTK",
    requireFinisherTee: false,
    categories: {
      "5KM": 6500,
      "8KM": 7500
    }
  }
};

function json(data, status = 200) {
  return Response.json(data, { status });
}

function limitText(value, max) {
  return String(value || "").trim().slice(0, max);
}

function makeRegNo(prefix) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}`;
}

async function deletePendingRow(context, id) {
  await context.env.DB
    .prepare(`
      DELETE FROM registrations
      WHERE id = ?
        AND payment_status = 'PENDING_PAYMENT'
    `)
    .bind(id)
    .run();
}

export async function onRequestPost(context) {
  let insertedId = null;

  try {
    const body = await context.request.json();

    const eventSlug = String(body.event_slug || "").trim();
    const EVENT = EVENTS[eventSlug];

    if (!EVENT) {
      return json(
        {
          success: false,
          error: "Invalid event."
        },
        400
      );
    }

    const secretKey = context.env.TOYYIBPAY_SECRET_KEY;
    const categoryCode = context.env.TOYYIBPAY_CATEGORY_CODE;

    if (!secretKey || !categoryCode) {
      return json(
        {
          success: false,
          error: "ToyyibPay environment variables are not set."
        },
        500
      );
    }

    const name = String(body.name || "").trim();
    const ic = String(body.ic || "").trim();
    const email = String(body.email || "").trim();
    const phone = String(body.phone || "").trim();
    const address = String(body.address || "").trim();
    const category = String(body.category || "").trim().toUpperCase();
    const event_tee_size = String(body.event_tee_size || "").trim();

    const finisher_tee_size = EVENT.requireFinisherTee
      ? String(body.finisher_tee_size || "").trim()
      : "";

    const recreate = body.recreate === true;

    if (!name || !ic || !email || !phone || !address || !category || !event_tee_size) {
      return json(
        {
          success: false,
          error: "Please complete all required fields."
        },
        400
      );
    }

    if (EVENT.requireFinisherTee && !finisher_tee_size) {
      return json(
        {
          success: false,
          error: "Please select Finisher Tee Size."
        },
        400
      );
    }

    const amount = EVENT.categories[category];

    if (!amount) {
      return json(
        {
          success: false,
          error: "Invalid category."
        },
        400
      );
    }

    const existing = await context.env.DB
      .prepare(`
        SELECT
          id,
          reg_no,
          event_slug,
          event_name,
          name,
          ic,
          category,
          amount,
          payment_status,
          payment_url,
          payment_ref
        FROM registrations
        WHERE event_slug = ?
          AND ic = ?
        LIMIT 1
      `)
      .bind(EVENT.slug, ic)
      .first();

    if (existing) {
      const existingStatus = String(existing.payment_status || "").toUpperCase();

      if (existingStatus === "PAID") {
        return json(
          {
            success: false,
            error: "This IC / Passport is already registered and paid for this event.",
            existing: {
              reg_no: existing.reg_no,
              event_name: existing.event_name,
              name: existing.name,
              category: existing.category,
              payment_status: existing.payment_status
            }
          },
          409
        );
      }

      if (existingStatus === "PENDING_PAYMENT") {
        const hasPaymentLink = existing.payment_url && existing.payment_ref;

        if (!recreate && hasPaymentLink) {
          return json({
            success: true,
            duplicate_pending: true,
            message: "Pending registration found.",
            payment_url: existing.payment_url,
            registration: {
              reg_no: existing.reg_no,
              event_slug: existing.event_slug,
              event_name: existing.event_name,
              name: existing.name,
              ic: existing.ic,
              category: existing.category,
              amount: existing.amount,
              payment_status: existing.payment_status,
              payment_ref: existing.payment_ref
            }
          });
        }

        // Kalau pending lama tiada payment link, atau user pilih CREATE NEW,
        // buang rekod pending lama dan create registration baru.
        await context.env.DB
          .prepare(`
            DELETE FROM registrations
            WHERE event_slug = ?
              AND ic = ?
              AND payment_status = 'PENDING_PAYMENT'
          `)
          .bind(EVENT.slug, ic)
          .run();
      } else {
        return json(
          {
            success: false,
            error: "This IC / Passport already has a registration for this event. Please contact organizer.",
            existing: {
              reg_no: existing.reg_no,
              payment_status: existing.payment_status
            }
          },
          409
        );
      }
    }

    const id = crypto.randomUUID();
    insertedId = id;

    const reg_no = makeRegNo(EVENT.prefix);
    const now = new Date().toISOString();

    await context.env.DB
      .prepare(`
        INSERT INTO registrations (
          id,
          reg_no,
          event_slug,
          event_name,
          name,
          ic,
          email,
          phone,
          address,
          category,
          event_tee_size,
          finisher_tee_size,
          amount,
          payment_status,
          payment_gateway,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        id,
        reg_no,
        EVENT.slug,
        EVENT.name,
        name,
        ic,
        email,
        phone,
        address,
        category,
        event_tee_size,
        finisher_tee_size,
        amount,
        "PENDING_PAYMENT",
        "TOYYIBPAY",
        now,
        now
      )
      .run();

    const siteUrl = context.env.SITE_URL || new URL(context.request.url).origin;

    const billData = new URLSearchParams();
    billData.append("userSecretKey", secretKey);
    billData.append("categoryCode", categoryCode);

    // ToyyibPay billName max 30 chars.
    billData.append("billName", limitText(EVENT.billName, 30));

    // Keep description short and safe.
    billData.append("billDescription", limitText(`${EVENT.billName} ${category} Registration`, 100));

    billData.append("billPriceSetting", "1");
    billData.append("billPayorInfo", "1");
    billData.append("billAmount", String(amount));
    billData.append("billReturnUrl", `${siteUrl}/success.html?ref=${encodeURIComponent(reg_no)}`);
    billData.append("billCallbackUrl", `${siteUrl}/api/payment-callback`);
    billData.append("billExternalReferenceNo", reg_no);
    billData.append("billTo", name);
    billData.append("billEmail", email);
    billData.append("billPhone", phone);
    billData.append("billSplitPayment", "0");
    billData.append("billSplitPaymentArgs", "");
    billData.append("billPaymentChannel", "0");

    const toyRes = await fetch("https://toyyibpay.com/index.php/api/createBill", {
      method: "POST",
      body: billData
    });

    const toyText = await toyRes.text();

    let toyData;
    try {
      toyData = JSON.parse(toyText);
    } catch (e) {
      await deletePendingRow(context, id);

      return json(
        {
          success: false,
          error: "ToyyibPay returned invalid response.",
          detail: toyText
        },
        502
      );
    }

    const billCode = toyData?.[0]?.BillCode;

    if (!billCode) {
      await deletePendingRow(context, id);

      return json(
        {
          success: false,
          error: "ToyyibPay bill creation failed.",
          detail: toyText
        },
        502
      );
    }

    const paymentUrl = `https://toyyibpay.com/${billCode}`;

    await context.env.DB
      .prepare(`
        UPDATE registrations
        SET
          payment_ref = ?,
          payment_url = ?,
          updated_at = ?
        WHERE id = ?
      `)
      .bind(
        billCode,
        paymentUrl,
        new Date().toISOString(),
        id
      )
      .run();

    return json({
      success: true,
      message: "Registration saved. Redirecting to payment.",
      payment_url: paymentUrl,
      registration: {
        id,
        reg_no,
        event_slug: EVENT.slug,
        event_name: EVENT.name,
        name,
        ic,
        email,
        phone,
        address,
        category,
        event_tee_size,
        finisher_tee_size,
        amount,
        payment_status: "PENDING_PAYMENT",
        payment_ref: billCode
      }
    });

  } catch (err) {
    if (insertedId) {
      await deletePendingRow(context, insertedId).catch(() => {});
    }

    return json(
      {
        success: false,
        error: err.message
      },
      500
    );
  }
}