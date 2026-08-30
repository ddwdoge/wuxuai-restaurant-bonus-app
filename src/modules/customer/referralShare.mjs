export function referralSharePayload(restaurantName, referralUrl) {
  const safeName = typeof restaurantName === "string" && restaurantName.trim()
    ? restaurantName.trim()
    : "diesem Restaurant";
  return {
    title: `Komm mit zu ${safeName}`,
    text: `Ich lade dich zu ${safeName} ein. Melde dich über meinen Einladungslink an.`,
    url: referralUrl,
  };
}

export function supportsNativeReferralShare(navigatorLike) {
  return typeof navigatorLike?.share === "function";
}

