export type LegalAction = 'snapshot' | 'publish' | 'withdraw';
export type LegalStatus = 'NOT_FOUND' | 'BLOCKED' | 'READY' | 'PUBLISHED' | 'WITHDRAWN' | 'STALE';
export type LegalIdentity = { bundle_id: string; bundle_sha256: string };
export type LegalDocument = { id: string; version: string; sha256: string; status: string; review_status?: string };
export type LegalContext = {
  restaurant_id: string; country: 'AT'; locale: 'de-AT'; technical_status: 'READY' | 'BLOCKED'; effective_status: LegalStatus;
  candidate: (LegalIdentity & { country: 'AT'; locale: 'de-AT'; technical_status: 'READY' | 'BLOCKED'; terms: LegalDocument; privacy: LegalDocument; policy_revision: Record<string, unknown> }) | null;
  snapshot: (LegalIdentity & { effective_status: LegalStatus; terms: LegalDocument; privacy: LegalDocument }) | null;
  policy_revision?: Record<string, unknown> | null; blocking_reasons: string[]; allowed_actions: LegalAction[];
};
export type LegalOperation = { action: LegalAction; key: string; bundleId: string; bundleHash: string; parameters: Record<string, unknown> };
export type LegalRunState = { phase: 'idle' | 'mutating' | 'checking_receipt' | 'confirmed' | 'not_found' | 'unclear' | 'contradictory'; operation: LegalOperation | null; receipt: unknown };
export type LegalRunner = { getState(): LegalRunState; subscribe(listener: (state: LegalRunState) => void): () => void; run(operation: LegalOperation): Promise<LegalRunState>; reconcile(): Promise<LegalRunState> };
export function parseLegalBundleControl(value: unknown, restaurantId: string): LegalContext;
export function createLegalBundleOperation(context: LegalContext, action: LegalAction, options: { key: string; approvalReference?: string; externalApproval?: boolean }): LegalOperation;
export function classifyLegalBundleReceipt(value: unknown, operation: LegalOperation): LegalRunState['phase'];
export function createLegalBundleRunner(call: (name: string, parameters: Record<string, unknown>) => Promise<unknown>): LegalRunner;
export const legalBundleGateLabels: Record<string, string>;
