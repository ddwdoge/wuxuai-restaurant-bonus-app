import { translateStructural } from "../../shared/i18n/catalog.mjs";

export function customerPresentationText(key, language, parameters = {}) {
  const template = translateStructural(`customer.presentation.${key}`, language);
  return template.replace(/\{(\w+)\}/g, (placeholder, name) => String(parameters[name] ?? placeholder));
}

// Founder-approved reserved presentation text, even if entered manually.
// Only canonical birthday metadata + exact trimmed text qualify; stored data is never changed.
export function customerRewardDescription(reward, language) {
  const description = reward.description ?? "";
  return reward.gift_type === "birthday" && description.trim() === "Willkommensgeschenk für neue Gäste."
    ? customerPresentationText("birthdayIntro", language)
    : description;
}

// Founder 2026-09-13: a reserved presentation title, NOT inferred provenance.
// Category is authoritative. Never infer the type from title/product-group text.
export function customerRewardPresentation(reward, language) {
  const title = reward.title ?? "";
  const customSurprise = reward.category?.trim() === "Eigene Überraschung";
  const reservedTitle = customSurprise && (!title.trim() || title.trim() === "Eigene Überraschung");
  return {
    customSurprise,
    title: reservedTitle ? customerPresentationText("fallbackTitle", language) : title,
    category: customSurprise
      ? customerPresentationText("category", language)
      : reward.category ?? reward.product_group ?? null,
  };
}
