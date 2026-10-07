// V1 freeze: the menu catalog is not an active product surface.
// Keep the endpoint name reserved so old clients cannot reach a retired writer.
Deno.serve(() => new Response(JSON.stringify({ error: "CATALOG_V1_DISABLED" }), {
  status: 410,
  headers: {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
  },
}));
