import { Link, useParams } from "react-router-dom";
import { PublicContentCard, PublicPageShell } from "../public/PublicPageComponents";

const documentTitles = {
  platform_terms: "Plattform-Nutzungsbedingungen",
  platform_privacy: "Datenschutz für Plattformnutzer",
  owner_privacy: "Datenschutzhinweise für Betreiber",
  staff_privacy: "Datenschutzhinweise für Mitarbeiter",
  cookie_tracking: "Cookie- und Tracking-Hinweise",
  platform_imprint: "Plattform-Impressum",
} as const;

export type PlatformLegalDocumentType = keyof typeof documentTitles;

export function PlatformLegalPage() {
  const { documentType = "" } = useParams<{ documentType: string }>();
  const title = documentTitles[documentType as PlatformLegalDocumentType];

  return (
    <PublicPageShell
      description="Rechtliche Informationen der WUXUAI-Plattform"
      eyebrow="WUXUAI Bonus"
      title={title ?? "Rechtliche Information"}
    >
      <PublicContentCard>
        <p role="status">
          {title
            ? "Für diesen Bereich liegt derzeit keine veröffentlichte Fassung vor. Die vorhandene Prüffassung ist nicht zur Veröffentlichung freigegeben."
            : "Dieser Dokumenttyp ist nicht verfügbar."}
        </p>
        <Link className="public-premium-secondary-link" to="/">Zur Startseite</Link>
      </PublicContentCard>
    </PublicPageShell>
  );
}
