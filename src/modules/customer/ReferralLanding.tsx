import { FormEvent, useEffect, useState } from "react";
import { Gift, QrCode, UserPlus } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useParams } from "react-router-dom";
import { getWebDeviceId } from "../../shared/lib/deviceId";
import { AppDrawer } from "../../shared/components/AppDrawer";
import {
  loadPublicReferral,
  registerReferralGuest,
  type PublicReferralData,
  type ReferralRegistrationResult,
} from "../loyalty/loyaltyService";
import { saveStoredCustomerToken } from "./customerTokenStorage";
import {
  AppShell,
  CustomerHeader,
  ErrorState,
  LoadingState,
  PageContainer,
  PremiumCard,
  PrimaryButton,
} from "./components/PremiumCustomerUi";

export function ReferralLanding() {
  const { restaurantSlug = "", referralToken = "" } = useParams();
  const [data, setData] = useState<PublicReferralData | null>(null);
  const [registration, setRegistration] = useState<ReferralRegistrationResult | null>(null);
  const [form, setForm] = useState({ firstName: "", phone: "", birthday: "" });
  const [message, setMessage] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const portalUrl = registration
    ? `${window.location.origin}/customer/${restaurantSlug}?token=${encodeURIComponent(registration.customer.customer_qr_token)}`
    : "";

  useEffect(() => {
    let cancelled = false;

    loadPublicReferral(restaurantSlug, referralToken)
      .then((nextData) => {
        if (!cancelled) setData(nextData);
      })
      .catch((error) => {
        if (!cancelled) setMessage(error instanceof Error ? error.message : "Einladung nicht verfügbar.");
      });

    return () => {
      cancelled = true;
    };
  }, [referralToken, restaurantSlug]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!form.firstName.trim() || !form.phone.trim()) {
      setMessage("Vorname und Telefonnummer sind erforderlich.");
      return;
    }

    setSubmitting(true);
    setMessage(null);

    try {
      const result = await registerReferralGuest({
        restaurantSlug,
        referralToken,
        firstName: form.firstName.trim(),
        phone: form.phone.trim(),
        birthday: form.birthday || null,
        deviceId: getWebDeviceId(),
      });
      saveStoredCustomerToken(restaurantSlug, {
        customer_token: result.customer.customer_qr_token,
        restaurant_id: null,
        customer_name: result.customer.name,
      });
      setRegistration(result);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Registrierung fehlgeschlagen.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!data) {
    return (
      <AppShell>
        <PageContainer>
          {message ? <ErrorState description={message} title="Einladung nicht verfügbar" /> : <LoadingState description="Einladung wird geladen." />}
        </PageContainer>
      </AppShell>
    );
  }

  return (
    <AppShell fontFamily={data.branding.font_family} primaryColor={data.branding.primary_color}>
      <PageContainer>
        <CustomerHeader
          customerName={registration?.customer.name}
          logoUrl={data.branding.logo_url}
          name={data.restaurant.name}
          onInfo={() => setInfoOpen(true)}
          primaryColor={data.branding.primary_color}
          subtitle={`Einladung von ${data.referrer.first_name}`}
        />

        <AppDrawer
          footer={(
            <button className="button customer-primary-button" onClick={() => setInfoOpen(false)} type="button">
              Schließen
            </button>
          )}
          onClose={() => setInfoOpen(false)}
          open={infoOpen}
          title="So funktioniert's"
        >
          <div className="rule-list customer-info-rules">
            <p className="muted">{data.restaurant.name} wurde über deinen Einladungslink automatisch erkannt.</p>
            <p className="muted">Der Bonus Boost startet erst, wenn du im Restaurant erstmals Punkte sammelst.</p>
            <p className="muted">
              Danach sammelt ihr beide {data.settings.referral_boost_multiplier}× Punkte für {data.settings.referral_boost_duration_days} Tage.
            </p>
          </div>
        </AppDrawer>

        {registration ? (
          <PremiumCard className="customer-hero-card premium-referral-success" variant="success">
            <span className="premium-success-icon"><Gift aria-hidden="true" size={26} /></span>
            <span className="pill">Fertig</span>
            <h2>Willkommen, {registration.customer.name}</h2>
            <p className="muted">Dein Bonus ist bereit. Der Boost startet, sobald du erstmals Punkte sammelst.</p>
            <div className="premium-qr-frame" aria-label="Persönlicher QR-Code">
              <QRCodeSVG value={portalUrl} size={220} level="M" />
              <p className="muted">
                <QrCode size={16} /> {registration.customer.customer_code}
              </p>
            </div>
            <a className="premium-button premium-button-primary" href={portalUrl}>
              Mein Bonus öffnen
            </a>
          </PremiumCard>
        ) : (
          <>
            <PremiumCard className="customer-hero-card" variant="highlight">
              <span className="pill">
                <Gift size={16} /> Bonus Boost
              </span>
              <h2>{data.settings.referral_boost_multiplier}× Punkte für euch beide</h2>
              <p className="muted">
                Wenn du Mitglied wirst und erstmals Punkte sammelst, bekommt ihr beide Bonus Boost für {data.settings.referral_boost_duration_days} Tage.
              </p>
            </PremiumCard>

            <form className="form compact-customer-form premium-card" onSubmit={handleSubmit}>
              <div className="field">
                <label htmlFor="referral-first-name">Vorname</label>
                <input
                  autoFocus
                  className="input input-large"
                  id="referral-first-name"
                  value={form.firstName}
                  onChange={(event) => setForm((current) => ({ ...current, firstName: event.target.value }))}
                />
              </div>
              <div className="field">
                <label htmlFor="referral-phone">Telefonnummer</label>
                <input
                  className="input input-large"
                  id="referral-phone"
                  inputMode="tel"
                  value={form.phone}
                  onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                />
              </div>
              <div className="field">
                <label htmlFor="referral-birthday">Geburtstag optional</label>
                <input
                  className="input input-large"
                  id="referral-birthday"
                  type="date"
                  value={form.birthday}
                  onChange={(event) => setForm((current) => ({ ...current, birthday: event.target.value }))}
                />
              </div>
              <PrimaryButton disabled={submitting} type="submit">
                <UserPlus size={20} />
                Mitglied werden
              </PrimaryButton>
            </form>
          </>
        )}

        {message ? <p className="status-message">{message}</p> : null}
      </PageContainer>
    </AppShell>
  );
}
