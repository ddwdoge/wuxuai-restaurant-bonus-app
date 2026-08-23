import { supabase } from "../../shared/lib/supabase";

export type BonusActivityType =
  | "POINT_REWARD"
  | "WELCOME_GIFT"
  | "BIRTHDAY_GIFT"
  | "REFERRAL_REWARD"
  | "PROMOTIONAL_GIFT"
  | "MANUAL_COMPENSATION";

export type SnapshotCompleteness = "complete" | "partial_legacy" | "missing_source_data";

export type BonusActivityRow = {
  id: string;
  activity_number: string;
  redeemed_at: string;
  branch_id: string | null;
  branch_name: string | null;
  customer_reference: string;
  reward_id: string | null;
  reward_type: BonusActivityType;
  reward_name_snapshot: string | null;
  reward_description_snapshot: string | null;
  points_spent: number;
  quantity: number;
  actor_role: string;
  redemption_code_reference: string | null;
  status: "ACTIVE" | "CANCELLED";
  cancelled_at: string | null;
  cancellation_reason: string | null;
  snapshot_completeness: SnapshotCompleteness;
  is_test_event: boolean;
};

export type BonusActivitySummary = {
  total: number;
  active: number;
  cancelled: number;
  points_spent: number;
  quantity: number;
  point_rewards: number;
  welcome_gifts: number;
  birthday_gifts: number;
  referral_rewards: number;
  promotional_gifts: number;
  manual_compensations: number;
  customers: number;
  complete_snapshots: number;
  incomplete_legacy_records: number;
};

export type BonusActivityReport = {
  restaurant_name: string;
  timezone: "Europe/Vienna";
  period_from: string;
  period_to: string;
  test_data_excluded: boolean;
  excluded_test_count: number;
  cancelled_included: boolean;
  summary: BonusActivitySummary;
  rows: BonusActivityRow[];
  legal_notice: string;
  legal_status: "LEGAL_REVIEW_REQUIRED";
};

export type BonusActivityFilters = {
  restaurantId: string;
  year: number;
  month: number | null;
  branchId: string | null;
  rewardType: BonusActivityType | null;
  status: "ACTIVE" | "CANCELLED" | null;
  includeTest: boolean;
};

export type RestaurantBranch = { id: string; name: string };

export type RedemptionReportPeriod =
  | "today"
  | "yesterday"
  | "this_week"
  | "last_week"
  | "this_month"
  | "last_month"
  | "this_year"
  | "custom";

export type RedemptionReportSource = "points" | "welcome" | "birthday";

export type RedemptionReportRow = {
  id: string;
  activity_number: string;
  redemption_started_at: string;
  redeemed_at: string;
  branch_id: string | null;
  branch_name: string | null;
  reward_id: string | null;
  reward_source: RedemptionReportSource;
  reward_name: string | null;
  points_spent: number;
  reference_value_cents: number | null;
  reference_currency: "EUR" | null;
  status: "redeemed" | "cancelled";
  snapshot_completeness: SnapshotCompleteness;
};

export type RedemptionReport = {
  restaurant_name: string;
  timezone: string;
  period_from: string;
  period_to: string;
  test_data_excluded: true;
  excluded_test_count: number;
  cancelled_included: boolean;
  summary: {
    total: number;
    point_rewards: number;
    welcome_gifts: number;
    birthday_gifts: number;
    points_spent: number;
    customers: number;
    reference_value_cents: number;
    reference_value_count: number;
    missing_reference_count: number;
    complete_snapshots: number;
    incomplete_legacy_records: number;
    cancelled: number;
  };
  rows: RedemptionReportRow[];
  daily_series: Array<{ date: string; count: number }>;
  monthly_series: Array<{ month: number; count: number }>;
  top_rewards: Array<{ name: string; count: number }>;
  legal_notice: string;
};

export type RedemptionReportFilters = {
  restaurantId: string;
  period: RedemptionReportPeriod;
  customFrom: string | null;
  customTo: string | null;
  branchId: string | null;
  rewardSource: RedemptionReportSource | null;
  includeCancelled: boolean;
};

