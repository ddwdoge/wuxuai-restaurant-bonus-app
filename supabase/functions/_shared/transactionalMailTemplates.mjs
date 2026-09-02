const TEMPLATE_KEYS = new Set([
  "BIRTHDAY_GIFT_ASSIGNED",
  "BIRTHDAY_GIFT_EXPIRY_REMINDER",
  "POINT_REWARD_AVAILABLE",
]);

export const supportedTransactionalMailLanguages = Object.freeze(["de", "en", "fr", "it", "es", "zh", "ko"]);
const SUPPORTED_LANGUAGES = new Set(supportedTransactionalMailLanguages);
const SUPPORT_EMAIL = "support@wuxuaisbi.com";

const COMMON = {
  de: { greeting: "Hallo", accountNote: "Diese Transaktionsnachricht gehört zu deinem WUXUAI® Bonus Konto.", support: "Hilfe: support@wuxuaisbi.com" },
  en: { greeting: "Hello", accountNote: "This transactional message relates to your WUXUAI® Bonus account.", support: "Support: support@wuxuaisbi.com" },
  fr: { greeting: "Bonjour", accountNote: "Ce message transactionnel concerne votre compte WUXUAI® Bonus.", support: "Assistance : support@wuxuaisbi.com" },
  it: { greeting: "Ciao", accountNote: "Questo messaggio transazionale riguarda il tuo account WUXUAI® Bonus.", support: "Assistenza: support@wuxuaisbi.com" },
  es: { greeting: "Hola", accountNote: "Este mensaje transaccional está relacionado con tu cuenta de WUXUAI® Bonus.", support: "Ayuda: support@wuxuaisbi.com" },
  zh: { greeting: "您好", accountNote: "这是一封与您的 WUXUAI® Bonus 账户相关的服务邮件。", support: "支持：support@wuxuaisbi.com" },
  ko: { greeting: "안녕하세요", accountNote: "이 메일은 WUXUAI® Bonus 계정과 관련된 서비스 안내입니다.", support: "지원: support@wuxuaisbi.com" },
};

