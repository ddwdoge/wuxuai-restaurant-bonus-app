// Local-only real Auth + Mailpit browser evidence. Never print credentials or raw errors.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const runtime = process.env.RECOVERY_LOCAL_STACK;
assert.ok(runtime, 'RECOVERY_LOCAL_STACK required');
assert.ok(!existsSync(resolve(runtime, 'supabase/.temp/project-ref')), 'Unlinked only');
const config = readFileSync(resolve(runtime, 'supabase/config.toml'), 'utf8');
assert.match(config, /otp_expiry = 30/);
assert.match(config, /\[local_smtp\]\s*enabled = true/);
const cli = resolve('node_modules/.bin/supabase');
const status = JSON.parse(execFileSync(cli, ['status', '--workdir', runtime, '-o', 'json'],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
for (const key of ['API_URL', 'MAILPIT_URL']) assert.equal(new URL(status[key]).hostname, '127.0.0.1');
const base = 'http://127.0.0.1:56226';
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const client = () => createClient(status.API_URL, status.ANON_KEY, options);
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, options);
const sql = query => execFileSync(process.env.LOCAL_DOCKER ?? 'docker', ['exec', '-i',
  'supabase_db_wuxuai-recovery-browser-20261007', 'psql', '-XqAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres'],
{ input: query, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
const roles = () => sql(`select json_build_array((select count(*) from restaurant_members),
  (select count(*) from platform_admins),(select count(*) from customers),
  (select count(*) from restaurants))`);
const beforeRoles = roles();
assert.equal(beforeRoles, '[0, 0, 0, 0]');
const playwright = await import(process.env.WUXUAI_PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.WUXUAI_PLAYWRIGHT_MODULE).href : 'playwright');
const server = spawn(process.execPath, [resolve('node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '56226', '--strictPort'],
  { env: { ...process.env, VITE_SUPABASE_URL: status.API_URL, VITE_SUPABASE_ANON_KEY: status.ANON_KEY }, stdio: 'ignore' });
const pause = ms => new Promise(r => setTimeout(r, ms));
const results = [];
let phase = 'startup';
let browser;
const check = (name, passed) => { results.push({ name, passed: Boolean(passed) }); console.log(JSON.stringify({ name, passed: Boolean(passed) })); };
async function identity() {
  const email = `test-only-recovery-${randomUUID()}@example.invalid`;
  const password = `Aa!9${randomUUID()}`;
  const result = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert.ifError(result.error);
  return { email, password, id: result.data.user.id };
}
async function mailLink(email) {
  for (let i = 0; i < 100; i++) {
    const list = await (await fetch(`${status.MAILPIT_URL}/api/v1/messages`)).json();
    for (const entry of list.messages) {
      if (!JSON.stringify(entry.To).includes(email)) continue;
      const mail = await (await fetch(`${status.MAILPIT_URL}/api/v1/message/${entry.ID}`)).json();
      const match = mail.HTML.match(/href="([^"]+)"/);
      const link = new URL(match[1].replaceAll('&amp;', '&'));
      assert.equal(link.origin, status.API_URL);
      assert.equal(new URL(link.searchParams.get('redirect_to')).origin, base);
      return link.href;
    }
    await pause(100);
  }
  throw new Error('MAIL_MISSING');
}
async function request(page, account) {
  phase += ':request-page';
  await page.goto(`${base}/auth/forgot-password?portal=customer`);
  await page.locator('#forgot-password-email').fill(account.email);
  phase += ':submit';
  if (process.env.RECOVERY_DIAGNOSTIC_SCREENSHOT) await page.screenshot({ path: process.env.RECOVERY_DIAGNOSTIC_SCREENSHOT, mask: [page.locator('input')] });
  await page.getByRole('button', { name: 'Reset-Link senden' }).click();
  await page.getByRole('status').waitFor();
  phase += ':mail';
  return mailLink(account.email);
}
async function denied(page, link, label) {
  await page.goto(link);
  await page.getByText('Dieser Link zum Zurücksetzen des Passworts ist ungültig oder abgelaufen.', { exact: true }).waitFor();
  check(label, await page.locator('#new-password').count() === 0);
}
try {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(base)).ok) break; } catch { /* server starts */ }
    await pause(100);
  }
  for (const engine of ['chromium', 'webkit']) {
    phase = `${engine}:launch`;
    browser = await playwright[engine].launch({ headless: true });
    const foreign = await identity();
    const foreignApi = client();
    const foreignLogin = await foreignApi.auth.signInWithPassword(foreign);
    assert.ifError(foreignLogin.error);
    const foreignContext = await browser.newContext({ locale: 'de-AT' });
    await foreignContext.addInitScript(session => {
      localStorage.setItem('sb-127-auth-token', JSON.stringify(session));
    }, foreignLogin.data.session);
    const foreignPage = await foreignContext.newPage();
    await foreignPage.goto(`${base}/auth/forgot-password?portal=customer`);
    const context = await browser.newContext({ locale: 'de-AT' });
    await context.route('**/*', route => {
      const origin = new URL(route.request().url()).origin;
      return [base, status.API_URL].includes(origin) ? route.continue() : route.abort();
    });
    const page = await context.newPage();
    page.on('response', async response => {
      const url = new URL(response.url());
      if (url.origin === status.API_URL && response.status() >= 400) {
        const data = await response.json().catch(() => ({}));
        console.log(JSON.stringify({ diagnostic: 'auth-http', status: response.status(),
          code: /^[a-z_]+$/.test(data.code ?? data.error_code ?? '') ? (data.code ?? data.error_code) : 'withheld' }));
      }
    });
    page.setDefaultTimeout(15000);
    for (const reload of [false, true]) {
      phase = `${engine}:${reload ? 'reload' : 'valid'}`;
      const account = await identity();
      const link = await request(page, account);
      phase = `${engine}:${reload ? 'reload' : 'valid'}:open-link`;
      await page.goto(link);
      await page.locator('#new-password').waitFor();
      const newTab = await context.newPage();
      await denied(newTab, page.url(), `${phase}:new-tab-without-marker`);
      await newTab.close();
      check(`${phase}:scrub`, !new URL(page.url()).hash && !/token|code=/.test(new URL(page.url()).search));
      if (reload) { await page.reload(); await page.locator('#new-password').waitFor(); }
      const next = `Bb!9${randomUUID()}`;
      await page.locator('#new-password').fill(next);
      await page.locator('#confirm-new-password').fill(next);
      await page.getByRole('button', { name: 'Passwort speichern', exact: true }).click();
      await page.waitForURL(url => url.pathname.endsWith('/login'));
      await page.getByRole('heading', { name: 'Gästekonto öffnen', exact: true }).waitFor();
      check(`${phase}:customer-route`, new URL(page.url()).pathname === '/customer/login');
      check(`${phase}:success-visible`, await page.getByText('Dein Passwort wurde geändert. Du kannst dich jetzt anmelden.', { exact: true }).count() === 1);
      const updatedClient = client();
      const login = await updatedClient.auth.signInWithPassword({ email: account.email, password: next });
      check(`${phase}:identity`, !login.error && login.data.user.id === account.id);
      const access = await updatedClient.rpc('get_current_portal_access');
      const platform = await updatedClient.rpc('get_current_platform_role');
      check(`${phase}:server-roles`, !access.error && !platform.error && platform.data === null
        && access.data.owner_access === false && access.data.staff_access === false);
      check(`${phase}:foreign-session-unchanged`, (await foreignApi.auth.getUser()).data.user?.id === foreign.id
        && await foreignPage.evaluate(id => JSON.parse(localStorage.getItem('sb-127-auth-token')).user.id === id, foreign.id));
      check(`${phase}:old-password-denied`, (await client().auth.signInWithPassword(account)).error !== null);
      await denied(page, link, `${phase}:replay`);
      const other = await browser.newContext({ locale: 'de-AT' });
      const otherPage = await other.newPage();
      await denied(otherPage, link, `${phase}:separate-session-replay`);
      await denied(otherPage, `${base}/auth/update-password?portal=customer`, `${phase}:no-session`);
      await other.close();
      check(`${phase}:roles-unchanged`, roles() === beforeRoles);
    }
    phase = `${engine}:expired`;
    const expired = await identity();
    const expiredLink = await request(page, expired);
    await pause(32000);
    await denied(page, expiredLink, `${phase}:denied`);
    check(`${phase}:password-unchanged`, !(await client().auth.signInWithPassword(expired)).error);
    await browser.close(); browser = null;
  }
} catch (error) { results.push({ name: phase, passed: false, error: 'LOCAL_STEP_FAILED_RAW_ERROR_WITHHELD',
  timeout: error.name === 'TimeoutError', strictSelector: String(error.message).includes('strict mode violation') }); }
finally { if (browser) await browser.close(); server.kill('SIGTERM'); }
console.log(JSON.stringify({ results, passed: results.every(r => r.passed) }, null, 2));
if (results.some(r => !r.passed)) process.exitCode = 1;
