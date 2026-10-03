import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { AppDrawer } from '../../shared/components/AppDrawer';
import { useAuth } from '../auth/AuthProvider';
import { normalizeTotpCode, totpFactorLabel } from './platformAdminMfa.mjs';
import { loadPlatformTestCollectionMfaProof, refreshPlatformTestCollectionRecentTotp } from './platformAdminService';
import { loadPlatformLegalBundleControl, platformLegalBundleRunner } from './platformLegalBundleService';
import { createLegalBundleOperation, legalBundleGateLabels, type LegalAction, type LegalContext, type LegalRunState } from './legalBundleControlContract.mjs';
import './platform-legal-bundle-control.css';

const actionLabels: Record<LegalAction, string> = { snapshot: 'Bundle-Snapshot erstellen', publish: 'Bundle veröffentlichen', withdraw: 'Veröffentlichung zurückziehen' };
const statusLabels = { NOT_FOUND: 'Kein Snapshot vorhanden', BLOCKED: 'Blockiert', READY: 'Veröffentlichungsbereit', PUBLISHED: 'Veröffentlicht', WITHDRAWN: 'Zurückgezogen', STALE: 'Veraltet' };
const receiptLabels: Record<LegalRunState['phase'], string> = { idle: 'Noch kein Vorgang', mutating: 'Mutation läuft', checking_receipt: 'Receipt wird geprüft', confirmed: 'Bestätigt', not_found: 'Nicht gefunden – weitere Änderungen gesperrt', unclear: 'Unklarer Ausgang – weitere Änderungen gesperrt', contradictory: 'Widersprüchlicher Beleg – weitere Änderungen gesperrt' };
const shortHash = (hash?: string) => hash ? `${hash.slice(0, 12)}…${hash.slice(-8)}` : 'Nicht vorhanden';
type Confirmation = { action: LegalAction; key: string; context: LegalContext };
type Factor = { id: string; friendly_name?: string };

