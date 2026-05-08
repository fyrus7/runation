export async function onRequestPost(context) {
  try {
    const body = await context.request.json();

    const name = String(body.name || "").trim();
    const ic = String(body.ic || "").trim();
    const email = String(body.email || "").trim();
    const phone = String(body.phone || "").trim();
    const category = String(body.category || "").trim();
    const tshirt_size = String(body.tshirt_size || "").trim();

    if (!name || !ic || !phone || !category) {
      return Response.json(
        {
          success: false,
          error: "Name, IC, phone and category are required"
        },
        { status: 400 }
      );
    }

    const categoryPrices = {
      "5KM": 100,
      "10KM": 1000,
      "21KM": 5000
    };

    const amount = categoryPrices[category];

    if (!amount) {
      return Response.json(
        {
          success: false,
          error: "Invalid category"
        },
        { status: 400 }
      );
    }

    const existing = await context.env.DB
      .prepare("SELECT id, reg_no FROM registrations WHERE ic = ? LIMIT 1")
      .bind(ic)
      .first();

    if (existing) {
      return Response.json(
        {
          success: false,
          error: "IC already registered",
          existing
        },
        { status: 409 }
      );
    }

    const id = crypto.randomUUID();
    const reg_no = "REG-" + Date.now().toString(36).toUpperCase();
    const now = new Date().toISOString();

    await context.env.DB
      .prepare(`
        INSERT INTO registrations (
          id,
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
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        id,
        reg_no,
        name,
        ic,
        email,
        phone,
        category,
        tshirt_size,
        amount,
        "PENDING_PAYMENT",
        "TOYYIBPAY",
        now,
        now
      )
      .run();

    const siteUrl = context.env.SITE_URL || new URL(context.request.url).origin;

    const billData = new URLSearchParams();
    billData.append("userSecretKey", context.env.TOYYIBPAY_SECRET_KEY);
    billData.append("categoryCode", context.env.TOYYIBPAY_CATEGORY_CODE);
    billData.append("billName", "Running Event Registration");
    billData.append("billDescription", `${category} registration fee`);
    billData.append("billPriceSetting", "1");
    billData.append("billPayorInfo", "1");
    billData.append("billAmount", String(amount));
    billData.append("billReturnUrl", `${siteUrl}/success.html?ref=${encodeURIComponent(reg_no)}`);
    billData.append("billCallbackUrl", `${siteUrl}/api/payment-callback`);
    billData.append("billExternalReferenceNo", reg_no);
    billData.append("billTo", name);
    billData.append("billEmail", email || "noemail@example.com");
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
      throw new Error("ToyyibPay returned invalid response: " + toyText);
    }

    const billCode = toyData?.[0]?.BillCode;

    if (!billCode) {
      throw new Error("ToyyibPay bill creation failed: " + toyText);
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

    return Response.json({
      success: true,
      message: "Registration saved. Redirecting to payment.",
      payment_url: paymentUrl,
      registration: {
        id,
        reg_no,
        name,
        ic,
        email,
        phone,
        category,
        tshirt_size,
        amount,
        payment_status: "PENDING_PAYMENT",
        payment_ref: billCode
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