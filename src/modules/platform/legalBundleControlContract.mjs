// No tables, browser storage, credentials or retrying mutations. Server authority only.
const hashPattern = /^[0-9a-f]{64}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const statuses = ['NOT_FOUND', 'BLOCKED', 'READY', 'PUBLISHED', 'WITHDRAWN', 'STALE'];
const actions = ['snapshot', 'publish', 'withdraw'];
const validIdentity = (value) => value && hashPattern.test(value.bundle_sha256) && value.bundle_id === `bundle-${value.bundle_sha256}`;
const validDocument = (value) => value && uuidPattern.test(value.id) && typeof value.version === 'string' && value.version.length > 0 && hashPattern.test(value.sha256) && typeof value.status === 'string';
export function parseLegalBundleControl(value, restaurantId) {
  if (!value || value.restaurant_id !== restaurantId || value.country !== 'AT' || value.locale !== 'de-AT'
    || !['READY', 'BLOCKED'].includes(value.technical_status) || !statuses.includes(value.effective_status)
    || !Array.isArray(value.blocking_reasons) || !value.blocking_reasons.every(reason => typeof reason === 'string')
    || !Array.isArray(value.allowed_actions) || !value.allowed_actions.every(action => actions.includes(action))) throw new Error('LEGAL_CONTROL_INVALID');
  const candidate = value.candidate;
  if (candidate && (!validIdentity(candidate) || candidate.country !== 'AT' || candidate.locale !== 'de-AT'
    || !validDocument(candidate.terms) || !validDocument(candidate.privacy) || !candidate.policy_revision
    || candidate.technical_status !== value.technical_status)) throw new Error('LEGAL_CONTROL_INVALID');
  if (value.snapshot && (!validIdentity(value.snapshot) || value.snapshot.effective_status !== value.effective_status || !validDocument(value.snapshot.terms) || !validDocument(value.snapshot.privacy))) throw new Error('LEGAL_CONTROL_INVALID');
  if (value.allowed_actions.includes('snapshot') && !candidate) throw new Error('LEGAL_CONTROL_INVALID');
  if (value.allowed_actions.includes('publish') && (!candidate || !value.snapshot
    || candidate.bundle_id !== value.snapshot.bundle_id || value.technical_status !== 'READY'
    || !['READY','WITHDRAWN'].includes(value.effective_status))) throw new Error('LEGAL_CONTROL_INVALID');
  if (value.allowed_actions.includes('withdraw') && (!value.snapshot || ['NOT_FOUND','WITHDRAWN'].includes(value.effective_status))) throw new Error('LEGAL_CONTROL_INVALID');
  return globalThis.structuredClone(value);
}
export function createLegalBundleOperation(context, action, { key, approvalReference = '', externalApproval = false }) {
  context = parseLegalBundleControl(context, context.restaurant_id);
  if (!uuidPattern.test(key) || !context.allowed_actions.includes(action)) throw new Error('LEGAL_ACTION_BLOCKED');
  const candidate = context.candidate;
  const target = action === 'snapshot' ? candidate : context.snapshot;
  let parameters;
  if (action === 'snapshot') {
    parameters = {
      input_restaurant_id: context.restaurant_id, input_country: 'AT', input_locale: 'de-AT',
      input_terms_id: candidate.terms.id, input_expected_terms_version: candidate.terms.version,
      input_expected_terms_hash: candidate.terms.sha256, input_expected_terms_status: candidate.terms.status,
      input_privacy_id: candidate.privacy.id, input_expected_privacy_version: candidate.privacy.version,
      input_expected_privacy_hash: candidate.privacy.sha256, input_expected_privacy_status: candidate.privacy.status,
      input_expected_policy_revision: globalThis.structuredClone(candidate.policy_revision), input_idempotency_key: key,
    };
  } else {
    if (!/^[A-Z0-9][A-Z0-9_-]{2,79}$/.test(approvalReference) || (action === 'publish' && externalApproval !== true)) throw new Error('LEGAL_APPROVAL_REQUIRED');
    parameters = { input_bundle_id: target.bundle_id, input_expected_bundle_hash: target.bundle_sha256,
      input_action: action, input_expected_status: context.effective_status,
      input_external_approval_confirmed: action === 'publish' && externalApproval,
      input_approval_reference: approvalReference, input_idempotency_key: key };
  }
  return Object.freeze({ action, key, bundleId: target.bundle_id, bundleHash: target.bundle_sha256, parameters: Object.freeze(parameters) });
}
export function classifyLegalBundleReceipt(value, operation) {
  if (value?.found === false) return 'not_found';
  if (value?.found !== true || !value.receipt) return 'unclear';
  const receipt = value.receipt;
  if (receipt.operation !== operation.action || receipt.bundle_id !== operation.bundleId || receipt.bundle_sha256 !== operation.bundleHash
    || !statuses.includes(receipt.effective_status) || !statuses.includes(value.current_effective_status)
    || typeof value.committed_at !== 'string'
    || (operation.action !== 'snapshot' && !uuidPattern.test(receipt.event_id))) return 'contradictory';
  if ((operation.action === 'publish' && receipt.effective_status !== 'PUBLISHED')
    || (operation.action === 'withdraw' && receipt.effective_status !== 'WITHDRAWN')
    || (operation.action === 'snapshot' && receipt.effective_status === 'NOT_FOUND')) return 'contradictory';
  return 'confirmed';
}
export function createLegalBundleRunner(call) {
  let state = { phase: 'idle', operation: null, receipt: null };
  let inFlight = false;
  const usedKeys = new Set();
  const listeners = new Set();
  const update = (next) => { state = next; listeners.forEach(listener => listener(state)); };
  async function readReceipt(operation) {
    update({ phase: 'checking_receipt', operation, receipt: null });
    try {
      const value = await call('get_platform_legal_bundle_receipt', {
        input_idempotency_key: operation.key, input_expected_bundle_id: operation.bundleId,
      });
      update({ phase: classifyLegalBundleReceipt(value, operation), operation, receipt: value });
    } catch { update({ phase: 'unclear', operation, receipt: null }); }
    return state;
  }
  return {
    getState: () => state,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    async run(operation) {
      if (inFlight || usedKeys.has(operation.key) || !['idle','confirmed'].includes(state.phase)) return state;
      inFlight = true;
      usedKeys.add(operation.key);
      update({ phase: 'mutating', operation, receipt: null });
      try {
        try { await call(operation.action === 'snapshot' ? 'create_platform_legal_bundle_snapshot' : 'set_platform_legal_bundle_publication', operation.parameters); }
        catch { /* Lost/failed transport is resolved only by the concrete receipt. */ }
        return await readReceipt(operation);
      } finally { inFlight = false; }
    },
    async reconcile() {
      if (inFlight || !state.operation || !['unclear','not_found','contradictory'].includes(state.phase)) return state;
      inFlight = true;
      try { return await readReceipt(state.operation); } finally { inFlight = false; }
    },
  };
}
export const legalBundleGateLabels = {
  AT_JURISDICTION_REQUIRED: 'Dieser Bereich gilt ausschließlich für den Rechtsraum Österreich.',
  POLICY_REVISION_REQUIRED: 'Eine eindeutige aktuelle Policy-Revision fehlt.',
  CURRENT_DOCUMENTS_REQUIRED: 'Aktuelle Teilnahmebedingungen oder Datenschutzerklärung fehlen oder sind veraltet.',
  CURRENT_TEMPLATES_REQUIRED: 'Die aktuellen geprüften Dokumentvorlagen sind nicht eindeutig verfügbar.',
  CURRENT_REFERENCES_UNAVAILABLE: 'Die aktuellen Dokument- und Policy-Bezüge sind nicht sicher prüfbar.',
  TERMS_DOCUMENT_NOT_PUBLISHED: 'Die Teilnahmebedingungen sind noch nicht veröffentlicht.',
  PRIVACY_DOCUMENT_NOT_PUBLISHED: 'Die Datenschutzerklärung ist noch nicht veröffentlicht.',
  TERMS_LEGAL_REVIEW_REQUIRED: 'Die rechtliche Prüfung der Teilnahmebedingungen ist offen; Entwürfe bleiben gesperrt.',
  PRIVACY_LEGAL_REVIEW_REQUIRED: 'Die rechtliche Prüfung der Datenschutzerklärung ist offen; Entwürfe bleiben gesperrt.',
  TERMS_TEMPLATE_INACTIVE: 'Die Vorlage der Teilnahmebedingungen ist nicht aktiv.',
  PRIVACY_TEMPLATE_INACTIVE: 'Die Datenschutzvorlage ist nicht aktiv.',
  TERMS_EFFECTIVE_DATE_PENDING: 'Das Gültigkeitsdatum der Teilnahmebedingungen liegt in der Zukunft.',
  PRIVACY_EFFECTIVE_DATE_PENDING: 'Das Gültigkeitsdatum der Datenschutzerklärung liegt in der Zukunft.',
  REAL_INTAKE_STATUS_BLOCKED: 'Die AT-Freigabe für reguläre Betriebe ist offen.',
  LEGAL_STATUS_BLOCKED: 'Die AT-Rechtspolicy ist noch nicht freigegeben.',
  PRIVACY_STATUS_BLOCKED: 'Die AT-Datenschutzpolicy ist noch nicht freigegeben.',
  DOCUMENT_CATALOG_STATUS_BLOCKED: 'Der AT-Dokumentkatalog ist noch nicht freigegeben.',
  RETENTION_STATUS_BLOCKED: 'Die AT-Aufbewahrungspolicy ist noch nicht freigegeben.',
  TECHNICAL_GATES_BLOCKED: 'Mindestens eine technische Freigabebedingung fehlt.',
  SNAPSHOT_REQUIRED: 'Ein unveränderlicher Bundle-Snapshot fehlt.',
  SNAPSHOT_STALE: 'Der vorhandene Snapshot ist durch neuere Dokument- oder Policystände veraltet.',
  PUBLICATION_WITHDRAWN: 'Die Veröffentlichung wurde zurückgezogen.',
  PUBLICATION_REQUIRED: 'Es liegt keine aktuell wirksame Bundle-Veröffentlichung vor.',
};
