function base64UrlEncode(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";

  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }

  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
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

async function createToken(username, secret) {
  const payload = {
    username,
    exp: Date.now() + 12 * 60 * 60 * 1000
  };

  const payloadPart = base64UrlEncode(JSON.stringify(payload));
  const signature = await hmacHex(secret, payloadPart);

  return `${payloadPart}.${signature}`;
}

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();

    const username = String(body.username || "").trim();
    const password = String(body.password || "");

    const adminUsername = context.env.ADMIN_USERNAME;
    const adminPassword = context.env.ADMIN_PASSWORD;
    const sessionSecret = context.env.ADMIN_SESSION_SECRET;

    if (!adminUsername || !adminPassword || !sessionSecret) {
      return Response.json(
        {
          success: false,
          error: "Admin environment variables are not set"
        },
        { status: 500 }
      );
    }

    if (username !== adminUsername || password !== adminPassword) {
      return Response.json(
        {
          success: false,
          error: "Invalid username or password"
        },
        { status: 401 }
      );
    }

    const token = await createToken(username, sessionSecret);

    return Response.json({
      success: true,
      token
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