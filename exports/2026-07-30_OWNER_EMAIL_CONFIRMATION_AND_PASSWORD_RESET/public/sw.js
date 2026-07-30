self.addEventListener("push", (event) => {
  const fallback = {
    title: "Deine Belohnung läuft bald ab",
    body: "Öffne dein Bonuskonto und prüfe deine Belohnungen.",
    url: "/",
  };
  let payload = fallback;
  try {
    payload = { ...fallback, ...(event.data ? event.data.json() : {}) };
  } catch {
    payload = fallback;
  }
  event.waitUntil(self.registration.showNotification(payload.title, {
    body: payload.body,
    data: { url: payload.url },
    tag: payload.tag || "wuxuai-expiry-reminder",
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const matching = clients.find((client) => client.url === target);
    if (matching) {
      await matching.focus();
      return;
    }
    await self.clients.openWindow(target);
  })());
});
