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

    const categoryPrices = {
  "5KM": 5000,
  "10KM": 7000,
  "21KM": 10000
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

    return Response.json({
      success: true,
      message: "Registration saved",
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
        payment_status: "PENDING_PAYMENT"
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