const COPY = {
  BIRTHDAY_GIFT_ASSIGNED: {
    de: { subject: "Dein Geburtstagsgeschenk | WUXUAI® Bonus", headline: "Dein Geburtstagsgeschenk wartet", intro: (r) => `${r} hat ein Geburtstagsgeschenk für dich vorbereitet.`, detail: (g) => `${g} wartet in deinem Bonuskonto auf dich.`, cta: "Geschenk ansehen" },
    en: { subject: "Your birthday gift | WUXUAI® Bonus", headline: "Your birthday gift is waiting", intro: (r) => `${r} has prepared a birthday gift for you.`, detail: (g) => `${g} is waiting in your bonus account.`, cta: "View gift" },
    fr: { subject: "Votre cadeau d’anniversaire | WUXUAI® Bonus", headline: "Votre cadeau d’anniversaire vous attend", intro: (r) => `${r} a préparé un cadeau d’anniversaire pour vous.`, detail: (g) => `${g} vous attend dans votre compte Bonus.`, cta: "Voir le cadeau" },
    it: { subject: "Il tuo regalo di compleanno | WUXUAI® Bonus", headline: "Il tuo regalo di compleanno ti aspetta", intro: (r) => `${r} ha preparato un regalo di compleanno per te.`, detail: (g) => `${g} ti aspetta nel tuo account Bonus.`, cta: "Vedi il regalo" },
    es: { subject: "Tu regalo de cumpleaños | WUXUAI® Bonus", headline: "Tu regalo de cumpleaños te espera", intro: (r) => `${r} ha preparado un regalo de cumpleaños para ti.`, detail: (g) => `${g} te espera en tu cuenta Bonus.`, cta: "Ver regalo" },
    zh: { subject: "您的生日礼物 | WUXUAI® Bonus", headline: "您的生日礼物已准备好", intro: (r) => `${r} 为您准备了一份生日礼物。`, detail: (g) => `${g} 已存入您的 Bonus 账户。`, cta: "查看礼物" },
    ko: { subject: "생일 선물이 도착했습니다 | WUXUAI® Bonus", headline: "생일 선물이 기다리고 있어요", intro: (r) => `${r}에서 생일 선물을 준비했습니다.`, detail: (g) => `${g}이(가) Bonus 계정에 준비되어 있습니다.`, cta: "선물 보기" },
  },
  BIRTHDAY_GIFT_EXPIRY_REMINDER: {
    de: { subject: "Dein Geburtstagsgeschenk läuft bald ab | WUXUAI® Bonus", headline: "Dein Geschenk ist noch drei Tage gültig", intro: (r) => `Dein Geburtstagsgeschenk bei ${r} läuft bald ab.`, detail: (g) => `Öffne dein Bonuskonto, um ${g} rechtzeitig zu verwenden.`, cta: "Geschenk ansehen" },
    en: { subject: "Your birthday gift expires soon | WUXUAI® Bonus", headline: "Your gift is valid for three more days", intro: (r) => `Your birthday gift at ${r} expires soon.`, detail: (g) => `Open your bonus account to use ${g} in time.`, cta: "View gift" },
    fr: { subject: "Votre cadeau d’anniversaire expire bientôt | WUXUAI® Bonus", headline: "Votre cadeau reste valable trois jours", intro: (r) => `Votre cadeau d’anniversaire chez ${r} expire bientôt.`, detail: (g) => `Ouvrez votre compte Bonus pour utiliser ${g} à temps.`, cta: "Voir le cadeau" },
    it: { subject: "Il tuo regalo di compleanno scade presto | WUXUAI® Bonus", headline: "Il tuo regalo è valido ancora tre giorni", intro: (r) => `Il tuo regalo di compleanno presso ${r} scade presto.`, detail: (g) => `Apri il tuo account Bonus per utilizzare ${g} in tempo.`, cta: "Vedi il regalo" },
    es: { subject: "Tu regalo de cumpleaños caduca pronto | WUXUAI® Bonus", headline: "Tu regalo es válido durante tres días más", intro: (r) => `Tu regalo de cumpleaños en ${r} caduca pronto.`, detail: (g) => `Abre tu cuenta Bonus para utilizar ${g} a tiempo.`, cta: "Ver regalo" },
    zh: { subject: "您的生日礼物即将到期 | WUXUAI® Bonus", headline: "您的礼物还有三天有效期", intro: (r) => `您在 ${r} 的生日礼物即将到期。`, detail: (g) => `请打开 Bonus 账户，及时使用${g}。`, cta: "查看礼物" },
    ko: { subject: "생일 선물 유효기간이 곧 끝납니다 | WUXUAI® Bonus", headline: "선물은 앞으로 3일간 유효합니다", intro: (r) => `${r}의 생일 선물 유효기간이 곧 끝납니다.`, detail: (g) => `Bonus 계정을 열어 ${g}을(를) 기간 내에 사용하세요.`, cta: "선물 보기" },
  },
  POINT_REWARD_AVAILABLE: {
    de: { subject: "Du kannst jetzt eine Belohnung einlösen | WUXUAI® Bonus", headline: "Deine Belohnung ist verfügbar", intro: (r, g) => `Du hast bei ${r} genug Punkte für ${g} gesammelt.`, points: (p) => `Die Belohnung ist ab ${p} Punkten verfügbar.`, ready: "Die Belohnung ist jetzt in deinem Bonuskonto verfügbar.", cta: "Belohnung ansehen" },
    en: { subject: "You can now redeem a reward | WUXUAI® Bonus", headline: "Your reward is available", intro: (r, g) => `You have collected enough points for ${g} at ${r}.`, points: (p) => `The reward is available from ${p} points.`, ready: "The reward is now available in your bonus account.", cta: "View reward" },
    fr: { subject: "Vous pouvez maintenant utiliser une récompense | WUXUAI® Bonus", headline: "Votre récompense est disponible", intro: (r, g) => `Vous avez cumulé assez de points chez ${r} pour ${g}.`, points: (p) => `La récompense est disponible à partir de ${p} points.`, ready: "La récompense est maintenant disponible dans votre compte Bonus.", cta: "Voir la récompense" },
    it: { subject: "Ora puoi utilizzare un premio | WUXUAI® Bonus", headline: "Il tuo premio è disponibile", intro: (r, g) => `Hai raccolto abbastanza punti presso ${r} per ${g}.`, points: (p) => `Il premio è disponibile a partire da ${p} punti.`, ready: "Il premio è ora disponibile nel tuo account Bonus.", cta: "Vedi il premio" },
    es: { subject: "Ya puedes canjear una recompensa | WUXUAI® Bonus", headline: "Tu recompensa está disponible", intro: (r, g) => `Has acumulado suficientes puntos en ${r} para ${g}.`, points: (p) => `La recompensa está disponible a partir de ${p} puntos.`, ready: "La recompensa ya está disponible en tu cuenta Bonus.", cta: "Ver recompensa" },
    zh: { subject: "您现在可以兑换奖励 | WUXUAI® Bonus", headline: "您的奖励已可兑换", intro: (r, g) => `您在 ${r} 已积累足够积分，可兑换${g}。`, points: (p) => `该奖励需要 ${p} 积分。`, ready: "该奖励现已在您的 Bonus 账户中开放。", cta: "查看奖励" },
    ko: { subject: "이제 리워드를 사용할 수 있습니다 | WUXUAI® Bonus", headline: "리워드를 사용할 수 있어요", intro: (r, g) => `${r}에서 ${g}에 필요한 포인트를 모았습니다.`, points: (p) => `이 리워드는 ${p}포인트부터 사용할 수 있습니다.`, ready: "이 리워드는 이제 Bonus 계정에서 사용할 수 있습니다.", cta: "리워드 보기" },
  },
};

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

