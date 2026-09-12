import { useCallback, useEffect, useRef, useState } from "react";
import { LoaderCircle, PackageCheck, RefreshCw, Square } from "lucide-react";
import { useI18n } from "../../shared/i18n/I18nProvider";
import { formatLocaleDate } from "../../shared/i18n/formatters.mjs";
import { UiDialog } from "../../shared/ui/UiDialog";
import { preparePlanOverrideRequest, type PlanOverrideRequest } from "./planOverrideRequest.mjs";
import { loadRestaurantEntitlements, submitPlatformPlanOverride, type RestaurantEntitlements } from "./platformAdminService";

type Props = { canWrite: boolean; restaurantId: string };

// A tenant change must discard the previous tenant's form and retry identity.
export function PlatformPlanEntitlementsPanel(props: Props) {
  return <PlanOverridePanel key={props.restaurantId} {...props} />;
}

function PlanOverridePanel({ canWrite, restaurantId }: Props) {
  const { language, translateKey } = useI18n();
  const t = (key: string) => translateKey("platform.planOverride." + key);
  const [data, setData] = useState<RestaurantEntitlements | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [scheduled, setScheduled] = useState(false);
  const [startsAt, setStartsAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [endTarget, setEndTarget] = useState<string | null>(null);
  const [endReason, setEndReason] = useState("");
  const [endConfirmation, setEndConfirmation] = useState("");
  const pending = useRef<PlanOverrideRequest | null>(null);
  const inFlight = useRef(false);

  const reload = useCallback(async () => {
    if (inFlight.current) return;
    setLoading(true);
    setError("");
    try { setData(await loadRestaurantEntitlements(restaurantId)); }
    catch { setError("unavailable"); }
    finally { setLoading(false); }
  }, [restaurantId]);
  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => {
    const times = [data?.effective_from, data?.effective_until, data?.override?.effective_from, data?.override?.expires_at]
      .filter((value): value is string => Boolean(value)).map(Date.parse).filter(time => time > Date.now());
    const timer = times.length ? window.setTimeout(() => void reload(), Math.min(Math.max(200, Math.min(...times) - Date.now() + 200), 2147483647)) : undefined;
    const refresh = () => { void reload(); };
    window.addEventListener("focus", refresh);
    return () => { window.clearTimeout(timer); window.removeEventListener("focus", refresh); };
  }, [data, reload]);

  async function run(action: "activate" | "end") {
    if (!canWrite || inFlight.current || !data) return;
    setError("");
    setMessage("");
    try {
      if (action === "activate" && scheduled && !startsAt) throw new Error("start");
      pending.current = preparePlanOverrideRequest({ restaurantId, action,
        reason: action === "end" ? endReason : reason,
        confirmation: action === "end" ? endConfirmation : confirmation,
        overrideId: action === "end" ? endTarget ?? undefined : undefined,
        startsAt: scheduled ? startsAt : undefined, expiresAt }, pending.current);
    } catch (validationError) {
      const errors: Record<string, string> = { expiry: "errorExpiry", start: "errorStart", reason: "errorReason", confirmation: "errorConfirmation" };
      setError(errors[validationError instanceof Error ? validationError.message : ""] ?? "failed");
      return;
    }
    inFlight.current = true;
    setSaving(true);
    try {
      const result = await submitPlatformPlanOverride(pending.current);
      if (!result?.success || !result.entitlements) throw new Error("unconfirmed");
      setData(result.entitlements);
      pending.current = null;
      setConfirmation("");
      setEndTarget(null);
      setEndConfirmation("");
      setMessage(action === "activate" ? "saved" : "ended");
    } catch (nextError) {
      const stale = typeof nextError === "object" && nextError !== null && "message" in nextError
        && String(nextError.message).includes("OVERRIDE_CHANGED_REFRESH_REQUIRED");
      setError(stale ? "changed" : "failed");
      if (stale) { pending.current = null; setEndTarget(null); }
    }
    finally { inFlight.current = false; setSaving(false); }
  }

  const date = (value: string | null | undefined) => value && Number.isFinite(Date.parse(value))
    ? formatLocaleDate(value, language, { dateStyle: "medium", timeStyle: "short" }) : t("none");
  const sourceKeys: Record<string, string> = {
    PLATFORM_ADMIN_OVERRIDE: "sourceAdmin", PAID_PLAN: "sourcePaid", TRIAL: "sourceTrial",
    PAST_DUE_GRACE: "sourceGrace", CANCELLED_PAID_PERIOD: "sourceCancelled",
    BASIC_FALLBACK: "sourceBasic", SAFETY_BLOCK: "sourceSafety",
  };
  const source = data?.entitlement_source ? sourceKeys[data.entitlement_source] : undefined;
  const canEnd = Boolean(data?.override?.plan_key && data.override.id);
  return <section className="platform-control-section platform-entitlements" data-i18n-skip="true" aria-labelledby="platform-entitlements-title" aria-busy={loading || saving}>
    <div className="platform-section-title">
      <div><h3 id="platform-entitlements-title">{t("title")}</h3><p className="muted">{t("manual")}</p></div>
      <button className="button secondary icon-button" type="button" disabled={loading || saving} onClick={() => void reload()} title={t("refresh")} aria-label={t("refresh")}>
        {loading ? <LoaderCircle size={18} aria-hidden="true" /> : <RefreshCw size={18} aria-hidden="true" />}
      </button>
    </div>
    {data ? <>
      <div className="platform-entitlement-summary">
        <dl className="platform-detail-list">
          <div><dt>{t("effective")}</dt><dd>{data.effective_plan ?? data.plan_key}</dd></div>
          <div><dt>{t("subscription")}</dt><dd>{data.stored_plan_key ?? t("unavailable")}</dd></div>
          <div><dt>{t("source")}</dt><dd>{t(source ?? "unavailable")}</dd></div>
          <div><dt>{t("start")}</dt><dd>{date(data.effective_from)}</dd></div>
          <div><dt>{t("end")}</dt><dd>{date(data.effective_until)}</dd></div>
          <div><dt>{t("offers")}</dt><dd>{data.effective.offer_limit_unlimited ? t("unlimited") : data.effective.offer_limit ?? t("unavailable")}</dd></div>
          <div><dt>{t("offerMail")}</dt><dd>{t(data.effective.offer_notifications ? "on" : "off")}</dd></div>
          <div><dt>{t("rewardMail")}</dt><dd>{t(data.effective.reward_notifications ? "on" : "off")}</dd></div>
        </dl>
        <dl className="platform-detail-list">
          <div><dt>{t("override")}</dt><dd>{data.override?.plan_key ?? t("none")}</dd></div>
          {canEnd ? <>
            <div><dt>{t("start")}</dt><dd>{date(data.override?.effective_from)}</dd></div>
            <div><dt>{t("end")}</dt><dd>{date(data.override?.expires_at)}</dd></div>
            <div><dt>{t("state")}</dt><dd>{t(data.override?.status === "VALID" ? "on" : data.override?.status === "NOT_STARTED" ? "scheduled" : data.override?.status === "EXPIRED" ? "expired" : "unavailable")}</dd></div>
          </> : null}
        </dl>
      </div>
      {canWrite ? <div className="platform-entitlement-controls platform-plan-override-controls">
        <label>{t("start")}<select disabled={saving} value={scheduled ? "scheduled" : "now"} onChange={event => setScheduled(event.target.value === "scheduled")}><option value="now">{t("now")}</option><option value="scheduled">{t("schedule")}</option></select></label>
        {scheduled ? <label>{t("schedule")}<input required type="datetime-local" disabled={saving} value={startsAt} onChange={event => setStartsAt(event.target.value)} /></label> : null}
        <label>{t("expiry")}<input required type="datetime-local" disabled={saving} value={expiresAt} onChange={event => setExpiresAt(event.target.value)} /></label>
        <label>{t("reason")}<textarea required minLength={10} rows={3} disabled={saving} value={reason} onChange={event => setReason(event.target.value)} /></label>
        <label>{t("confirmation")}<input required autoComplete="off" spellCheck={false} placeholder="CONFIRMED" disabled={saving} value={confirmation} onChange={event => setConfirmation(event.target.value)} /></label>
        <button className="button primary" disabled={saving || loading || !expiresAt || reason.trim().length < 10 || confirmation !== "CONFIRMED"} onClick={() => void run("activate")} type="button"><PackageCheck size={18} aria-hidden="true" />{t("activate")}</button>
        <button className="button secondary" disabled={saving || loading || !canEnd} onClick={() => { setEndReason(""); setEndConfirmation(""); setEndTarget(data.override?.id ?? null); }} type="button"><Square size={18} aria-hidden="true" />{t("terminate")}</button>
      </div> : <p className="muted">{t("readOnly")}</p>}
    </> : null}
    {error ? <p className="form-error" role="alert">{t(error)}</p> : null}
    {message ? <p className="success-message" role="status">{t(message)}</p> : null}
    <UiDialog open={endTarget !== null} onClose={() => { if (!saving) setEndTarget(null); }} title={t("terminate")} severity="sensitive">
      <div className="platform-entitlement-controls platform-plan-override-controls" data-i18n-skip="true">
        <p>{t("endConfirm")}</p>
        <label>{t("reason")}<textarea required minLength={10} disabled={saving} value={endReason} onChange={event => setEndReason(event.target.value)} /></label>
        <label>{t("confirmation")}<input autoComplete="off" disabled={saving} value={endConfirmation} onChange={event => setEndConfirmation(event.target.value)} /></label>
        {error ? <p role="alert" className="form-error">{t(error)}</p> : null}
        <button type="button" className="button primary" disabled={saving || endReason.trim().length < 10 || endConfirmation !== "CONFIRMED"} onClick={() => void run("end")}>{t("terminate")}</button>
      </div>
    </UiDialog>
  </section>;
}
