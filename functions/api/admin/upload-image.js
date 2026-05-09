const MAX_SIZE = 2 * 1024 * 1024;

const ALLOWED_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}

function getBearerToken(request) {
  const auth = request.headers.get("Authorization") || "";
  return auth.replace(/^Bearer\s+/i, "").trim();
}

function isAuthorized(request, env) {
  const token = getBearerToken(request);

  if (!token) return false;

  /*
    IMPORTANT:
    Ini assume admin token kau disimpan dalam env.ADMIN_TOKEN.
    Kalau API admin existing kau guna env name lain,
    tukar env.ADMIN_TOKEN kepada nama yang sama.
  */
  return token === env.ADMIN_TOKEN;
}

function safeSlug(value) {
  return String(value || "event")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "event";
}

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    if (!isAuthorized(request, env)) {
      return json({
        success: false,
        error: "UNAUTHORIZED"
      }, 401);
    }

    if (!env.R2) {
      return json({
        success: false,
        error: "R2_BINDING_MISSING"
      }, 500);
    }

    if (!env.R2_PUBLIC_BASE_URL) {
      return json({
        success: false,
        error: "R2_PUBLIC_BASE_URL_MISSING"
      }, 500);
    }

    const formData = await request.formData();

    const file = formData.get("image");
    const slug = safeSlug(formData.get("event") || formData.get("slug"));

    if (!file || typeof file.arrayBuffer !== "function") {
      return json({
        success: false,
        error: "NO_IMAGE_FILE"
      }, 400);
    }

    if (!ALLOWED_TYPES[file.type]) {
      return json({
        success: false,
        error: "INVALID_FILE_TYPE",
        allowed: ["jpg", "png", "webp"]
      }, 400);
    }

    if (file.size > MAX_SIZE) {
      return json({
        success: false,
        error: "FILE_TOO_LARGE",
        maxBytes: MAX_SIZE
      }, 400);
    }

    const ext = ALLOWED_TYPES[file.type];
    const key = `events/${slug}-${Date.now()}-${crypto.randomUUID()}.${ext}`;
    const arrayBuffer = await file.arrayBuffer();

    await env.R2.put(key, arrayBuffer, {
      httpMetadata: {
        contentType: file.type
      }
    });

    const baseUrl = String(env.R2_PUBLIC_BASE_URL).replace(/\/+$/, "");
    const url = `${baseUrl}/${key}`;

    return json({
      success: true,
      key,
      url
    });
  } catch (err) {
    return json({
      success: false,
      error: err.message || "UPLOAD_IMAGE_FAILED"
    }, 500);
  }
}

export async function onRequestGet() {
  return json({
    success: false,
    error: "METHOD_NOT_ALLOWED"
  }, 405);
}