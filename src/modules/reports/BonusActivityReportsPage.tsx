import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Ban,
  CalendarDays,
  Download,
  FileClock,
  Gift,
  Printer,
  RefreshCw,
  ShieldAlert,
  Users,
} from "lucide-react";
import { AppDrawer } from "../../shared/components/AppDrawer";
import { useAuth } from "../auth/AuthProvider";
import { useTenant } from "../tenant/TenantProvider";
import {
  bonusActivityTypeLabel,
  cancelBonusActivity,
  downloadBonusActivityCsv,
  loadBonusActivityReport,
  loadRestaurantBranches,
  snapshotLabel,
  type BonusActivityReport,
  type BonusActivityRow,
  type BonusActivityType,
  type RestaurantBranch,
} from "./bonusActivityService";
import "./bonus-activity-reports.css";

type ReportView = "month" | "year" | "journal";

const rewardTypes: BonusActivityType[] = [
  "POINT_REWARD",
  "WELCOME_GIFT",
  "BIRTHDAY_GIFT",
  "REFERRAL_REWARD",
  "PROMOTIONAL_GIFT",
  "MANUAL_COMPENSATION",
];

const legalNotice = "Dieser Bericht dokumentiert ausschließlich Aktivitäten des WUXUAI Bonusprogramms. Er ist kein Kassenbeleg, keine Registrierkasse und keine steuerliche oder buchhalterische Aufzeichnung. Die ordnungsgemäße Erfassung steuerlich, buchhalterisch oder kassentechnisch relevanter Vorgänge im eigenen Kassensystem obliegt dem Restaurantbetreiber.";

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("de-AT", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Vienna",
  }).format(new Date(value));
}

function ActivityCard({ row, onCancel }: { row: BonusActivityRow; onCancel: (row: BonusActivityRow) => void }) {
  return (
    <article className="bonus-activity-card">
      <header>
        <div>
          <span className="bonus-activity-number">{row.activity_number}</span>
          <h3>{row.reward_name_snapshot ?? "Historischer Wert nicht vorhanden"}</h3>
        </div>
        <span className={`bonus-activity-status ${row.status.toLowerCase()}`}>
          {row.status === "ACTIVE" ? "Aktiv" : "Storniert"}
        </span>
      </header>
      <dl>
        <div><dt>Zeitpunkt</dt><dd>{formatDateTime(row.redeemed_at)}</dd></div>
        <div><dt>Art</dt><dd>{bonusActivityTypeLabel(row.reward_type)}</dd></div>
        <div><dt>Punkte</dt><dd>{row.points_spent.toLocaleString("de-AT")}</dd></div>
        <div><dt>Menge</dt><dd>{row.quantity}</dd></div>
        <div><dt>Filiale</dt><dd>{row.branch_name ?? "Hauptstandort"}</dd></div>
        <div><dt>Ausgeführt durch</dt><dd>{row.actor_role === "staff" ? "Mitarbeiter" : "Restaurantadmin"}</dd></div>
      </dl>
      <footer>
        <span className={`snapshot-pill ${row.snapshot_completeness}`}>{snapshotLabel(row.snapshot_completeness)}</span>
        {row.status === "ACTIVE" ? (
          <button className="button secondary bonus-cancel-button" onClick={() => onCancel(row)} type="button">
            <Ban aria-hidden="true" size={17} /> Protokoll stornieren
          </button>
        ) : <p className="bonus-cancellation-copy">{row.cancellation_reason}</p>}
      </footer>
    </article>
  );
}

