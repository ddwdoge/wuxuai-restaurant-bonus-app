import { useEffect, useState } from "react";
import { CircleAlert, Info, ShieldCheck } from "lucide-react";
import { useI18n } from "../../shared/i18n/I18nProvider";
import { acceptKassaSeparation, loadKassaComplianceStatus } from "./kassaComplianceService";

export function KassaAcknowledgementGate({ restaurantId, children }: { restaurantId: string; children: React.ReactNode }) {
  const { language, translateKey } = useI18n();
  const [state, setState] = useState<"loading" | "accepted" | "required" | "error">("loading");
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => { let active = true; setState("loading"); loadKassaComplianceStatus(restaurantId).then((value) => { if (active) setState(value.accepted ? "accepted" : "required"); }).catch(() => { if (active) setState("error"); }); return () => { active = false; }; }, [restaurantId]);
  if (state === "accepted") return <>{children}</>;
  if (state === "loading") return <div className="auth-shell">{translateKey("owner.kassa.loading")}</div>;
  if (state === "error") return <div className="auth-shell"><CircleAlert size={28} /><h1>{translateKey("errors.kassaCheck")}</h1><p>{translateKey("errors.kassaProtected")}</p><button className="button" onClick={() => location.reload()} type="button">{translateKey("common.retry")}</button></div>;
  return <main className="auth-shell kassa-acknowledgement-gate"><ShieldCheck size={32} /><h1>{translateKey("legal.kassa.title")}</h1><p>{translateKey("legal.kassa.shortBoundary")}</p><details><summary><Info size={18} /> {translateKey("legal.kassa.readFull")}</summary><p lang="de">{translateKey("legal.kassa.body")}</p></details><label className="inline-check large-check"><input checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} type="checkbox" /><span><strong>{translateKey("legal.kassa.acknowledgement")}</strong><small>{translateKey("legal.kassa.immutable")}</small></span></label><button className="button" disabled={!confirmed || saving} onClick={async () => { setSaving(true); try { await acceptKassaSeparation(restaurantId, language); setState("accepted"); } catch { setState("error"); } finally { setSaving(false); } }} type="button">{translateKey(saving ? "owner.kassa.saving" : "owner.kassa.confirm")}</button></main>;
}