export function PlatformLegalBundleControl({ restaurantId, canWrite }: { restaurantId: string; canWrite: boolean }) {
  const { user, platformRole } = useAuth();
  const authorized = platformRole === 'platform_owner' || platformRole === 'platform_admin';
  const runner = useMemo(() => platformLegalBundleRunner(user?.id ?? '', restaurantId), [user?.id, restaurantId]);
  const [run, setRun] = useState(runner.getState);
  const [context, setContext] = useState<LegalContext | null>(null);
  const [phase, setPhase] = useState<'loading' | 'authentication' | 'loaded' | 'error'>('loading');
  const [factors, setFactors] = useState<Factor[]>([]);
  const [factorId, setFactorId] = useState('');
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [code, setCode] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [externalApproval, setExternalApproval] = useState(false);
  const [reference, setReference] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const generation = useRef(0);
  const mounted = useRef(true);
  const prefix = useId();
  const busy = authBusy || run.phase === 'mutating' || run.phase === 'checking_receipt';
  const locked = !['idle', 'confirmed'].includes(run.phase);

  const invalidate = useCallback(() => { generation.current += 1; }, []);
  const load = useCallback(async () => {
    const request = ++generation.current;
    setContext(null); setPhase('loading'); setError('');
    if (!authorized || !user?.id) return;
    try {
      const proof = await loadPlatformTestCollectionMfaProof();
      if (request !== generation.current) return;
      setFactors(proof.verifiedFactors);
      setFactorId(current => proof.verifiedFactors.some(factor => factor.id === current) ? current : (proof.verifiedFactors[0]?.id ?? ''));
      if (!proof.aal2 || !proof.verifiedFactors.length) { setPhase('authentication'); return; }
      const data = await loadPlatformLegalBundleControl(restaurantId);
      if (request !== generation.current) return;
      setContext(data); setPhase('loaded');
    } catch (failure) {
      if (request !== generation.current) return;
      const message = failure && typeof failure === 'object' && 'message' in failure ? String(failure.message) : '';
      setPhase(message.includes('RECENT_PLATFORM_TOTP_REQUIRED') ? 'authentication' : 'error');
      setError(message.includes('LEGAL_BUNDLE_ACCESS_DENIED') ? 'Keine autorisierte Platform-Admin-Berechtigung.' : 'Der autoritative Bundle-Zustand konnte nicht sicher gelesen werden.');
    }
  }, [authorized, user?.id, restaurantId]);

  useEffect(() => {
    mounted.current = true;
    setRun(runner.getState());
    setConfirmation(null); setCode(''); setConfirmed(false); setExternalApproval(false); setReference('');
    const unsubscribe = runner.subscribe(setRun);
    void load();
    return () => { mounted.current = false; invalidate(); unsubscribe(); };
  }, [runner, load, invalidate]);

  async function authenticateAndRead(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current || busy || !factorId || code.length !== 6) return;
    inFlight.current = true; setAuthBusy(true); setError('');
    try {
      await refreshPlatformTestCollectionRecentTotp(factorId, code);
      if (mounted.current) { setCode(''); await load(); }
    } catch { if (mounted.current) setError('Der aktuelle Authenticator-Nachweis wurde nicht bestätigt.'); }
    finally { inFlight.current = false; if (mounted.current) setAuthBusy(false); }
  }
  function openConfirmation(action: LegalAction) {
    if (!authorized || !canWrite || busy || locked || !context?.allowed_actions.includes(action)) return;
    setConfirmation({ action, key: crypto.randomUUID(), context: structuredClone(context) });
    setCode(''); setConfirmed(false); setExternalApproval(false); setReference(''); setError('');
  }
  function closeConfirmation() {
    if (busy) return;
    setConfirmation(null); setCode(''); setConfirmed(false); setExternalApproval(false); setReference(''); setError('');
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!confirmation || !authorized || !canWrite || !confirmed || !factorId || code.length !== 6 || inFlight.current || busy || locked) return;
    let operation;
    try { operation = createLegalBundleOperation(confirmation.context, confirmation.action, { key: confirmation.key, approvalReference: reference, externalApproval }); }
    catch { setError('Die Bestätigung oder datensparsame Freigabereferenz fehlt.'); return; }
    inFlight.current = true; setAuthBusy(true); setError('');
    try {
      await refreshPlatformTestCollectionRecentTotp(factorId, code);
    } catch {
      inFlight.current = false;
      if (mounted.current) { setAuthBusy(false); setCode(''); setError('Der aktuelle Authenticator-Nachweis wurde nicht bestätigt. Es wurde keine Mutation angefordert.'); }
      return;
    }
    // This runner survives MFA remounts; exactly one attempt per action key.
    try {
      const result = await runner.run(operation);
      if (mounted.current) {
        setCode(''); setConfirmation(null); setConfirmed(false); setExternalApproval(false); setReference('');
        if (result.phase === 'confirmed') await load();
      }
    } finally { inFlight.current = false; if (mounted.current) setAuthBusy(false); }
  }
  async function reconcile() {
    if (busy || inFlight.current) return;
    inFlight.current = true;
    try { const result = await runner.reconcile(); if (mounted.current && result.phase === 'confirmed') await load(); }
    finally { inFlight.current = false; }
  }
  if (!authorized || !user?.id) return <section className="platform-control-section platform-legal-bundle"><h3>AT Legal-Bundle</h3><p role="status">Nicht autorisiert. Es sind keine Aktionen verfügbar.</p></section>;
  const displayedBundle = confirmation?.action === 'snapshot' ? confirmation.context.candidate : confirmation?.context.snapshot;
  const canConfirm = confirmed && code.length === 6 && Boolean(factorId)
    && (confirmation?.action === 'snapshot' || /^[A-Z0-9][A-Z0-9_-]{2,79}$/.test(reference))
    && (confirmation?.action !== 'publish' || externalApproval);
  const totpFields = <>
    <label htmlFor={`${prefix}-factor`}>Authenticator-Gerät</label>
    <select disabled={busy} id={`${prefix}-factor`} onChange={event => { setFactorId(event.target.value); setCode(''); }} value={factorId}>
      {factors.map((factor, index) => <option key={factor.id} value={factor.id}>{totpFactorLabel(factor, index)}</option>)}
    </select>
    <label htmlFor={`${prefix}-code`}>Aktueller sechsstelliger Bestätigungscode</label>
    <input autoComplete="one-time-code" disabled={busy} id={`${prefix}-code`} inputMode="numeric" maxLength={6} onChange={event => setCode(normalizeTotpCode(event.target.value))} pattern="[0-9]{6}" required type="text" value={code} />
  </>;
  return <section aria-labelledby={`${prefix}-title`} className="platform-control-section platform-legal-bundle" data-testid="platform-legal-bundle-control" aria-busy={busy || phase === 'loading'}>
    <h3 id={`${prefix}-title`}>AT Legal-Bundle</h3>
    <p>Ein Snapshot hält einen unveränderlichen Dokumentstand fest. Die technische Veröffentlichung ersetzt keine Rechtsprüfung und dokumentiert ausschließlich eine bereits außerhalb des Systems erfolgte Founder-/Kanzleifreigabe.</p>
    {phase === 'loading' ? <p role="status">Bundle-Zustand lädt …</p> : null}
    {phase === 'authentication' ? <><p role="status">Zusätzliche Authentifizierung erforderlich. Bestätige den aktuellen Zugang mit deiner Authenticator-App.</p><form onSubmit={event => void authenticateAndRead(event)}>{totpFields}<button className="button secondary" disabled={busy || !factorId || code.length !== 6} type="submit">Sicherheitsnachweis bestätigen und Status lesen</button></form></> : null}
    {error ? <p role="alert">{error}</p> : null}
    {context ? <>
      <dl className="platform-detail-list">
        <div><dt>Land / Locale</dt><dd>Österreich (AT) / de-AT</dd></div>
        <div><dt>Teilnahmebedingungen-Version</dt><dd>{context.candidate?.terms.version ?? 'Nicht sicher verfügbar'} · SHA-256 {shortHash(context.candidate?.terms.sha256)}</dd></div>
        <div><dt>Datenschutzversion</dt><dd>{context.candidate?.privacy.version ?? 'Nicht sicher verfügbar'} · SHA-256 {shortHash(context.candidate?.privacy.sha256)}</dd></div>
        <div><dt>Bundle-ID</dt><dd>{context.snapshot?.bundle_id ?? 'Noch kein Snapshot vorhanden'}</dd></div>
        <div><dt>Bundle-Hash</dt><dd>{shortHash(context.snapshot?.bundle_sha256)}</dd></div>
        <div><dt>Technischer Status</dt><dd>{context.technical_status === 'READY' ? 'Technisch vollständig' : 'Blockiert'}</dd></div>
        <div><dt>Publikationsstatus</dt><dd>{statusLabels[context.effective_status]}</dd></div>
        <div><dt>Policy-Revision</dt><dd>{String(context.policy_revision?.revision_id ?? context.candidate?.policy_revision.revision_id ?? 'Nicht sicher verfügbar')}</dd></div>
      </dl>
      <h4>Offene Gates</h4>
      {context.blocking_reasons.length ? <ul>{context.blocking_reasons.map(reason => <li key={reason}>{legalBundleGateLabels[reason] ?? 'Eine serverseitige Freigabebedingung ist offen.'}</li>)}</ul> : <p>Keine offenen technischen Gates.</p>}
      {context.allowed_actions.includes('publish') ? <p>Vor der Veröffentlichung ist zusätzlich die ausdrückliche Bestätigung einer externen Founder-/Kanzleifreigabe erforderlich.</p> : null}
      <div className="platform-legal-bundle-actions">{(['snapshot', 'publish', 'withdraw'] as LegalAction[]).map(action => <button className="button secondary" disabled={!canWrite || busy || locked || phase !== 'loaded' || !context.allowed_actions.includes(action)} key={action} onClick={() => openConfirmation(action)} type="button">{actionLabels[action]}</button>)}</div>
    </> : null}
    <p aria-live="polite" role="status">Letzter Receipt-Status: {receiptLabels[run.phase]}{run.phase === 'confirmed' ? '. Erfolg ist durch den konkreten serverseitigen Beleg bestätigt.' : ''}</p>
    {locked && !busy ? <><p>Es erfolgt keine automatische Wiederholung. Ein fehlender oder widersprüchlicher Beleg erlaubt keine weitere Mutation.</p><button className="button secondary" onClick={() => void reconcile()} type="button">Konkreten Receipt erneut prüfen</button></> : null}
    <button className="button secondary" disabled={busy} onClick={() => void load()} type="button">Status erneut prüfen</button>
    <AppDrawer closeLabel="Abbrechen" className="platform-legal-bundle-drawer" dismissOnEscape={!busy} dismissOnOverlay={!busy} onClose={closeConfirmation} open={Boolean(confirmation)} size="compact" title={confirmation ? actionLabels[confirmation.action] : 'Bundle-Aktion bestätigen'}>
      {confirmation ? <form onSubmit={event => void submit(event)}>
        <p>Dieser Vorgang ist bewusst manuell. Snapshot und Auditbeleg sind unveränderlich; Rücknahmen erzeugen einen weiteren Beleg und löschen keine Historie.</p>
        <dl><dt>Exakte Bundle-ID</dt><dd>{displayedBundle?.bundle_id}</dd><dt>Teilnahmebedingungen</dt><dd>{displayedBundle?.terms.version ?? 'Nicht sicher verfügbar'}</dd><dt>Datenschutz</dt><dd>{displayedBundle?.privacy.version ?? 'Nicht sicher verfügbar'}</dd></dl>
        {confirmation.action !== 'snapshot' ? <><label htmlFor={`${prefix}-reference`}>Datensparsame Freigabereferenz</label><input disabled={busy} id={`${prefix}-reference`} maxLength={80} onChange={event => setReference(event.target.value)} pattern={"[A-Z0-9][A-Z0-9_\\-]{2,79}"} required type="text" value={reference} /><p>Nur eine interne Kennung aus Großbuchstaben, Ziffern, Bindestrich oder Unterstrich. Keine Namen, Kontaktdaten oder vertraulichen Dokumentinhalte.</p></> : null}
        {confirmation.action === 'publish' ? <label className="platform-legal-bundle-choice"><input checked={externalApproval} disabled={busy} onChange={event => setExternalApproval(event.target.checked)} type="checkbox" /><span>Die Founder-/Kanzleifreigabe für exakt diesen unveränderlichen Bundle-Stand liegt außerhalb des Systems vor.</span></label> : null}
        {totpFields}
        <label className="platform-legal-bundle-choice"><input checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} type="checkbox" /><span>Ich bestätige die angezeigte Aktion, die exakten Dokumentstände und den unveränderlichen Auditbeleg.</span></label>
        {error ? <p role="alert">{error}</p> : null}
        <div className="platform-legal-bundle-actions"><button className="button secondary" disabled={busy} onClick={closeConfirmation} type="button">Abbrechen</button><button className="button primary" disabled={busy || locked || !canConfirm} type="submit">{busy ? 'Wird sicher geprüft …' : 'Einmalig bestätigen'}</button></div>
      </form> : null}
    </AppDrawer>
  </section>;
}
