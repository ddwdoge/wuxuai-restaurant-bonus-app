import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { useI18n } from "../../shared/i18n/I18nProvider";
import { loadPlatformKassaComplianceStatus, type PlatformKassaComplianceStatus } from "./platformAdminService";

export function PlatformKassaCompliancePanel({ restaurantId }: { restaurantId: string }) {
  const { translateKey } = useI18n();
  const [data, setData] = useState<PlatformKassaComplianceStatus | null>(null);
  const [error, setError] = useState(false);
  const load = () => { setError(false); loadPlatformKassaComplianceStatus(restaurantId).then(setData).catch(() => setError(true)); };
  useEffect(load, [restaurantId]);
  return <section className="platform-control-section"><div className="section-heading"><div><h3>{translateKey("platform.kassa.title")}</h3><p className="muted">{translateKey("platform.kassa.description")}</p></div><button aria-label={translateKey("platform.kassa.refresh")} className="button secondary" onClick={load} type="button"><RefreshCw size={17} /></button></div>{error ? <p role="alert"><AlertTriangle size={17} /> {translateKey("platform.kassa.unavailable")}</p> : data ? <dl className="platform-detail-list"><div><dt>{translateKey("platform.kassa.acknowledgements")}</dt><dd>{data.acknowledgement_count}</dd></div><div><dt>{translateKey("platform.kassa.open")}</dt><dd>{data.open_count}</dd></div><div><dt>{translateKey("platform.kassa.recorded")}</dt><dd>{data.recorded_count}</dd></div><div><dt>{translateKey("platform.kassa.reviewed")}</dt><dd>{data.owner_reviewed_count}</dd></div><div><dt>{translateKey("platform.kassa.lastTransition")}</dt><dd>{data.last_transition_at ? new Date(data.last_transition_at).toLocaleString() : translateKey("platform.kassa.noEvent")}</dd></div></dl> : <p>{translateKey("platform.kassa.loading")}</p>}</section>;
}