function requireSupabase() {
  if (!supabase) throw new Error("Live-Daten konnten nicht geladen werden.");
  return supabase;
}

export async function loadBonusActivityReport(filters: BonusActivityFilters) {
  const client = requireSupabase();
  const { data, error } = await client.rpc("get_bonus_activity_report", {
    input_restaurant_id: filters.restaurantId,
    input_year: filters.year,
    input_month: filters.month,
    input_branch_id: filters.branchId,
    input_reward_type: filters.rewardType,
    input_status: filters.status,
    input_include_test: filters.includeTest,
  });
  if (error) throw error;
  return data as BonusActivityReport;
}

export async function loadRestaurantBranches(restaurantId: string) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("branches")
    .select("id,name")
    .eq("restaurant_id", restaurantId)
    .order("name");
  if (error) throw error;
  return (data ?? []) as RestaurantBranch[];
}

export async function loadRedemptionReport(filters: RedemptionReportFilters) {
  const client = requireSupabase();
  const { data, error } = await client.rpc("get_v1_redemption_report", {
    input_restaurant_id: filters.restaurantId,
    input_period: filters.period,
    input_custom_from: filters.customFrom,
    input_custom_to: filters.customTo,
    input_branch_id: filters.branchId,
    input_reward_source: filters.rewardSource,
    input_include_cancelled: filters.includeCancelled,
    input_limit: 250,
    input_offset: 0,
  });
  if (error) throw error;
  return data as RedemptionReport;
}

export async function cancelBonusActivity(restaurantId: string, activityId: string, reason: string) {
  const client = requireSupabase();
  const { data, error } = await client.rpc("cancel_redemption_activity", {
    input_restaurant_id: restaurantId,
    input_activity_id: activityId,
    input_reason: reason,
  });
  if (error) throw error;
  return data as { id: string; status: "CANCELLED"; activity_number: string; notice: string };
}

const activityTypeLabels: Record<BonusActivityType, string> = {
  POINT_REWARD: "Punkteeinlösung",
  WELCOME_GIFT: "Willkommensgeschenk",
  BIRTHDAY_GIFT: "Geburtstagsgeschenk",
  REFERRAL_REWARD: "Empfehlungsbonus",
  PROMOTIONAL_GIFT: "Werbegeschenk",
  MANUAL_COMPENSATION: "Manuelle Kompensation",
};

export function bonusActivityTypeLabel(type: BonusActivityType) {
  return activityTypeLabels[type];
}

export function snapshotLabel(status: SnapshotCompleteness) {
  if (status === "complete") return "Vollständig";
  if (status === "partial_legacy") return "Teilweise historische Daten";
  return "Historischer Wert nicht vorhanden";
}

function csvCell(value: unknown) {
  const normalized = value == null ? "" : String(value);
  return `"${normalized.replace(/"/g, '""')}"`;
}

