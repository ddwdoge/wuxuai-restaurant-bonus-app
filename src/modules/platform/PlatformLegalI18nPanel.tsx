import { useEffect, useState } from "react";
import { AlertTriangle, FileCheck2, Languages, RefreshCw } from "lucide-react";
import {
  loadPlatformRestaurantLegalI18nStatus,
  type PlatformRestaurantLegalI18nStatus,
} from "./platformAdminService";

type Props = { restaurantId: string };

const languageLabels: Record<string, string> = {
  de: "Deutsch",
  en: "Englisch",
  fr: "Französisch",
  it: "Italienisch",
  es: "Spanisch",
  zh: "Chinesisch",
  ko: "Koreanisch",
};

const jurisdictionSourceLabels: Record<string, string> = {
  organization_legal_profile: "Rechtliche Organisationsadresse",
  registered_address_branch: "Hinterlegte Geschäftsadresse",
  primary_business_branch: "Hauptstandort",
};

export function PlatformLegalI18nPanel({ restaurantId }: Props) {
  const [data, setData] = useState<PlatformRestaurantLegalI18nStatus | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    void loadPlatformRestaurantLegalI18nStatus(restaurantId)
      .then((value) => active && setData(value))
      .catch(() => active && setError("Sprach- und Rechtsraumstatus konnte nicht geladen werden."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [restaurantId, reloadKey]);

  if (loading) return <section className="platform-control-section" aria-busy="true"><p className="muted">Sprach- und Rechtsraumstatus wird geladen …</p></section>;
  if (error || !data) {
    return <section className="platform-control-section platform-legal-error" role="alert"><AlertTriangle size={20} /><p>{error}</p><button className="button secondary" onClick={() => setReloadKey((value) => value + 1)} type="button"><RefreshCw size={18} />Erneut versuchen</button></section>;
  }

  const jurisdictionAvailable = data.legal_jurisdiction_status === "available";

  return (
    <section className="platform-control-section" aria-labelledby="platform-legal-i18n-title">
      <div className="platform-section-title">
        <div><h3 id="platform-legal-i18n-title">Sprache &amp; Rechtsraum</h3><p className="muted">Nur Ansicht. Die UI-Sprache bestimmt niemals den Rechtsraum.</p></div>
        <Languages aria-hidden="true" size={21} />
      </div>
      <dl className="platform-detail-list">
        <div><dt>Bevorzugte Betriebssprache</dt><dd>{data.preferred_language ? languageLabels[data.preferred_language] ?? data.preferred_language : "Nicht festgelegt"}</dd></div>
        <div><dt>Geschäftsland</dt><dd>{data.business_country ?? "Nicht verfügbar"}</dd></div>
        <div><dt>Rechtsraum</dt><dd>{jurisdictionAvailable ? data.legal_jurisdiction : "RECHTSINHALT NICHT VERFÜGBAR"}</dd></div>
        <div><dt>Quelle des Rechtsraums</dt><dd>{data.legal_jurisdiction_source ? jurisdictionSourceLabels[data.legal_jurisdiction_source] ?? "Nicht verfügbar" : "Nicht verfügbar"}</dd></div>
        <div><dt>Rechtliche Prüfung</dt><dd>{data.legal_review_status ?? "Nicht verfügbar"}</dd></div>
      </dl>
      <div className="platform-legal-documents">
        <div className="section-heading"><h4>Veröffentlichte Dokumentstände</h4><p className="muted">Version, Sprache, Rechtsraum und Annahmen bleiben getrennt nachvollziehbar.</p></div>
        {data.published_documents.length ? data.published_documents.map((document) => (
          <article key={`${document.document_type}-${document.version}`}>
            <FileCheck2 aria-hidden="true" size={19} />
            <div><strong>{document.document_type}</strong><span>Version {document.version} · {document.language} · {document.legal_country ?? "Rechtsraum fehlt"}</span></div>
            <small>{document.acceptance_count} Annahmen</small>
          </article>
        )) : <p className="muted">Keine veröffentlichten Dokumentstände verfügbar.</p>}
      </div>
    </section>
  );
}
