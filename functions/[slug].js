function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function cleanSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^\/+|\/+$/g, "");
}

function isReservedSlug(slug) {
  const reserved = new Set([
    "api",
    "admin",
    "admin.html",
    "admin-events",
    "admin-events.html",
    "admin-users",
    "admin-users.html",
    "event",
    "event.html",
    "index",
    "index.html",
    "login",
    "login.html",
    "success",
    "success.html",
    "css",
    "js",
    "images",
    "assets",
    "favicon.ico",
    "robots.txt",
    "sitemap.xml"
  ]);

  return reserved.has(slug);
}

function absoluteUrl(value, origin) {
  const url = String(value || "").trim();

  if (!url) return `${origin}/images/og-default.jpg`;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("/")) return `${origin}${url}`;

  return `${origin}/${url}`;
}

function buildMetaTags({ title, description, image, canonicalUrl }) {
  const safeTitle = escapeHtml(title);
  const safeDescription = escapeHtml(description);
  const safeImage = escapeHtml(image);
  const safeUrl = escapeHtml(canonicalUrl);

  return `
<meta name="description" content="${safeDescription}">

<meta property="og:type" content="website">
<meta property="og:site_name" content="RunationX">
<meta property="og:title" content="${safeTitle}">
<meta property="og:description" content="${safeDescription}">
<meta property="og:image" content="${safeImage}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:url" content="${safeUrl}">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${safeTitle}">
<meta name="twitter:description" content="${safeDescription}">
<meta name="twitter:image" content="${safeImage}">
`.trim();
}

export async function onRequestGet(context) {
  const { request, env, params } = context;

  const slug = cleanSlug(params.slug);
  const url = new URL(request.url);
  const origin = url.origin;

  if (!slug || isReservedSlug(slug)) {
    return env.ASSETS.fetch(request);
  }

  const event = await env.DB
    .prepare(`
      SELECT
        slug,
        title,
        short_description,
        event_image,
        event_type
      FROM events
      WHERE slug = ?
      LIMIT 1
    `)
    .bind(slug)
    .first();

  if (!event) {
    return new Response("Event not found", {
      status: 404,
      headers: {
        "Content-Type": "text/plain; charset=UTF-8"
      }
    });
  }

  const assetRequest = new Request(`${origin}/event.html`, {
    method: "GET",
    headers: request.headers
  });

  const assetResponse = await env.ASSETS.fetch(assetRequest);

  if (!assetResponse.ok) {
    return new Response(`Unable to load event.html. Status: ${assetResponse.status}`, {
      status: 500,
      headers: {
        "Content-Type": "text/plain; charset=UTF-8"
      }
    });
  }

  let html = await assetResponse.text();

  const title = event.title || "RunationX Event";
  const description =
    event.short_description ||
    event.event_type ||
    "Register for this event on RunationX.";

  const image = absoluteUrl(event.event_image, origin);
  const canonicalUrl = `${origin}/${event.slug}`;

  const metaTags = buildMetaTags({
    title,
    description,
    image,
    canonicalUrl
  });

  const slugScript = `
<script>
  window.RUNATION_EVENT_SLUG = ${JSON.stringify(event.slug)};
</script>`.trim();

  html = html
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)} | RunationX</title>`)
    .replace(/<meta\s+(property|name)=["'](?:og:|twitter:)[^>]*>\s*/gi, "")
    .replace(/<meta\s+name=["']description["'][^>]*>\s*/gi, "")
    .replace("</head>", `${metaTags}\n${slugScript}\n</head>`);

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=UTF-8",
      "Cache-Control": "public, max-age=300"
    }
  });
}