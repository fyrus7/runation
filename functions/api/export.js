function base64UrlDecode(text) {
  text = text.replaceAll("-", "+").replaceAll("_", "/");

  while (text.length % 4) {
    text += "=";
  }

  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return new TextDecoder().decode(bytes);
}

async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message)
  );

  return [...new Uint8Array(sig)]
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

async function verifyAdmin(context) {
  const auth = context.request.headers.get("Authorization") || "";

  if (!auth.startsWith("Bearer ")) {
    return false;
  }

  const token = auth.slice(7);
  const parts = token.split(".");

  if (parts.length !== 2) {
    return false;
  }

  const [payloadPart, signature] = parts;
  const secret = context.env.ADMIN_SESSION_SECRET;

  if (!secret) {
    return false;
  }

  const expected = await hmacHex(secret, payloadPart);

  if (signature !== expected) {
    return false;
  }

  const payload = JSON.parse(base64UrlDecode(payloadPart));

  if (!payload.exp || Date.now() > payload.exp) {
    return false;
  }

  return true;
}

function csvEscape(value) {
  const str = String(value ?? "");
  return `"${str.replaceAll('"', '""')}"`;
}

function formatAmount(amount) {
  const sen = Number(amount) || 0;
  return (sen / 100).toFixed(2);
}

export async function onRequestGet(context) {
  try {
    const isAdmin = await verifyAdmin(context);

    if (!isAdmin) {
      return Response.json(
        {
          success: false,
          error: "Unauthorized"
        },
        { status: 401 }
      );
    }

    const url = new URL(context.request.url);

    const q = String(url.searchParams.get("q") || "").trim();
    const status = String(url.searchParams.get("status") || "").trim();
	const eventSlug = String(url.searchParams.get("event_slug") || "").trim();

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
	if (eventSlug) {
     where.push(`event_slug = ?`);
	 binds.push(eventSlug);
	}

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    let stmt = context.env.DB.prepare(`
      SELECT
	  event_name,
	  event_slug,
	  reg_no,
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
	  payment_ref,
	  payment_url,
	  created_at,
	  paid_at,
	  updated_at
      FROM registrations
      ${whereSql}
      ORDER BY created_at DESC
      LIMIT 10000
    `);

    if (binds.length) {
      stmt = stmt.bind(...binds);
    }

    const result = await stmt.all();
    const rows = result.results || [];

    const header = [
    	"Event",
		"Event Slug",
		"Reg No",
		"Name",
		"IC / Passport",
		"Email",
		"Phone",
		"Address",
		"Category",
		"Event Tee Size",
		"Finisher Tee Size",
		"Amount RM",
		"Payment Status",
		"Payment Gateway",
		"Payment Ref",
		"Payment URL",
		"Created At",
		"Paid At",
		"Updated At"
	];

    const csvRows = [
      header.map(csvEscape).join(",")
    ];

    for (const r of rows) {
      csvRows.push([
    	r.event_name,
		r.event_slug,
		r.reg_no,
		r.name,
		r.ic,
		r.email,
		r.phone,
		r.address,
		r.category,
		r.event_tee_size,
		r.finisher_tee_size,
		formatAmount(r.amount),
		r.payment_status,
		r.payment_gateway,
		r.payment_ref,
		r.payment_url,
		r.created_at,
		r.paid_at,
		r.updated_at
		].map(csvEscape).join(","));
    }

    const csv = csvRows.join("\r\n");

    const date = new Date().toISOString().slice(0, 10);
    const filename = `runation-registrations-${date}.csv`;

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`
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