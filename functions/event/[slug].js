export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  url.pathname = "/event.html";

  return context.env.ASSETS.fetch(new Request(url, context.request));
}