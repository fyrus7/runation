import { json } from "../../../server/lib/response.js";

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();

    const username = String(body.username || "").trim();
    const password = String(body.password || "").trim();

    const validUsername = context.env.ADMIN_USERNAME;
    const validPassword = context.env.ADMIN_PASSWORD;
    const adminToken = context.env.ADMIN_TOKEN;

    if (!validUsername || !validPassword || !adminToken) {
      return json({
        success: false,
        error: "Admin login environment variables are not set."
      }, 500);
    }

    if (username !== validUsername || password !== validPassword) {
      return json({
        success: false,
        error: "Invalid username or password."
      }, 401);
    }

    return json({
      success: true,
      token: adminToken
    });

  } catch (err) {
    return json({
      success: false,
      error: err.message
    }, 500);
  }
}