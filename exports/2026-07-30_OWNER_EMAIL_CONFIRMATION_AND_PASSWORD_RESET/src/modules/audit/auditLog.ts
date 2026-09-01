import { supabase } from "../../shared/lib/supabase";
import type { AuditEvent } from "../../shared/types/domain";

export async function writeAuditLog(event: AuditEvent) {
  if (!supabase) {
    console.info("[audit_log]", event);
    return;
  }

  const { error } = await supabase.from("audit_log").insert({
    restaurant_id: event.restaurant_id,
    actor_type: event.actor_type,
    actor_id: event.actor_id,
    action: event.action,
    target_table: event.target_table,
    target_id: event.target_id,
    metadata: event.metadata ?? {},
  });

  if (error) {
    throw error;
  }
}
