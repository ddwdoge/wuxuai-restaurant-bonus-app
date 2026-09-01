const TEMPLATE_KEYS = new Set([
  "BIRTHDAY_GIFT_ASSIGNED",
  "BIRTHDAY_GIFT_EXPIRY_REMINDER",
  "POINT_REWARD_AVAILABLE",
]);

function cleanText(value, fallback, maxLength = 120) {
  const normalized = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  return (normalized || fallback).slice(0, maxLength);
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function customerPortalMailUrl(baseUrl, restaurantSlug) {
  const base = new URL(baseUrl);
  const hostname = base.hostname.toLowerCase();
  if (base.protocol !== "https:" || hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") {
    throw new Error("APP_BASE_URL_INVALID");
  }
  const slug = cleanText(restaurantSlug, "", 100).toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error("RESTAURANT_SLUG_INVALID");
  const returnPath = `/customer/${encodeURIComponent(slug)}`;
  const url = new URL("/customer/login", base);
  url.searchParams.set("returnTo", returnPath);
  return url.toString();
}

export function renderTransactionalMail({ templateKey, restaurantName, restaurantSlug, payload, appBaseUrl }) {
  if (!TEMPLATE_KEYS.has(templateKey)) throw new Error("TEMPLATE_NOT_SUPPORTED");
  const restaurant = cleanText(restaurantName, "deinem Restaurant");
  const reward = cleanText(payload?.reward_name, "deine Belohnung");
  const requiredPoints = Number.isInteger(payload?.required_points) && payload.required_points > 0
    ? payload.required_points
    : null;
  const actionUrl = customerPortalMailUrl(appBaseUrl, restaurantSlug);

  let subject;
  let intro;
  let detail;
  let ctaLabel;
  if (templateKey === "BIRTHDAY_GIFT_ASSIGNED") {
    subject = "Dein Geburtstagsgeschenk wartet auf dich 🎁";
    intro = `Alles Gute! ${restaurant} hat ein Geburtstagsgeschenk für dich vorbereitet.`;
    detail = `${reward} wartet in deinem Bonuskonto auf dich.`;
    ctaLabel = "Geschenk ansehen";
  } else if (templateKey === "BIRTHDAY_GIFT_EXPIRY_REMINDER") {
    subject = "Dein Geburtstagsgeschenk läuft bald ab";
    intro = `Dein Geburtstagsgeschenk bei ${restaurant} ist nur noch drei Tage gültig.`;
    detail = `Öffne dein Bonuskonto, um ${reward} rechtzeitig zu verwenden.`;
    ctaLabel = "Geschenk ansehen";
  } else {
    subject = "Du kannst jetzt eine Belohnung einlösen";
    intro = `Du hast bei ${restaurant} genug Punkte für ${reward} gesammelt.`;
    detail = requiredPoints
      ? `Die Belohnung ist ab ${requiredPoints} Punkten verfügbar.`
      : "Die Belohnung ist jetzt in deinem Bonuskonto verfügbar.";
    ctaLabel = "Belohnung ansehen";
  }

  const safeSubject = cleanText(subject, "Neuigkeiten zu deinem Bonus", 160);
  const safeIntro = escapeHtml(intro);
  const safeDetail = escapeHtml(detail);
  const safeCta = escapeHtml(ctaLabel);
  const safeActionUrl = escapeHtml(actionUrl);
  return {
    subject: safeSubject,
    text: `${intro}\n\n${detail}\n\n${ctaLabel}: ${actionUrl}\n\nViele Grüße\nWUXUAI Restaurant Bonus`,
    html: `<!doctype html><html lang="de"><body style="margin:0;background:#f6f0e4;color:#241f1a;font-family:Arial,sans-serif"><div style="max-width:560px;margin:0 auto;padding:32px 18px"><div style="background:#fff;border:1px solid #e8dcc4;border-radius:12px;padding:28px"><p style="margin:0 0 12px;color:#8b6a2d;font-size:13px;font-weight:700">WUXUAI Restaurant Bonus</p><h1 style="margin:0 0 16px;font-size:24px;line-height:1.25">${escapeHtml(safeSubject)}</h1><p style="margin:0 0 12px;line-height:1.6">${safeIntro}</p><p style="margin:0 0 24px;line-height:1.6;color:#5f554a">${safeDetail}</p><a href="${safeActionUrl}" style="display:inline-block;min-height:44px;box-sizing:border-box;padding:13px 18px;border-radius:8px;background:#9b742f;color:#fff;text-decoration:none;font-weight:700">${safeCta}</a></div><p style="margin:18px 0 0;text-align:center;color:#746a5f;font-size:12px">Diese Nachricht gehört zu deinem Bonuskonto.</p></div></body></html>`,
    actionUrl,
  };
}

export const supportedTransactionalMailTemplates = Object.freeze([...TEMPLATE_KEYS]);
