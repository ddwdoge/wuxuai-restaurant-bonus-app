import { FormEvent, useCallback, useEffect, useState } from "react";
import { Gift, QrCode, UserPlus } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Link, useParams } from "react-router-dom";
import { getWebDeviceId } from "../../shared/lib/deviceId";
import { AppDrawer } from "../../shared/components/AppDrawer";
import { CustomerPhoneField } from "../../shared/components/CustomerPhoneField";
import { FormLabel, RequiredFieldsNote } from "../../shared/components/FormLabel";
import {
  legalCenterStateFromResponse,
  loadPublicLegalCenter,
  type LegalCenterState,
} from "../legal/legalService";
import {
  loadPublicReferral,
  registerReferralGuest,
  type PublicReferralData,
  type ReferralRegistrationResult,
} from "../loyalty/loyaltyService";
import { saveStoredCustomerToken } from "./customerTokenStorage";
import {
  customerRegistrationCanSubmit,
  emptyCustomerRegistrationForm,
  isValidCustomerFirstName,
} from "./customerRegistration.mjs";
import { customerPhoneValidation } from "./customerIdentity.mjs";
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
  const [legalCenterState, setLegalCenterState] = useState<LegalCenterState>({ status: "loading" });
  const [registration, setRegistration] = useState<ReferralRegistrationResult | null>(null);
  const [accessPersisted, setAccessPersisted] = useState(false);
  const [form, setForm] = useState(() => ({ ...emptyCustomerRegistrationForm }));
  const [message, setMessage] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const portalUrl = registration
    ? `${window.location.origin}/customer/${restaurantSlug}?token=${encodeURIComponent(registration.customer.customer_qr_token)}`
    : "";
  const legalCenter = legalCenterState.status === "ready" ? legalCenterState.data : null;

  const reloadLegalCenter = useCallback(async () => {
    if (!restaurantSlug) {
      setLegalCenterState({ status: "error", message: "Rechtliche Informationen sind für diesen Restaurant-Link nicht verfügbar." });
      return;
    }
    setLegalCenterState({ status: "loading" });
    try {
      const nextData = await loadPublicLegalCenter(restaurantSlug);
      setLegalCenterState(legalCenterStateFromResponse(nextData));
    } catch {
      setLegalCenterState({ status: "error", message: "Rechtliche Informationen konnten gerade nicht geladen werden." });
    }
  }, [restaurantSlug]);

  useEffect(() => {
    let cancelled = false;

    loadPublicReferral(restaurantSlug, referralToken)
      .then((nextData) => {
        if (!cancelled) setData(nextData);
      })
      .catch((error) => {
        if (!cancelled) setMessage(error instanceof Error ? error.message : "Einladung nicht verfügbar.");
      });
    void reloadLegalCenter();

    return () => {
      cancelled = true;
    };
  }, [referralToken, reloadLegalCenter, restaurantSlug]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!isValidCustomerFirstName(form.firstName)) {
      setMessage("Bitte gib einen gültigen Vornamen ein.");
      return;
    }
    const phoneValidation = customerPhoneValidation(form.phoneCountryCode, form.phone);
    if (!phoneValidation.e164) {
      setMessage(phoneValidation.error ?? "Bitte gib eine gültige Telefonnummer ein.");
      return;
    }
    if (legalCenterState.status !== "ready") {
      setMessage("Teilnahmebedingungen und Datenschutzinformationen müssen vor der Registrierung verfügbar sein. Bitte versuche es erneut.");
      return;
    }
    if (!form.termsAccepted || !form.privacyAcknowledged) {
      setMessage("Bitte akzeptiere die Teilnahmebedingungen und bestätige die Datenschutzerklärung.");
      return;
    }
    setSubmitting(true);
    setMessage(null);

    try {
      const result = await registerReferralGuest({
        restaurantSlug,
        referralToken,
        firstName: form.firstName.trim(),
        phone: phoneValidation.e164,
        birthday: form.birthday || null,
        deviceId: getWebDeviceId(),
        legal: {
          termsAccepted: form.termsAccepted,
          privacyAcknowledged: form.privacyAcknowledged,
          marketingPush: form.marketingPush,
          marketingSms: form.marketingSms,
          marketingEmail: form.marketingEmail,
          birthdayProcessing: form.birthdayProcessing,
        },
      });
      setRegistration(result);
      const persisted = saveStoredCustomerToken(restaurantSlug, {
        customer_token: result.customer.customer_qr_token,
        restaurant_id: null,
        device_id: getWebDeviceId(),
      });
      setAccessPersisted(persisted);
      if (!persisted) {
        setMessage("Dein Bonuskonto wurde erstellt, konnte auf diesem Gerät aber nicht gespeichert werden. Bitte versuche das Speichern erneut.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Registrierung fehlgeschlagen.");
    } finally {
      setSubmitting(false);
    }
  }

  function retryPersistAccess() {
    const token = registration?.customer.customer_qr_token;
    if (!token) return;
    const persisted = saveStoredCustomerToken(restaurantSlug, {
      customer_token: token,
      restaurant_id: null,
      device_id: getWebDeviceId(),
    });
    setAccessPersisted(persisted);
    setMessage(persisted
      ? null
      : "Der Zugang konnte noch nicht gespeichert werden. Prüfe bitte die Browser-Einstellungen und versuche es erneut.");
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

  const legalTerms = legalCenter?.documents.find((document) => document.document_type === "participation_terms");
  const pointsValidityMonths = Number(legalTerms?.content.points_validity_months);
  const pointsValidityText = Number.isFinite(pointsValidityMonths) && pointsValidityMonths > 0
    ? `Punkte sind nach den aktuellen Teilnahmebedingungen ${pointsValidityMonths} Monate gültig.`
    : "Die Punktegültigkeit ist in den Teilnahmebedingungen beschrieben.";
  const registrationCanSubmit = customerRegistrationCanSubmit(form, legalCenterState.status === "ready");

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
            {accessPersisted ? (
              <a className="premium-button premium-button-primary" href={portalUrl}>
                Mein Bonus öffnen
              </a>
            ) : (
              <PrimaryButton onClick={retryPersistAccess}>Zugang erneut speichern</PrimaryButton>
            )}
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
              <RequiredFieldsNote />
              <div className="field">
                <FormLabel htmlFor="referral-first-name" required>Vorname</FormLabel>
                <input
                  aria-required="true"
                  autoFocus
                  className="input input-large"
                  id="referral-first-name"
                  required
                  value={form.firstName}
                  onChange={(event) => setForm((current) => ({ ...current, firstName: event.target.value }))}
                />
              </div>
              <CustomerPhoneField
                countryCode={form.phoneCountryCode}
                idPrefix="referral-phone"
                localNumber={form.phone}
                onCountryCodeChange={(phoneCountryCode) => setForm((current) => ({ ...current, phoneCountryCode }))}
                onLocalNumberChange={(phone) => setForm((current) => ({ ...current, phone }))}
                showError={Boolean(form.phone)}
                required
              />
              <div className="field">
                <FormLabel htmlFor="referral-birthday" optional>Geburtstag</FormLabel>
                <input
                  className="input input-large"
                  id="referral-birthday"
                  type="date"
                  value={form.birthday}
                  onChange={(event) => setForm((current) => ({ ...current, birthday: event.target.value }))}
                />
              </div>
              <section className="customer-registration-legal">
                <h3>Teilnahme bei {data.restaurant.name}</h3>
                <p>Das Bonusprogramm wird vom Restaurant angeboten und technisch durch WUXUAI bereitgestellt. Punkte sind nicht auszahlbar und gelten nur bei diesem Restaurant.</p>
                <p>{pointsValidityText}</p>
                <p>Der Bonus Boost gilt ausschließlich für das angezeigte Restaurant und ist nicht übertragbar.</p>
                <p><Link to={`/legal/${encodeURIComponent(restaurantSlug)}#participation_terms`}>Teilnahmebedingungen</Link> · <Link to={`/legal/${encodeURIComponent(restaurantSlug)}#privacy`}>Datenschutzerklärung</Link></p>
                {legalCenterState.status === "loading" ? <p role="status">Rechtliche Informationen werden geladen …</p> : null}
                {legalCenterState.status === "error" || legalCenterState.status === "not_configured" ? (
                  <div className="customer-legal-load-warning" role="alert">
                    <p>{legalCenterState.status === "error" ? legalCenterState.message : "Dieses Restaurant hat die erforderlichen rechtlichen Informationen noch nicht vollständig eingerichtet."}</p>
                    <button className="button secondary" onClick={() => void reloadLegalCenter()} type="button">Erneut versuchen</button>
                  </div>
                ) : null}
                <label><input aria-required="true" checked={form.termsAccepted} disabled={legalCenterState.status !== "ready"} onChange={(event) => setForm((current) => ({ ...current, termsAccepted: event.target.checked }))} required type="checkbox" /><span>Ich akzeptiere die Teilnahmebedingungen.<span aria-hidden="true" className="required-field-marker"> *</span><span className="sr-only"> Pflichtfeld</span></span></label>
                <label><input aria-required="true" checked={form.privacyAcknowledged} disabled={legalCenterState.status !== "ready"} onChange={(event) => setForm((current) => ({ ...current, privacyAcknowledged: event.target.checked }))} required type="checkbox" /><span>Ich habe die Datenschutzerklärung zur Kenntnis genommen.<span aria-hidden="true" className="required-field-marker"> *</span><span className="sr-only"> Pflichtfeld</span></span></label>
              </section>
              <section className="customer-registration-consents">
                <h3>Freiwillige Einwilligungen</h3>
                <label><input checked={form.birthdayProcessing} onChange={(event) => setForm((current) => ({ ...current, birthdayProcessing: event.target.checked }))} type="checkbox" /><span>Geburtstag freiwillig verarbeiten.</span></label>
                <label><input checked={form.marketingPush} onChange={(event) => setForm((current) => ({ ...current, marketingPush: event.target.checked }))} type="checkbox" /><span>Marketing per Push erhalten.</span></label>
                <label><input checked={form.marketingSms} onChange={(event) => setForm((current) => ({ ...current, marketingSms: event.target.checked }))} type="checkbox" /><span>Marketing per SMS erhalten.</span></label>
                <label><input checked={form.marketingEmail} onChange={(event) => setForm((current) => ({ ...current, marketingEmail: event.target.checked }))} type="checkbox" /><span>Marketing per E-Mail erhalten.</span></label>
              </section>
              <PrimaryButton disabled={submitting || !registrationCanSubmit} type="submit">
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
