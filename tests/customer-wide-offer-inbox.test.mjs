import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const sql = read('supabase/migrations/20261009143145_customer_wide_offer_inbox.sql');
const ui = read('src/modules/customer/CustomerOfferInboxPage.tsx');
const service = read('src/modules/customer/customerOfferInbox.ts');

test('central identity and session are authoritative; no browser tenant/customer inputs', () => {
  assert.match(sql, /read_authenticated_customer_account_id\(\)/);
  assert.match(sql, /customer_verified_session_id\(\)/);
  assert.match(sql, /m.account_id=account_id_value/);
  assert.match(sql, /c.branch_id=b.id/);
  assert.match(sql, /c.organization_id=r.organization_id/);
  assert.doesNotMatch(service, /input_(customer|restaurant|account)_id/);
});
test('current source, existing TEST_ONLY and PRO entitlement are all required', () => {
  assert.match(sql, /pro_in_app_test_scope_allowed_internal\(r.id,c.id\)/);
  assert.match(sql, /restaurant_entitlement_enabled\(r.id,'offer_notifications'\)/);
  assert.match(sql, /o.status='PUBLISHED' and o.is_active/g);
  assert.match(sql, /o.valid_to>statement_timestamp\(\)/g);
  assert.match(sql, /n.event_type='OFFER_PUBLISHED'/);
  assert.doesNotMatch(sql, /POINT_REWARD_AVAILABLE|create or replace function/);
});
test('bounded keyset pagination counts every visible unread event, not just one page', () => {
  assert.match(sql, /least\(greatest\(coalesce\(input_limit,20\),1\),50\)/);
  assert.match(sql, /\(created_at,id\)<\(input_before_created_at,input_before_id\)/);
  assert.match(sql, /'unread_count',\(select count\(\*\) from visible where read_at is null\)/);
  assert.match(sql, /limit page_size\+1/);
  assert.doesNotMatch(sql, /\boffset\b/i);
});
test('opening rechecks after notification lock and acknowledges exactly one event', () => {
  const open = sql.slice(sql.indexOf('create function public.open_customer_offer_inbox_entry'));
  assert.match(open, /for update of n/);
  assert.match(open, /for share/);
  assert.match(open, /where id=notification.id returning read_at/);
  assert.match(open, /coalesce\(read_at,statement_timestamp\(\)\)/);
  assert.ok(open.indexOf('INBOX_OFFER_UNAVAILABLE') < open.indexOf('set read_at='));
  assert.doesNotMatch(open, /insert into|delete from|points_transactions|email_deliveries/i);
});
test('only authenticated entrypoints are executable, no table grants', () => {
  assert.match(sql, /from public, anon, authenticated, service_role/);
  assert.match(sql, /grant execute on function public.get_customer_offer_inbox\(integer,timestamptz,uuid\) to authenticated/);
  assert.match(sql, /grant execute on function public.open_customer_offer_inbox_entry\(uuid\) to authenticated/);
  assert.doesNotMatch(sql, /grant (select|insert|update|delete)|disable row level security/i);
});
test('UI waits for server opening, guards stale context, keeps pagination in one RPC', () => {
  assert.match(ui, /await openCustomerOfferInboxEntry\(id\)/);
  assert.match(ui, /owner !== identity.current/);
  assert.match(ui, /contextRevision/);
  assert.match(ui, /if \(opening.current\) return/);
  assert.doesNotMatch(service, /get_customer_pro_in_app_inbox|customer-offer-email|setAppBadge|Notification\.requestPermission/);
  for (const language of ['de','en','fr','it','es','zh','ko']) assert.match(service, new RegExp(`${language}: \\[`));
});
