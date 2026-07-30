import { FormEvent, useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "./AuthProvider";
import { registerRestaurantOwner } from "./registerOwnerService";
import {
  PublicContentCard,
  PublicFormField,
  PublicPageShell,
  PublicPrimaryButton,
} from "../public/PublicPageComponents";
import { RequiredFieldsNote } from "../../shared/components/FormLabel";

export function RegisterPage() {
  const navigate = useNavigate();
  const { loading: authLoading, user } = useAuth();
  const [ownerName, setOwnerName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [restaurantName, setRestaurantName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && user) {
      navigate("/admin", { replace: true });
    }
  }, [authLoading, navigate, user]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (authLoading || user) {
      navigate("/admin", { replace: true });
      return;
    }
    setError(null);
    setMessage(null);
    setLoading(true);

    try {
      const result = await registerRestaurantOwner({
        ownerName,
        email,
        password,
        restaurantName,
        phone,
      });

      if (result.requiresEmailConfirmation) {
        setMessage("Bitte bestätige deine E-Mail und melde dich danach an.");
        return;
      }

      window.location.assign("/admin/onboarding");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Registrierung fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  }

  if (authLoading || user) {
    return (
      <PublicPageShell description="Dein Restaurantbereich wird vorbereitet." eyebrow="WUXUAI Bonus" title="Restaurant Portal wird geöffnet …">
        <PublicContentCard><p className="public-premium-alert" role="status">Bitte einen Moment warten.</p></PublicContentCard>
      </PublicPageShell>
    );
  }

  return (
    <PublicPageShell
      description="Richte dein Bonusprogramm in wenigen Minuten ein. Kein Zahlungsmittel erforderlich."
      eyebrow="30 Tage kostenlos"
      title="Restaurant starten"
    >
      <PublicContentCard>
        <form className="public-premium-form" onSubmit={handleSubmit}>
          <RequiredFieldsNote />
          <PublicFormField autoComplete="name" disabled={loading} id="owner-name" label="Dein Name" onChange={(event) => setOwnerName(event.target.value)} required value={ownerName} />
          <PublicFormField autoComplete="email" disabled={loading} id="register-email" label="E-Mail" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
          <PublicFormField autoComplete="new-password" disabled={loading} hint="Mindestens 8 Zeichen" id="register-password" label="Passwort" minLength={8} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
          <PublicFormField autoComplete="organization" disabled={loading} id="restaurant-name" label="Restaurantname" onChange={(event) => setRestaurantName(event.target.value)} required value={restaurantName} />
          <PublicFormField autoComplete="tel" disabled={loading} id="phone" label="Telefon" onChange={(event) => setPhone(event.target.value)} optional type="tel" value={phone} />

          {message ? <p className="public-premium-alert public-premium-alert-success" role="status" aria-live="polite">{message}</p> : null}
          {error ? <p className="public-premium-alert public-premium-alert-error" role="alert" aria-live="assertive">{error}</p> : null}

          <PublicPrimaryButton icon={<Sparkles size={18} />} loading={loading} loadingLabel="Restaurant wird gestartet …" type="submit">
            30 Tage kostenlos starten
          </PublicPrimaryButton>
          <p className="public-premium-trust-note">Kein Zahlungsmittel erforderlich.</p>
          <div className="public-premium-secondary-actions">
            <span>Bereits registriert?</span>
            <Link className="public-premium-secondary-link" to="/login">Zum Login</Link>
          </div>
        </form>
      </PublicContentCard>
    </PublicPageShell>
  );
}
