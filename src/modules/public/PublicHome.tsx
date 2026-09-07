import { QrCode, Sparkles, Store } from "lucide-react";
import {
  PublicContentCard,
  PublicEntryCard,
  PublicPageShell,
  PublicPrimaryLink,
} from "./PublicPageComponents";
import { useI18n } from "../../shared/i18n/I18nProvider";
import { V1_COMMERCIAL_CONTRACT } from "../../shared/commercialContract.mjs";

export function PublicHome() {
  const { translateKey: t } = useI18n();
  const registrationDescription = t("public.home.registrationDescription")
    .replace("{months}", String(V1_COMMERCIAL_CONTRACT.trial.calendarMonths))
    .replace("{price}", String(V1_COMMERCIAL_CONTRACT.basePlan.monthlyPrice));
  return (
    <PublicPageShell
      description={t("public.home.description")}
      eyebrow="WUXUAI® Bonus"
      title={t("public.home.title")}
      width="entry"
    >
      <div className="public-premium-entry-grid">
        <PublicEntryCard action={t("public.home.open")} description={t("public.home.ownerDescription")} icon={Store} title={t("public.home.ownerTitle")} to="/login" />
        <PublicEntryCard action={t("public.home.startFree")} description={registrationDescription} icon={Sparkles} title={t("public.home.registrationTitle")} to="/register" />
        <PublicEntryCard action={t("public.home.open")} description={t("public.home.customerDescription")} icon={QrCode} title={t("public.home.customerTitle")} to="/customer" />
      </div>
    </PublicPageShell>
  );
}

export function GuestBonusInfoPage() {
  return (
    <PublicPageShell
      description="Scanne den QR-Code im Restaurant, um dein Bonusprogramm zu öffnen."
      eyebrow="WUXUAI Bonus"
      title="Bonus für Gäste"
    >
      <PublicContentCard className="public-premium-guest-card">
        <div className="public-premium-guest-heading">
          <span className="public-premium-guest-icon" aria-hidden="true"><QrCode size={26} /></span>
          <h2>So kommst du zu deinem Bonuskonto</h2>
        </div>
        <ol className="public-premium-steps">
          <li>QR-Code im Restaurant scannen</li>
          <li>Das richtige Restaurant wird automatisch erkannt</li>
          <li>Bonus sammeln und Punkteeinlösungen nutzen</li>
        </ol>
        <p className="public-premium-notice">Bereits Mitglied? Öffne deinen persönlichen Bonus-Link erneut.</p>
        <PublicPrimaryLink to="/">Zurück zur Startseite</PublicPrimaryLink>
      </PublicContentCard>
    </PublicPageShell>
  );
}
