import { liveDataUnavailableMessage, supabase } from "../../shared/lib/supabase";
import { loadCustomers } from "../loyalty/loyaltyService";
import {
  isHighSingleAmount,
  pointAnomalyActorKind,
  pointTransactionReference,
} from "./pointAnomalyPolicy.mjs";

type HighAmountAuditRow = {
  id: string;
  created_at: string;
  actor_type: string;
  customer_id: string | null;
  target_id: string | null;
  metadata: Record<string, unknown> | null;
};

type PointTransactionRow = {
  id: string;
  customer_id: string;
  amount_cents: number | null;
  points: number;
};

export type OwnerPointAnomalyWarning = {
  id: string;
  createdAt: string;
  amountCents: number;
  configuredMaximumCents: number;
  points: number;
  customerName: string;
  actorKind: "owner" | "staff";
  actorLabel: "Restaurantinhaber" | "Mitarbeiter";
  restaurantName: string;
  transactionId: string;
  transactionReference: string;
};

export async function loadOwnerPointAnomalyWarnings(
  restaurantId: string,
  restaurantName: string,
): Promise<OwnerPointAnomalyWarning[]> {
  if (!supabase) throw new Error(liveDataUnavailableMessage);

  const { data: auditData, error: auditError } = await supabase
    .from("audit_log")
    .select("id, created_at, actor_type, customer_id, target_id, metadata")
    .eq("restaurant_id", restaurantId)
    .eq("event_type", "HIGH_POINTS_AMOUNT_REVIEW")
    .order("created_at", { ascending: false })
    .limit(20);

  if (auditError) throw auditError;
  const auditRows = (auditData ?? []) as HighAmountAuditRow[];
  const transactionIds = [...new Set(auditRows.map((row) => row.target_id).filter((id): id is string => Boolean(id)))];
  if (!transactionIds.length) return [];

  const [transactionsResult, customers] = await Promise.all([
    supabase
      .from("points_transactions")
      .select("id, customer_id, amount_cents, points")
      .eq("restaurant_id", restaurantId)
      .in("id", transactionIds),
    loadCustomers(restaurantId),
  ]);

  if (transactionsResult.error) throw transactionsResult.error;
  const transactions = new Map(
    ((transactionsResult.data ?? []) as PointTransactionRow[]).map((transaction) => [transaction.id, transaction]),
  );
  const customerNames = new Map(customers.map((customer) => [customer.id, customer.name]));

  return auditRows.flatMap((auditRow) => {
    const actorKind = pointAnomalyActorKind(auditRow.actor_type);
    const transaction = auditRow.target_id ? transactions.get(auditRow.target_id) : null;
    const amountCents = Number(transaction?.amount_cents ?? auditRow.metadata?.amount_cents);
    const configuredMaximumCents = Number(auditRow.metadata?.limit_cents);

    if (!actorKind || !transaction || !isHighSingleAmount(amountCents, configuredMaximumCents)) return [];

    return [{
      id: auditRow.id,
      createdAt: auditRow.created_at,
      amountCents,
      configuredMaximumCents,
      points: Number(transaction.points) || 0,
      customerName: customerNames.get(transaction.customer_id) ?? "Gast",
      actorKind,
      actorLabel: actorKind === "owner" ? "Restaurantinhaber" : "Mitarbeiter",
      restaurantName,
      transactionId: transaction.id,
      transactionReference: pointTransactionReference(transaction.id),
    }];
  });
}