export function bonusActivityRowsToCsv(report: BonusActivityReport) {
  const header = [
    "Aktivitätsnummer", "Datum", "Uhrzeit", "Filiale", "Rewardtyp",
    "Rewardname-Snapshot", "Punkte", "Menge", "Status", "Stornodatum",
    "Stornogrund", "Ausführende Rolle", "Snapshotstatus",
  ];
  const dateFormatter = new Intl.DateTimeFormat("de-AT", {
    timeZone: "Europe/Vienna", year: "numeric", month: "2-digit", day: "2-digit",
  });
  const timeFormatter = new Intl.DateTimeFormat("de-AT", {
    timeZone: "Europe/Vienna", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const rows = report.rows.map((row) => {
    const redeemedAt = new Date(row.redeemed_at);
    return [
      row.activity_number,
      dateFormatter.format(redeemedAt),
      timeFormatter.format(redeemedAt),
      row.branch_name ?? "",
      bonusActivityTypeLabel(row.reward_type),
      row.reward_name_snapshot ?? "Historischer Wert nicht vorhanden",
      row.points_spent,
      row.quantity,
      row.status === "ACTIVE" ? "Aktiv" : "Storniert",
      row.cancelled_at ? dateFormatter.format(new Date(row.cancelled_at)) : "",
      row.cancellation_reason ?? "",
      row.actor_role,
      snapshotLabel(row.snapshot_completeness),
    ].map(csvCell).join(";");
  });
  const metadata = [
    ["Testdaten ausgeschlossen", report.test_data_excluded ? "Ja" : "Nein"],
    ["Stornierte Vorgänge enthalten", report.cancelled_included ? "Ja" : "Nein"],
    ["Vollständige Snapshots", report.summary.complete_snapshots],
    ["Unvollständige historische Datensätze", report.summary.incomplete_legacy_records],
    ["Hinweis", report.legal_notice],
    ["Prüfstatus", report.legal_status],
  ].map((row) => row.map(csvCell).join(";"));
  return `\uFEFF${metadata.join("\n")}\n\n${header.map(csvCell).join(";")}\n${rows.join("\n")}`;
}

function safeFilenamePart(value: string) {
  return value.normalize("NFKD").replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || "Restaurant";
}

export function downloadBonusActivityCsv(report: BonusActivityReport, year: number, month: number | null) {
  const period = month ? `${year}-${String(month).padStart(2, "0")}` : String(year);
  const blob = new Blob([bonusActivityRowsToCsv(report)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `WUXUAI_Bonusaktivitaeten_${safeFilenamePart(report.restaurant_name)}_${period}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

const redemptionSourceLabels: Record<RedemptionReportSource, string> = {
  points: "Punkte",
  welcome: "Willkommen",
  birthday: "Geburtstag",
};

export function redemptionSourceLabel(source: RedemptionReportSource) {
  return redemptionSourceLabels[source];
}

export function redemptionReportRowsToCsv(report: RedemptionReport) {
  const dateFormatter = new Intl.DateTimeFormat("de-AT", {
    timeZone: report.timezone, year: "numeric", month: "2-digit", day: "2-digit",
  });
  const timeFormatter = new Intl.DateTimeFormat("de-AT", {
    timeZone: report.timezone, hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const header = ["Datum", "Uhrzeit", "Belohnung", "Typ", "Punkte", "Referenzwert", "Status"];
  const rows = report.rows.map((row) => {
    const timestamp = new Date(row.redeemed_at);
    const referenceValue = row.reference_value_cents == null
      ? ""
      : new Intl.NumberFormat("de-AT", { style: "currency", currency: row.reference_currency ?? "EUR" })
        .format(row.reference_value_cents / 100);
    return [
      dateFormatter.format(timestamp), timeFormatter.format(timestamp),
      row.reward_name ?? "Historischer Wert nicht vorhanden",
      redemptionSourceLabel(row.reward_source), row.points_spent || "", referenceValue,
      row.status === "redeemed" ? "Eingelöst" : "Storniert",
    ].map(csvCell).join(";");
  });
  const metadata = [
    ["Restaurant", report.restaurant_name],
    ["Zeitzone", report.timezone],
    ["Testdaten ausgeschlossen", "Ja"],
    ["Ausgeschlossene Testvorgänge", report.excluded_test_count],
    ["Stornierte Vorgänge enthalten", report.cancelled_included ? "Ja" : "Nein"],
    ["Vollständige Snapshots", report.summary.complete_snapshots],
    ["Unvollständige historische Datensätze", report.summary.incomplete_legacy_records],
    ["Hinweis", report.legal_notice],
  ].map((row) => row.map(csvCell).join(";"));
  return `\uFEFF${metadata.join("\n")}\n\n${header.map(csvCell).join(";")}\n${rows.join("\n")}`;
}

export function downloadRedemptionReportCsv(report: RedemptionReport) {
  const from = report.period_from.slice(0, 10);
  const to = report.period_to.slice(0, 10);
  const blob = new Blob([redemptionReportRowsToCsv(report)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `WUXUAI_Einloesungen_${from}_${to}_${safeFilenamePart(report.restaurant_name)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}
