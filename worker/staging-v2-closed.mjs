// Initial staging-v2 release: no request, binding or mode can open this worker.
// Assets remain uploaded but inaccessible until a separately reviewed release.
export default {
  fetch() {
    return new Response(null, {
      status: 403,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  },
};
