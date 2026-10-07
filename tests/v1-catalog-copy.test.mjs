import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { GENERATED_MESSAGES, GENERATED_SOURCE_TO_KEY } from '../src/shared/i18n/messages.generated.mjs';
import { SUPPORTED_UI_LANGUAGES } from '../src/shared/i18n/language.mjs';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const source = 'Veröffentliche Angebote, Veranstaltungen und Neuigkeiten. Dein Paket bestimmt die Anzahl gleichzeitig aktiver Angebote.';
const key = 'owner.auto_6805353970ab';
const expected = {
  de: source,
  en: 'Publish offers, events and news. Your package determines the number of offers active at the same time.',
  fr: "Publiez des offres, des événements et des actualités. Votre forfait détermine le nombre d'offres actives en même temps.",
  it: 'Pubblica offerte, eventi e novità. Il tuo pacchetto determina il numero di offerte attive contemporaneamente.',
  es: 'Publica ofertas, eventos y novedades. Tu paquete determina la cantidad de ofertas activas al mismo tiempo.',
  zh: '发布优惠、活动和最新消息。你的套餐决定了同时有效的优惠数量。',
  ko: '혜택, 이벤트 및 소식을 게시하세요. 요금제에 따라 동시에 활성화할 수 있는 혜택 수가 정해집니다.',
};
for (const language of SUPPORTED_UI_LANGUAGES) test(`${language}: offers introduction does not promise menu publication`, () => {
  assert.equal(GENERATED_MESSAGES[language][key], expected[language]);
});
test('active Owner source uses the exact localized source; lunch offers remain allowed', () => {
  assert.ok(read('src/modules/admin/pages/RestaurantOffersPage.tsx').includes(source));
  assert.equal(GENERATED_SOURCE_TO_KEY[source], key);
  assert.equal(GENERATED_SOURCE_TO_KEY[source.replace('Angebote,', 'Menüs,')], undefined);
  assert.match(read('src/modules/offers/restaurantOfferService.ts'), /"LUNCH_MENU"/);
});
test('V1 entry points do not import or link the retired restaurant catalog', () => {
  for (const file of ['src/app/App.tsx', 'src/modules/admin/AdminLayout.tsx',
    'src/modules/customer/CustomerPortal.tsx', 'src/modules/customer/components/PremiumCustomerUi.tsx',
    'src/modules/public/PublicHome.tsx', 'src/modules/admin/pages/SettingsPage.tsx',
    'src/modules/admin/pages/OwnerCapacityPage.tsx']) {
    assert.doesNotMatch(read(file), /RestaurantMenuPage|CustomerMenuView|loadCustomerMenuCatalog|["'`]\/admin\/menu|["'`]\/customer\/[^\s"'`]*\/menu/);
  }
  assert.match(read('src/modules/admin/AdminLayout.tsx'), /to: "\/admin\/qr"/);
  assert.match(read('src/modules/customer/components/PremiumCustomerUi.tsx'), /value: "collect" as const, icon: ScanLine, primary: true/);
});
