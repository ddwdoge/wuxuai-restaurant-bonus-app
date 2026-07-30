import { FormEvent, useEffect, useState } from "react";
import { Gift, QrCode, UserPlus } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useParams } from "react-router-dom";
import { getWebDeviceId } from "../../shared/lib/deviceId";
import {
  loadPublicCampaign,
  registerCampaignCustomer,
  type CampaignRegistrationResult,
  type PublicCampaignData,
} from "./campaignService";

export function PublicCampaignLanding() {
  const { restaurantSlug = "", campaignSlug = "" } = useParams();
  const [data, setData] = useState<PublicCampaignData | null>(null);
  const [registration, setRegistration] = useState<CampaignRegistrationResult | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", birthday: "" });
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    loadPublicCampaign(restaurantSlug, campaignSlug)
      .then((nextData) => {
        if (!cancelled) setData(nextData);
      })
      .catch((error) => {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "Campaign nicht verfügbar.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [campaignSlug, restaurantSlug]);

  const offer = data?.coupon ?? data?.reward ?? null;
  const customerQrValue = registration
    ? `${window.location.origin}/customer/${restaurantSlug}?token=${encodeURIComponent(registration.customer.customer_qr_token)}`
    : "";

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!form.name.trim() || !form.phone.trim()) {
      setMessage("Name und Telefon sind erforderlich.");
      return;
    }

    setSubmitting(true);
    setMessage(null);

    try {
      const result = await registerCampaignCustomer({
        restaurantSlug,
        campaignSlug,
        name: form.name,
        phone: form.phone,
        birthday: form.birthday || null,
        deviceId: getWebDeviceId(),
      });
      setRegistration(result);
      setMessage(result.starter_issued ? "Willkommensgeschenk gespeichert." : "Du bist bereits registriert.");
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
          <p className="muted">{message ?? "Campaign lädt."}</p>
        </section>
      </main>
    );
  }

  return (
    <main
      className="customer-shell"
      style={{
        color: "#17202a",
        fontFamily: data.branding?.font_family ?? "Inter",
      }}
    >
      <section className="customer-card">
        <header className="page-header">
          <div>
            <h1>{data.restaurant.name}</h1>
            <p className="muted">{data.campaign.title}</p>
          </div>
          <span
            className="brand-dot"
            style={{ background: data.branding?.primary_color ?? "#0f766e" }}
            aria-hidden
          />
        </header>

        <article className="card customer-hero-card">
          <span className="pill">{data.campaign.status}</span>
          <h2>{data.campaign.description}</h2>
          {offer ? (
            <p className="muted">
              <Gift size={16} /> {offer.title}
            </p>
          ) : (
            <p className="muted">Registriere dich für deinen Kunden-QR.</p>
          )}
        </article>

        {registration ? (
          <article className="card">
            <h2>Dein QR</h2>
            <div className="qr-box qr-box-large">
              <QRCodeSVG value={customerQrValue} size={220} level="M" />
              <p className="muted">
                <QrCode size={16} /> {registration.customer.customer_code}
              </p>
            </div>
          </article>
        ) : (
          <article className="card">
            <h2>Registrieren</h2>
            <form className="form" onSubmit={handleSubmit}>
              <div className="field">
                <label htmlFor="campaign-name">Name</label>
                <input
                  className="input"
                  id="campaign-name"
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                />
              </div>
              <div className="field">
                <label htmlFor="campaign-phone">Telefon</label>
                <input
                  className="input"
                  id="campaign-phone"
                  inputMode="tel"
                  value={form.phone}
                  onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                />
              </div>
              <div className="field">
                <label htmlFor="campaign-birthday">Geburtstag optional</label>
                <input
                  className="input"
                  id="campaign-birthday"
                  type="date"
                  value={form.birthday}
                  onChange={(event) => setForm((current) => ({ ...current, birthday: event.target.value }))}
                />
              </div>
              <button className="button" disabled={submitting} type="submit">
                <UserPlus size={18} />
                Registrieren
              </button>
            </form>
          </article>
        )}

        {message ? <p className="status-message">{message}</p> : null}
      </section>
    </main>
  );
}
