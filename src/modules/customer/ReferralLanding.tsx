import { FormEvent, useEffect, useState } from "react";
import { Gift, Info, QrCode, UserPlus, X } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useParams } from "react-router-dom";
import { getWebDeviceId } from "../../shared/lib/deviceId";
import {
  loadPublicReferral,
  registerReferralGuest,
  type PublicReferralData,
  type ReferralRegistrationResult,
} from "../loyalty/loyaltyService";
import { saveStoredCustomerToken } from "./customerTokenStorage";

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
      <main className="customer-shell">
        <section className="customer-card">
          <p className="muted">{message ?? "Einladung lädt."}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="customer-shell" style={{ fontFamily: data.branding.font_family }}>
      <section className="customer-card guest-flow-card">
        <header className="customer-brand-header restaurant-brand-header">
          <span className="restaurant-logo-frame">
            {data.branding.logo_url ? (
              <img alt={`${data.restaurant.name} Logo`} className="customer-logo restaurant-logo-image" src={data.branding.logo_url} />
            ) : (
              <span className="restaurant-logo-placeholder" style={{ background: data.branding.primary_color }}>
                {(data.restaurant.name.trim().charAt(0) || "W").toUpperCase()}
              </span>
            )}
          </span>
          <div className="restaurant-brand-copy">
            <h1 className="restaurant-brand-title">{data.restaurant.name}</h1>
            <p className="restaurant-brand-subtitle">Einladung von {data.referrer.first_name}</p>
          </div>
          <button
            aria-label="So funktioniert's öffnen"
            className="icon-button customer-info-button"
            onClick={() => setInfoOpen(true)}
            type="button"
          >
            <Info size={22} />
          </button>
        </header>

        {infoOpen ? (
          <div className="modal-backdrop customer-info-backdrop" onClick={() => setInfoOpen(false)} role="presentation">
            <section
              aria-labelledby="referral-info-title"
              aria-modal="true"
              className="how-modal customer-info-modal"
              onClick={(event) => event.stopPropagation()}
              role="dialog"
            >
              <div className="modal-header">
                <h2 id="referral-info-title">So funktioniert's</h2>
                <button
                  aria-label="So funktioniert's schließen"
                  className="icon-button customer-info-button"
                  onClick={() => setInfoOpen(false)}
                  type="button"
                >
                  <X size={22} />
                </button>
              </div>
              <div className="rule-list">
                <p className="muted">{data.restaurant.name} wurde über deinen Einladungslink automatisch erkannt.</p>
                <p className="muted">Der Bonus Boost startet erst, wenn du im Restaurant erstmals Punkte sammelst.</p>
                <p className="muted">
                  Danach sammelt ihr beide {data.settings.referral_boost_multiplier}× Punkte für {data.settings.referral_boost_duration_days} Tage.
                </p>
              </div>
              <button className="button customer-primary-button" onClick={() => setInfoOpen(false)} type="button">
                Schließen
              </button>
            </section>
          </div>
        ) : null}

        {registration ? (
          <article className="customer-hero-card">
            <span className="pill">Fertig</span>
            <h2>Willkommen, {registration.customer.name}</h2>
            <p className="muted">Dein Bonus ist bereit. Der Boost startet, sobald du erstmals Punkte sammelst.</p>
            <div className="qr-box qr-box-large" aria-label="Persönlicher QR-Code">
              <QRCodeSVG value={portalUrl} size={220} level="M" />
              <p className="muted">
                <QrCode size={16} /> {registration.customer.customer_code}
              </p>
            </div>
            <a className="button customer-primary-button" href={portalUrl}>
              Mein Bonus öffnen
            </a>
          </article>
        ) : (
          <>
            <article className="customer-hero-card">
              <span className="pill">
                <Gift size={16} /> Bonus Boost
              </span>
              <h2>{data.settings.referral_boost_multiplier}× Punkte für euch beide</h2>
              <p className="muted">
                Wenn du Mitglied wirst und erstmals Punkte sammelst, bekommt ihr beide Bonus Boost für {data.settings.referral_boost_duration_days} Tage.
              </p>
            </article>

            <form className="form compact-customer-form" onSubmit={handleSubmit}>
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
              <button className="button customer-primary-button" disabled={submitting} type="submit">
                <UserPlus size={20} />
                Mitglied werden
              </button>
            </form>
          </>
        )}

        {message ? <p className="status-message">{message}</p> : null}
      </section>
    </main>
  );
}
