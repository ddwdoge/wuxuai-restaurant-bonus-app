const hashedAssetPath = /^\/assets\/.+-[A-Za-z0-9_-]{8,}\.[^/]+$/;

function isHtml(response) {
  return response.headers.get("content-type")?.toLowerCase().includes("text/html") ?? false;
}

function responseWithHeaders(request, response, headers) {
  return new Response(request.method === "HEAD" ? null : response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const response = await env.ASSETS.fetch(request);

    if (url.pathname.startsWith("/assets/") && isHtml(response)) {
      return new Response(request.method === "HEAD" ? null : "Not Found", {
        status: 404,
        headers: {
          "Cache-Control": "no-store",
          "Content-Type": "text/plain; charset=UTF-8",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    const headers = new Headers(response.headers);
    headers.set("X-Content-Type-Options", "nosniff");

    if (hashedAssetPath.test(url.pathname) && response.ok) {
      headers.set("Cache-Control", "public, max-age=31536000, immutable");
    } else if (isHtml(response)) {
      headers.set("Cache-Control", "no-cache, must-revalidate");
    }

    return responseWithHeaders(request, response, headers);
  },
};