export function normalizeTransactionalMailLanguage(value, fallback = "en") {
  const candidate = typeof value === "string"
    ? value.trim().toLowerCase().replace("_", "-").split("-")[0]
    : "";
  return SUPPORTED_LANGUAGES.has(candidate) ? candidate : fallback;
}

export function resolveTransactionalMailLanguage({ preferredLanguage, accountLanguage, appLanguage, browserLanguage } = {}) {
  for (const candidate of [preferredLanguage, accountLanguage, appLanguage, browserLanguage]) {
    const normalized = normalizeTransactionalMailLanguage(candidate, "");
    if (normalized) return normalized;
  }
  return "en";
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

export function renderTransactionalMail({ templateKey, restaurantName, restaurantSlug, payload, appBaseUrl, language, firstName }) {
  if (!TEMPLATE_KEYS.has(templateKey)) throw new Error("TEMPLATE_NOT_SUPPORTED");
  const resolvedLanguage = resolveTransactionalMailLanguage({
    preferredLanguage: language ?? payload?.preferred_language,
    accountLanguage: payload?.account_language,
    appLanguage: payload?.app_language,
    browserLanguage: payload?.browser_language ?? payload?.language,
  });
  const common = COMMON[resolvedLanguage];
  const copy = COPY[templateKey][resolvedLanguage];
  const restaurant = cleanText(restaurantName, resolvedLanguage === "de" ? "deinem Restaurant" : "your restaurant");
  const reward = cleanText(payload?.reward_name, resolvedLanguage === "de" ? "deine Belohnung" : "your reward");
  const recipient = cleanText(firstName ?? payload?.first_name, "", 80);
  const greeting = recipient ? `${common.greeting} ${recipient},` : `${common.greeting},`;
  const requiredPoints = Number.isInteger(payload?.required_points) && payload.required_points > 0
    ? payload.required_points
    : null;
  const actionUrl = customerPortalMailUrl(appBaseUrl, restaurantSlug);
  const intro = templateKey === "POINT_REWARD_AVAILABLE" ? copy.intro(restaurant, reward) : copy.intro(restaurant);
  const detail = templateKey === "POINT_REWARD_AVAILABLE"
    ? (requiredPoints ? copy.points(requiredPoints) : copy.ready)
    : copy.detail(reward);
  const text = `${greeting}\n\n${intro}\n\n${detail}\n\n${copy.cta}: ${actionUrl}\n\n${common.accountNote}\n${common.support}\n\nWUXUAI® Bonus`;

  return {
    subject: cleanText(copy.subject, "WUXUAI® Bonus", 180),
    text,
    html: `<!doctype html><html lang="${resolvedLanguage}"><body style="margin:0;background:#f7f4ee;color:#221f1b;font-family:Arial,sans-serif"><div style="max-width:560px;margin:0 auto;padding:24px 14px"><div style="background:#ffffff;border:1px solid #e5ddd0;border-radius:8px;padding:26px 22px"><p style="margin:0 0 14px;color:#8b661f;font-size:13px;font-weight:700">WUXUAI® Bonus</p><h1 style="margin:0 0 18px;font-size:24px;line-height:1.3">${escapeHtml(copy.headline)}</h1><p style="margin:0 0 12px;line-height:1.6">${escapeHtml(greeting)}</p><p style="margin:0 0 12px;line-height:1.6">${escapeHtml(intro)}</p><p style="margin:0 0 24px;line-height:1.6;color:#5f574d">${escapeHtml(detail)}</p><a href="${escapeHtml(actionUrl)}" style="display:inline-block;min-height:44px;box-sizing:border-box;padding:13px 18px;border-radius:8px;background:#8d681f;color:#ffffff;text-decoration:none;font-weight:700">${escapeHtml(copy.cta)}</a></div><div style="padding:18px 8px 0;text-align:center;color:#71695f;font-size:12px;line-height:1.6"><p style="margin:0">${escapeHtml(common.accountNote)}</p><p style="margin:4px 0 0"><a href="mailto:${SUPPORT_EMAIL}" style="color:#71695f">${escapeHtml(common.support)}</a></p></div></div></body></html>`,
    actionUrl,
    language: resolvedLanguage,
  };
}

export const supportedTransactionalMailTemplates = Object.freeze([...TEMPLATE_KEYS]);
