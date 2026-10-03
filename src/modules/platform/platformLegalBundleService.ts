import { supabase } from '../../shared/lib/supabase';
import { createLegalBundleRunner, parseLegalBundleControl, type LegalRunner } from './legalBundleControlContract.mjs';
// Keep pending operation identity across the existing MFA gate's remounts.
// Only non-secret, actor-scoped operation metadata is held in memory.
const runners = new Map<string, LegalRunner>();
async function call(name: string, parameters: Record<string, unknown>): Promise<unknown> {
  if (!supabase) throw new Error('LEGAL_CONTROL_UNAVAILABLE');
  const result = await supabase.rpc(name, parameters).abortSignal(AbortSignal.timeout(15000));
  if (result.error) throw result.error;
  return result.data;
}
export async function loadPlatformLegalBundleControl(restaurantId: string) {
  return parseLegalBundleControl(await call('get_platform_at_legal_bundle_control', { input_restaurant_id: restaurantId }), restaurantId);
}
export function platformLegalBundleRunner(actorId: string, restaurantId: string) {
  const scope = `${actorId}:${restaurantId}`;
  let runner = runners.get(scope);
  if (!runner) {
    runner = createLegalBundleRunner(async (name, parameters) => {
      if (name !== 'get_platform_legal_bundle_receipt') {
        if (!supabase) throw new Error('LEGAL_CONTROL_UNAVAILABLE');
        const session = await supabase.auth.getSession();
        if (session.error || session.data.session?.user.id !== actorId) throw new Error('LEGAL_CONTROL_ACTOR_CHANGED');
      }
      return call(name, parameters);
    });
    runners.set(scope, runner);
  }
  return runner;
}
