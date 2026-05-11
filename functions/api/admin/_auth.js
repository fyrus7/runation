export function json(data, status = 200) {
  return Response.json(data, { status });
}

export function cleanText(value) {
  return String(value || "").trim();
}

export function normalizeSlug(value) {
  return cleanText(value).toLowerCase();
}

async function sha256(text) {
  const bytes = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", bytes);

  return [...new Uint8Array(hash)]
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

export function createSalt() {
  return crypto.randomUUID().replace(/-/g, "");
}

export function createSessionToken() {
  return `${crypto.randomUUID()}-${crypto.randomUUID()}`;
}

export async function hashPassword(password, salt) {
  return sha256(`${salt}:${password}`);
}

export function getBearerToken(request) {
  const auth = request.headers.get("Authorization") || "";
  return auth.replace(/^Bearer\s+/i, "").trim();
}

export function isMaster(admin) {
  return admin && admin.role === "master";
}

export function canAccessEvent(admin, eventSlug) {
  if (!admin) return false;
  if (isMaster(admin)) return true;

  return normalizeSlug(admin.event_slug) === normalizeSlug(eventSlug);
}

export async function getAdmin(context) {
  const token = getBearerToken(context.request);

  if (!token) return null;

  // Keep old master token working
  if (context.env.ADMIN_TOKEN && token === context.env.ADMIN_TOKEN) {
    return {
  id: 0,
  username: "master",
  role: "master",
  access_mode: "master",
  event_slug: "",
  token
};
  }

  const row = await context.env.DB.prepare(`
    SELECT
      s.token,
	  s.expires_at,
	  u.id,
	  u.username,
	  u.role,
	  u.access_mode,
	  u.event_slug,
	  u.is_active
    FROM admin_sessions s
    JOIN admin_users u ON u.id = s.admin_user_id
    WHERE s.token = ?
      AND datetime(s.expires_at) > datetime('now')
      AND u.is_active = 1
    LIMIT 1
  `).bind(token).first();

  if (!row) return null;

  return {
    id: row.id,
    username: row.username,
    role: row.role,
	access_mode: row.access_mode || "own_event",
    event_slug: row.event_slug || "",
    token: row.token
  };
}

export async function requireAdmin(context) {
  const admin = await getAdmin(context);

  if (!admin) {
    return {
      ok: false,
      response: json({
        success: false,
        error: "UNAUTHORIZED"
      }, 401)
    };
  }

  return {
    ok: true,
    admin
  };
}

export async function requireMaster(context) {
  const auth = await requireAdmin(context);

  if (!auth.ok) return auth;

  if (!isMaster(auth.admin)) {
    return {
      ok: false,
      response: json({
        success: false,
        error: "FORBIDDEN"
      }, 403)
    };
  }

  return auth;
}