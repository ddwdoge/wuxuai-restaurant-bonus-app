import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const migration = read('supabase/migrations/20260911006000_legal_template_country_guard_compatibility.sql');
const baseline = read('supabase/migrations/20260724002000_legal_maps_hardening.sql');

function ensureFunction(sql) {
  const start = sql.indexOf('create or replace function public.ensure_restaurant_legal_templates');
  assert.notEqual(start, -1);
  const bodyStart = sql.indexOf('as $$', start);
  const end = sql.indexOf('$$;', bodyStart);
  assert.notEqual(bodyStart, -1);
  assert.notEqual(end, -1);
  return sql.slice(start, end + 3);
}

function unchangedBackfillBody(sql) {
  const fn = ensureFunction(sql);
  const start = fn.indexOf('  terms_content := ');
  const end = fn.lastIndexOf('\nend;');
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  return fn.slice(start, end);
}

test('legal and retention backfill body is byte-identical to the baseline', () => {
  assert.equal(unchangedBackfillBody(migration), unchangedBackfillBody(baseline));
});

test('only the shared helper is replaced', () => {
  assert.match(migration, /create or replace function public\.ensure_restaurant_legal_templates\(input_restaurant_id uuid\)/);
  assert.doesNotMatch(migration, /create\s+(?:or replace\s+)?function public\.(?!ensure_restaurant_legal_templates)/i);
  assert.doesNotMatch(migration, /alter table|create policy|create trigger|country_launch_policy/i);
});

test('country-less placeholder insertion is removed fail-closed', () => {
  assert.doesNotMatch(migration, /insert into public\.restaurant_legal_profiles/i);
  assert.match(migration, /message = 'LEGAL_PROFILE_REQUIRED'/);
  assert.match(migration, /message = 'LEGAL_PROFILE_INCOMPLETE'/);
  assert.match(migration, /profile_record\.country !~ '\^\[A-Z\]\{2\}\$'/);
});

test('existing complete tenant profile is locked and reused', () => {
  assert.match(migration, /from public\.restaurants[\s\S]*where id = input_restaurant_id[\s\S]*for share/);
  assert.match(migration, /from public\.restaurant_legal_profiles[\s\S]*where restaurant_id = restaurant_record\.id[\s\S]*for share/);
});

test('security-definer, search-path and private grant contract are preserved', () => {
  assert.match(migration, /security definer\s+set search_path = public, extensions/i);
  assert.match(migration, /revoke execute on function public\.ensure_restaurant_legal_templates\(uuid\)\s+from public, anon, authenticated/);
  assert.doesNotMatch(migration, /grant\s+/i);
});

test('legal content and consent stores are not changed outside preserved backfill', () => {
  assert.doesNotMatch(migration, /customer_legal_acceptances|customer_consents|kassa_compliance_acknowledgements/i);
  assert.doesNotMatch(migration, /update public\.legal_document_versions|delete from|truncate/i);
});
