import { FormEvent, useEffect, useState } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./AuthProvider";
import { registerRestaurantOwner } from "./registerOwnerService";

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
    return <main className="auth-shell">Restaurant Portal wird geöffnet...</main>;
  }

  return (
    <main className="auth-shell">
      <section className="card">
        <div className="page-header">
          <div>
            <span className="pill">30 Tage kostenlos</span>
            <h1>Restaurant starten</h1>
            <p className="muted">Kein Zahlungsmittel nötig. Dein Bonusprogramm ist danach bereit zur Einrichtung.</p>
          </div>
        </div>

        <form className="form" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="owner-name">Dein Name</label>
            <input
              className="input"
              id="owner-name"
              required
              value={ownerName}
              onChange={(event) => setOwnerName(event.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="email">E-Mail</label>
            <input
              className="input"
              id="email"
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="password">Passwort</label>
            <input
              className="input"
              id="password"
              minLength={8}
              required
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="restaurant-name">Restaurant Name</label>
            <input
              className="input"
              id="restaurant-name"
              required
              value={restaurantName}
              onChange={(event) => setRestaurantName(event.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="phone">Telefon optional</label>
            <input
              className="input"
              id="phone"
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          </div>

          {message ? <p className="muted">{message}</p> : null}
          {error ? <p className="muted">{error}</p> : null}

          <button className="button" disabled={loading} type="submit">
            <Sparkles size={18} />
            {loading ? "Wird gestartet..." : "30 Tage kostenlos starten"}
            <ArrowRight size={18} />
          </button>
        </form>
      </section>
    </main>
  );
}
