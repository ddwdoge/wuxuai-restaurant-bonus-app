import { useCallback, useEffect, useMemo, useState } from "react";
import { Ban, CalendarDays, Download, FileClock, Gift, Printer, RefreshCw, ShieldAlert, Users } from "lucide-react";
import { AppDrawer } from "../../shared/components/AppDrawer";
import { useAuth } from "../auth/AuthProvider";
import { useTenant } from "../tenant/TenantProvider";
import {
  cancelBonusActivity,
  downloadRedemptionReportCsv,
  loadRedemptionReport,
  loadRestaurantBranches,
  redemptionSourceLabel,
  type RedemptionReport,
  type RedemptionReportPeriod,
  type RedemptionReportRow,
  type RedemptionReportSource,
  type RestaurantBranch,
} from "./bonusActivityService";
import "./bonus-activity-reports.css";

const periodOptions: Array<{ value: RedemptionReportPeriod; label: string }> = [
  { value: "today", label: "Heute" },
  { value: "yesterday", label: "Gestern" },
  { value: "this_week", label: "Diese Woche" },
  { value: "last_week", label: "Letzte Woche" },
  { value: "this_month", label: "Dieser Monat" },
  { value: "last_month", label: "Letzter Monat" },
  { value: "this_year", label: "Dieses Jahr" },
  { value: "custom", label: "Benutzerdefiniert" },
];

const sourceOptions: Array<{ value: RedemptionReportSource; label: string }> = [
  { value: "points", label: "Punktebelohnungen" },
  { value: "welcome", label: "Willkommensgeschenke" },
  { value: "birthday", label: "Geburtstagsgeschenke" },
];

function formatReferenceValue(cents: number | null, currency: string | null = "EUR") {
  if (cents == null) return "–";
  return new Intl.NumberFormat("de-AT", { style: "currency", currency: currency ?? "EUR" }).format(cents / 100);
}

