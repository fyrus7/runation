export function isAdmin(context) {
  const auth = context.request.headers.get("Authorization") || "";
  return auth === `Bearer ${context.env.ADMIN_TOKEN}`;
}