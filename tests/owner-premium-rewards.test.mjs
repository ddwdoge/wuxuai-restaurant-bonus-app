import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const rewardsPage = readFileSync(new URL("../src/modules/admin/pages/RewardsPage.tsx", import.meta.url), "utf8");
const welcomeGiftsPage = readFileSync(new URL("../src/modules/admin/pages/WelcomeGiftsPage.tsx", import.meta.url), "utf8");
const rewardCard = readFileSync(new URL("../src/modules/admin/components/PremiumOwnerRewardCard.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/modules/admin/admin-premium.css", import.meta.url), "utf8");

test("Premium-Verwaltung bleibt im Restaurant-Portal gekapselt", () => {
  assert.match(rewardsPage, /premium-owner-management-page/);
  assert.match(welcomeGiftsPage, /premium-owner-management-page/);
  assert.match(styles, /\.premium-owner-shell \.premium-owner-management-header/);
  assert.doesNotMatch(styles, /customer-premium-app|platform-admin-shell/);
});

test("Punkteeinlösungen verwenden echte Datenwege und automatische Punkte", () => {
  assert.match(rewardsPage, /loadRewardOffers\(restaurantId\)/);
  assert.match(rewardsPage, /loadLoyaltySettings\(restaurantId\)/);
  assert.match(rewardsPage, /saveRewardOffer\(/);
  assert.match(rewardsPage, /setRewardOfferActive\(/);
  assert.match(rewardsPage, /required_points: calculation\.requiredPoints/);
  assert.doesNotMatch(rewardsPage, /Manuelle Punkte|Punkte eingeben/);
});

test("Willkommensgeschenke bleiben eigener kostenloser Geschenkpool", () => {
  assert.match(welcomeGiftsPage, /offer\.is_starter_reward/);
  assert.match(welcomeGiftsPage, /required_points: 0/);
  assert.match(welcomeGiftsPage, /Aktive Geschenke gehören zum Pool/);
  assert.doesNotMatch(welcomeGiftsPage, /nur ein aktives|zweite aktive/i);
});

test("Karten, Vorschau und Statusbestätigung sind echte UI-Zustände", () => {
  assert.match(rewardCard, /premium-owner-status-badge/);
  assert.match(rewardsPage, /Vorschau im Kundenportal/);
  assert.match(welcomeGiftsPage, /Vorschau im Kundenportal/);
  assert.match(rewardsPage, /Belohnung deaktivieren\?/);
  assert.match(rewardsPage, /Belohnung aktivieren\?/);
  assert.match(welcomeGiftsPage, /Bereits zugeteilte und eingelöste Geschenke bleiben unverändert/);
});

test("Lade-, Leer- und Fehlerzustände bleiben ohne Demo-Daten", () => {
  for (const page of [rewardsPage, welcomeGiftsPage]) {
    assert.match(page, /premium-owner-reward-skeleton/);
    assert.match(page, /Erneut versuchen/);
    assert.doesNotMatch(page, /demo|fake/i);
  }
  assert.match(rewardsPage, /Noch keine Punkteeinlösungen/);
  assert.match(welcomeGiftsPage, /Noch kein Willkommensgeschenk/);
});

test("Premium-Karten sind mobil einspaltig und ohne horizontales Überlaufen", () => {
  assert.match(styles, /@media \(max-width: 699px\)[\s\S]*premium-owner-reward-grid[\s\S]*grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(styles, /premium-owner-management-page[\s\S]*max-width: 1280px[\s\S]*min-width: 0[\s\S]*width: 100%/);
  assert.match(styles, /premium-owner-reward-card[\s\S]*max-width: 100%[\s\S]*min-width: 0[\s\S]*width: 100%/);
  assert.match(styles, /@media \(min-width: 700px\) and \(max-width: 1179px\)[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(styles, /premium-owner-reward-actions[\s\S]*min-height: 44px/);
  assert.match(styles, /premium-owner-reward-actions \.button[\s\S]*white-space: normal[\s\S]*width: 100%/);
});