export function BonusActivityReportsPage() {
  const { restaurantRole } = useAuth();
  const { activeRestaurant } = useTenant();
  const now = new Date();
  const [view, setView] = useState<ReportView>("month");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [branchId, setBranchId] = useState<string>("");
  const [rewardType, setRewardType] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [includeTest, setIncludeTest] = useState(false);
  const [branches, setBranches] = useState<RestaurantBranch[]>([]);
  const [report, setReport] = useState<BonusActivityReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<BonusActivityRow | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  const canViewReports = restaurantRole === "owner" || restaurantRole === "admin";
  const restaurantId = activeRestaurant?.id ?? null;
  const reportMonth = view === "year" ? null : month;

  const loadReport = useCallback(async () => {
    if (!restaurantId || !canViewReports) return;
    setLoading(true);
    setError(null);
    try {
      const next = await loadBonusActivityReport({
        restaurantId,
        year,
        month: reportMonth,
        branchId: branchId || null,
        rewardType: (rewardType || null) as BonusActivityType | null,
        status: (status || null) as "ACTIVE" | "CANCELLED" | null,
        includeTest,
      });
      setReport(next);
    } catch {
      setReport(null);
      setError("Bonus-Aktivitäten konnten nicht geladen werden. Bitte versuche es erneut.");
    } finally {
      setLoading(false);
    }
  }, [branchId, canViewReports, includeTest, reportMonth, restaurantId, rewardType, status, year]);

  useEffect(() => {
    if (!restaurantId || !canViewReports) return;
    loadRestaurantBranches(restaurantId).then(setBranches).catch(() => setBranches([]));
  }, [canViewReports, restaurantId]);

  useEffect(() => { void loadReport(); }, [loadReport]);

  const metrics = useMemo(() => report ? [
    { label: "Einlösungen", value: report.summary.total, icon: FileClock },
    { label: "Verwendete Punkte", value: report.summary.points_spent, icon: Gift },
    { label: "Bonusprodukte", value: report.summary.quantity, icon: CalendarDays },
    { label: "Betroffene Gäste", value: report.summary.customers, icon: Users },
    { label: "Storniert", value: report.summary.cancelled, icon: Ban },
    { label: "Unvollständige Altdaten", value: report.summary.incomplete_legacy_records, icon: ShieldAlert },
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
    return (
      <section className="card bonus-report-access-denied">
        <ShieldAlert aria-hidden="true" size={28} />
        <h1>Berichte sind nicht verfügbar</h1>
        <p>Nur Restaurant-Owner und Administratoren dürfen vollständige Bonus-Aktivitätsberichte öffnen.</p>
      </section>
    );
  }

  return (
    <div className="bonus-reports-page">
      <header className="bonus-reports-header">
        <div>
          <span className="premium-dashboard-kicker">Internes Bonusprogramm</span>
          <h1>Berichte</h1>
          <p>Überblicke Einlösungen und Punkteaktivitäten deines Restaurants.</p>
        </div>
        <div className="bonus-report-actions">
          <button className="button secondary" disabled={!report?.rows.length} onClick={() => report && downloadBonusActivityCsv(report, year, reportMonth)} type="button">
            <Download aria-hidden="true" size={18} /> CSV
          </button>
          <button className="button secondary" disabled={!report} onClick={() => window.print()} type="button">
            <Printer aria-hidden="true" size={18} /> Drucken / PDF
          </button>
        </div>
      </header>

      <section className="bonus-legal-boundary" role="note">
        <ShieldAlert aria-hidden="true" size={21} />
        <div><strong>Bonus-Aktivitätsbericht</strong><p>{report?.legal_notice ?? legalNotice}</p><span>LEGAL_REVIEW_REQUIRED</span></div>
      </section>

      <div aria-label="Berichtsansicht" className="bonus-report-tabs" role="tablist">
        {(["month", "year", "journal"] as ReportView[]).map((item) => (
          <button aria-selected={view === item} className={view === item ? "active" : ""} key={item} onClick={() => setView(item)} role="tab" type="button">
            {item === "month" ? "Monatsübersicht" : item === "year" ? "Jahresübersicht" : "Einlösungsprotokoll"}
          </button>
        ))}
      </div>

      <section aria-label="Berichtsfilter" className="card bonus-report-filters">
        {view !== "year" ? <label><span>Monat</span><select value={month} onChange={(event) => setMonth(Number(event.target.value))}>{Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{new Intl.DateTimeFormat("de-AT", { month: "long" }).format(new Date(2026, index, 1))}</option>)}</select></label> : null}
        <label><span>Jahr</span><select value={year} onChange={(event) => setYear(Number(event.target.value))}>{Array.from({ length: 7 }, (_, index) => now.getFullYear() - 5 + index).map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <label><span>Filiale</span><select value={branchId} onChange={(event) => setBranchId(event.target.value)}><option value="">Alle Filialen</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
        <label><span>Rewardtyp</span><select value={rewardType} onChange={(event) => setRewardType(event.target.value)}><option value="">Alle Arten</option>{rewardTypes.map((type) => <option key={type} value={type}>{bonusActivityTypeLabel(type)}</option>)}</select></label>
        <label><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Aktiv und storniert</option><option value="ACTIVE">Aktiv</option><option value="CANCELLED">Storniert</option></select></label>
        <label className="bonus-test-filter"><input checked={includeTest} onChange={(event) => setIncludeTest(event.target.checked)} type="checkbox" /><span><strong>Testdaten einschließen</strong><small>Standardmäßig ausgeschlossen</small></span></label>
      </section>

      {loading ? (
        <section aria-busy="true" className="bonus-report-loading"><span /><span /><span /></section>
      ) : error ? (
        <section className="card bonus-report-state" role="alert"><ShieldAlert size={28} /><h2>Bericht konnte nicht geladen werden</h2><p>{error}</p><button className="button" onClick={() => void loadReport()} type="button"><RefreshCw size={18} /> Erneut versuchen</button></section>
      ) : report ? (
        <>
          <section aria-label="Kennzahlen" className="bonus-report-metrics">{metrics.map(({ label, value, icon: Icon }) => <article className="card" key={label}><Icon aria-hidden="true" size={21} /><span>{label}</span><strong>{value.toLocaleString("de-AT")}</strong></article>)}</section>

          <section className="bonus-report-quality card">
            <p><span>Testdaten ausgeschlossen</span><strong>{report.test_data_excluded ? "Ja" : "Nein"}</strong></p>
            <p><span>Ausgeschlossene Testvorgänge</span><strong>{report.excluded_test_count}</strong></p>
            <p><span>Stornierte Vorgänge enthalten</span><strong>{report.cancelled_included ? "Ja" : "Nein"}</strong></p>
            <p><span>Vollständige Snapshots</span><strong>{report.summary.complete_snapshots}</strong></p>
            <p><span>Unvollständige historische Datensätze</span><strong>{report.summary.incomplete_legacy_records}</strong></p>
          </section>

          <section className="bonus-report-journal" aria-label="Einlösungsprotokoll">
            <header><div><h2>{view === "year" ? "Jahresaktivitäten" : "Einlösungsprotokoll"}</h2><p>Zeiten werden nach Europe/Vienna angezeigt.</p></div><span>{report.rows.length} Einträge</span></header>
            {report.rows.length ? <div className="bonus-activity-list">{report.rows.map((row) => <ActivityCard key={row.id} row={row} onCancel={setCancelTarget} />)}</div> : <div className="card bonus-report-empty"><FileClock size={28} /><h3>Keine Bonus-Aktivitäten</h3><p>Für den gewählten Zeitraum und Filter wurden keine Einlösungen gefunden.</p></div>}
          </section>
        </>
      ) : null}

      <section className="card bonus-cash-responsibility">
        <h2>Kassenerfassung und Verantwortung</h2>
        <p>WUXUAI verwaltet Bonuspunkte und Einlösungsaktivitäten und stellt keinen Kassenbeleg aus. Das Restaurant klärt mit seiner Steuerberatung, wie Rabatte, Gratisprodukte, Gutscheine und Bonusleistungen im eigenen Kassensystem erfasst werden.</p>
        <p className="muted">DRAFT_LEGAL_REVIEW_REQUIRED</p>
      </section>

      <AppDrawer
        description="Der ursprüngliche Datensatz bleibt erhalten. Bei Punkte-Präsentationen werden belastete Punkte serverseitig zurückgebucht; historische Codevorgänge bleiben ein reines Protokollstorno. Es entsteht keine Kassen- oder Steuerbuchung."
        footer={<><button className="button secondary" disabled={cancelling} onClick={() => setCancelTarget(null)} type="button">Abbrechen</button><button className="button" disabled={cancelling || cancelReason.trim().length < 10} onClick={() => void confirmCancellation()} type="button">{cancelling ? "Storno läuft …" : "Protokoll stornieren"}</button></>}
        onClose={() => { if (!cancelling) setCancelTarget(null); }}
        open={Boolean(cancelTarget)}
        size="compact"
        title="Einlösungsaktivität stornieren"
      >
        <label className="field"><span>Verpflichtender Stornogrund</span><textarea className="input" data-drawer-autofocus onChange={(event) => setCancelReason(event.target.value)} placeholder="Grund mit mindestens 10 Zeichen" rows={5} value={cancelReason} /></label>
        <p className="bonus-drawer-reference">WUXUAI Aktivitätsnummer – keine Kassenbelegnummer<br /><strong>{cancelTarget?.activity_number}</strong></p>
      </AppDrawer>
    </div>
  );
}