function formatReportDate(value: string, timezone: string) {
  return new Intl.DateTimeFormat("de-AT", { timeZone: timezone, day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
}

function formatReportTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat("de-AT", { timeZone: timezone, hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export function BonusActivityReportsPage() {
  const { restaurantRole } = useAuth();
  const { activeRestaurant } = useTenant();
  const [period, setPeriod] = useState<RedemptionReportPeriod>("this_month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [branchId, setBranchId] = useState("");
  const [rewardSource, setRewardSource] = useState("");
  const [includeCancelled, setIncludeCancelled] = useState(false);
  const [branches, setBranches] = useState<RestaurantBranch[]>([]);
  const [report, setReport] = useState<RedemptionReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<RedemptionReportRow | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  const canViewReports = restaurantRole === "owner" || restaurantRole === "admin";
  const restaurantId = activeRestaurant?.id ?? null;
  const customPeriodComplete = period !== "custom" || Boolean(customFrom && customTo);

  const loadReport = useCallback(async () => {
    if (!restaurantId || !canViewReports || !customPeriodComplete) return;
    setLoading(true);
    setError(null);
    try {
      setReport(await loadRedemptionReport({
        restaurantId,
        period,
        customFrom: period === "custom" ? customFrom : null,
        customTo: period === "custom" ? customTo : null,
        branchId: branchId || null,
        rewardSource: (rewardSource || null) as RedemptionReportSource | null,
        includeCancelled: period === "this_year" ? false : includeCancelled,
      }));
    } catch {
      setReport(null);
      setError("Einlösungsbericht konnte nicht geladen werden. Bitte versuche es erneut.");
    } finally {
      setLoading(false);
    }
  }, [branchId, canViewReports, customFrom, customPeriodComplete, customTo, includeCancelled, period, restaurantId, rewardSource]);

  useEffect(() => {
    if (!restaurantId || !canViewReports) return;
    loadRestaurantBranches(restaurantId).then(setBranches).catch(() => setBranches([]));
  }, [canViewReports, restaurantId]);

  useEffect(() => { void loadReport(); }, [loadReport]);

  const metrics = useMemo(() => report ? [
    { label: "Einlösungen", value: report.summary.total, icon: FileClock },
    { label: "Punktebelohnungen", value: report.summary.point_rewards, icon: Gift },
    { label: "Willkommensgeschenke", value: report.summary.welcome_gifts, icon: CalendarDays },
    { label: "Geburtstagsgeschenke", value: report.summary.birthday_gifts, icon: Gift },
    { label: "Verbrauchte Punkte", value: report.summary.points_spent, icon: Gift },
    { label: "Einlösende Gäste", value: report.summary.customers, icon: Users },
  ] : [], [report]);

  async function confirmCancellation() {
    if (!restaurantId || !cancelTarget || cancelling || cancelReason.trim().length < 10) return;
    setCancelling(true);
    try {
      await cancelBonusActivity(restaurantId, cancelTarget.id, cancelReason);
      setCancelTarget(null);
      setCancelReason("");
      await loadReport();
    } catch {
      setError("Das Protokoll konnte nicht storniert werden. Bitte versuche es erneut.");
    } finally {
      setCancelling(false);
    }
  }

  if (!canViewReports) {
    return <section className="card bonus-report-access-denied"><ShieldAlert aria-hidden="true" size={28} /><h1>Berichte sind nicht verfügbar</h1><p>Nur Restaurant-Owner und Administratoren dürfen Einlösungsberichte öffnen.</p></section>;
  }

  return (
    <div className="bonus-reports-page">
      <header className="bonus-reports-header">
        <div><span className="premium-dashboard-kicker">Bonusprogramm</span><h1>Einlösungen</h1><p>Tägliche, wöchentliche, monatliche und jährliche Übersicht.</p></div>
        <div className="bonus-report-actions">
          <button className="button secondary" disabled={!report?.rows.length} onClick={() => report && downloadRedemptionReportCsv(report)} type="button"><Download aria-hidden="true" size={18} /> CSV</button>
          <button className="button secondary" disabled={!report} onClick={() => window.print()} type="button"><Printer aria-hidden="true" size={18} /> Drucken / PDF</button>
        </div>
      </header>

      <section className="bonus-legal-boundary" role="note"><ShieldAlert aria-hidden="true" size={21} /><div><strong>Bonus- und Geschenkbericht</strong><p>{report?.legal_notice ?? "Dieser Bericht dokumentiert Bonus- und Geschenk-Einlösungen innerhalb von WUXUAI. Er ersetzt keine gesetzlich vorgeschriebene Kassen-, Rechnungs- oder Steuerdokumentation."}</p></div></section>

      <section aria-label="Berichtsfilter" className="card bonus-report-filters">
        <label><span>Zeitraum</span><select value={period} onChange={(event) => setPeriod(event.target.value as RedemptionReportPeriod)}>{periodOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        {period === "custom" ? <><label><span>Von</span><input max={customTo || undefined} onChange={(event) => setCustomFrom(event.target.value)} type="date" value={customFrom} /></label><label><span>Bis</span><input min={customFrom || undefined} onChange={(event) => setCustomTo(event.target.value)} type="date" value={customTo} /></label></> : null}
        <label><span>Lokal</span><select value={branchId} onChange={(event) => setBranchId(event.target.value)}><option value="">Aktuelles Restaurant</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
        <label><span>Art</span><select value={rewardSource} onChange={(event) => setRewardSource(event.target.value)}><option value="">Alle Einlösungen</option>{sourceOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <label className="bonus-test-filter"><input checked={period !== "this_year" && includeCancelled} disabled={period === "this_year"} onChange={(event) => setIncludeCancelled(event.target.checked)} type="checkbox" /><span><strong>Stornierte Vorgänge</strong><small>{period === "this_year" ? "In der Jahresübersicht ausgeschlossen" : "Optional anzeigen"}</small></span></label>
      </section>

      {period === "custom" && !customPeriodComplete ? <p className="bonus-report-filter-hint">Bitte wähle Beginn und Ende des Zeitraums.</p> : null}
      {loading ? <section aria-busy="true" className="bonus-report-loading"><span /><span /><span /></section> : error ? (
        <section className="card bonus-report-state" role="alert"><ShieldAlert size={28} /><h2>Bericht konnte nicht geladen werden</h2><p>{error}</p><button className="button" onClick={() => void loadReport()} type="button"><RefreshCw size={18} /> Erneut versuchen</button></section>
      ) : report ? <>
        <section aria-label="Kennzahlen" className="bonus-report-metrics">{metrics.map(({ label, value, icon: Icon }) => <article className="card" key={label}><Icon aria-hidden="true" size={21} /><span>{label}</span><strong>{value.toLocaleString("de-AT")}</strong></article>)}</section>

        <section className="card bonus-reference-summary"><div><span>Konfigurierter Referenzwert</span><strong>{report.summary.reference_value_count ? formatReferenceValue(report.summary.reference_value_cents) : "Nicht verfügbar"}</strong></div><p>Nur gespeicherte historische Referenzwerte werden summiert. Fehlende Werte werden nicht geschätzt.</p></section>

        <section className="bonus-report-breakdowns">
          <article className="card"><h2>Einlösungen pro Tag</h2>{report.daily_series.length ? <ol>{report.daily_series.map((item) => <li key={item.date}><span>{formatReportDate(item.date, report.timezone)}</span><strong>{item.count}</strong></li>)}</ol> : <p>Keine Einlösungen im Zeitraum.</p>}</article>
          <article className="card"><h2>Beliebteste Belohnungen</h2>{report.top_rewards.length ? <ol>{report.top_rewards.map((item) => <li key={item.name}><span>{item.name}</span><strong>{item.count}</strong></li>)}</ol> : <p>Keine Einlösungen im Zeitraum.</p>}</article>
        </section>

        {period === "this_year" ? <section className="card bonus-annual-overview"><h2>Jahresübersicht Bonus &amp; Einlösungen</h2><div>{report.monthly_series.map((item) => <span key={item.month}><small>{new Intl.DateTimeFormat("de-AT", { month: "short" }).format(new Date(2026, item.month - 1, 1))}</small><strong>{item.count}</strong></span>)}</div></section> : null}

        <section className="bonus-report-journal" aria-label="Einlösungsprotokoll">
          <header><div><h2>Einlösungsprotokoll</h2><p>Zeiten werden nach {report.timezone} angezeigt.</p></div><span>{report.rows.length} Einträge</span></header>
          {report.rows.length ? <div className="bonus-report-table-wrap"><table><thead><tr><th>Datum</th><th>Zeit</th><th>Belohnung</th><th>Typ</th><th>Punkte</th><th>Referenzwert</th><th>Status</th><th><span className="sr-only">Aktion</span></th></tr></thead><tbody>{report.rows.map((row) => <tr key={row.id}><td>{formatReportDate(row.redeemed_at, report.timezone)}</td><td>{formatReportTime(row.redeemed_at, report.timezone)}</td><td>{row.reward_name ?? "Historischer Wert nicht vorhanden"}</td><td>{redemptionSourceLabel(row.reward_source)}</td><td>{row.points_spent || "–"}</td><td>{formatReferenceValue(row.reference_value_cents, row.reference_currency)}</td><td><span className={`bonus-activity-status ${row.status}`}>{row.status === "redeemed" ? "Eingelöst" : "Storniert"}</span></td><td>{row.status === "redeemed" ? <button aria-label={`${row.reward_name ?? "Einlösung"} stornieren`} className="bonus-table-action" onClick={() => setCancelTarget(row)} type="button"><Ban aria-hidden="true" size={17} /></button> : null}</td></tr>)}</tbody></table></div> : <div className="card bonus-report-empty"><FileClock size={28} /><h3>Keine Einlösungen</h3><p>Für den gewählten Zeitraum wurden keine finalisierten Einlösungen gefunden.</p></div>}
        </section>

        <section className="bonus-report-quality card"><p><span>Testdaten ausgeschlossen</span><strong>Ja – standardmäßig ausgeschlossen</strong></p><p><span>Ausgeschlossene Testvorgänge</span><strong>{report.excluded_test_count}</strong></p><p><span>Stornierte Vorgänge enthalten</span><strong>{report.cancelled_included ? "Ja" : "Nein"}</strong></p><p><span>Vollständige Snapshots</span><strong>{report.summary.complete_snapshots}</strong></p><p><span>Unvollständige historische Datensätze</span><strong>{report.summary.incomplete_legacy_records}</strong></p></section>
      </> : null}

      <AppDrawer description="Bei Punkte-Präsentationen werden belastete Punkte serverseitig zurückgebucht; historische Codevorgänge bleiben ein reines Protokollstorno. Es entsteht keine Kassen- oder Steuerbuchung." footer={<><button className="button secondary" disabled={cancelling} onClick={() => setCancelTarget(null)} type="button">Abbrechen</button><button className="button" disabled={cancelling || cancelReason.trim().length < 10} onClick={() => void confirmCancellation()} type="button">{cancelling ? "Storno läuft …" : "Protokoll stornieren"}</button></>} onClose={() => setCancelTarget(null)} open={Boolean(cancelTarget)} title="Einlösung stornieren">
        <label className="field"><span>Begründung *</span><textarea aria-required="true" minLength={10} onChange={(event) => setCancelReason(event.target.value)} placeholder="Mindestens 10 Zeichen" rows={4} value={cancelReason} /></label>
      </AppDrawer>
    </div>
  );
}
