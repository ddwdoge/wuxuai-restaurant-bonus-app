import { FormEvent, useState } from "react";
import { LogIn } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "./AuthProvider";
import { completePendingOwnerRegistration } from "./registerOwnerService";
import { liveDataUnavailableMessage, supabase } from "../../shared/lib/supabase";
import {
  PublicContentCard,
  PublicFormField,
  PublicPageShell,
  PublicPrimaryButton,
} from "../public/PublicPageComponents";
import { RequiredFieldsNote } from "../../shared/components/FormLabel";
import { Link } from "react-router-dom";

export function LoginPage() {
  const { signIn } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const liveDataMissing = !supabase;
  const logoutMessage =
    typeof (location.state as { logoutMessage?: unknown } | null)?.logoutMessage === "string"
      ? (location.state as { logoutMessage: string }).logoutMessage
      : null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signIn(email, password);
      const completedPendingRegistration = await completePendingOwnerRegistration(email);
      if (completedPendingRegistration) {
        window.location.assign("/admin/onboarding");
        return;
      }
      navigate("/admin");
    } catch (caught) {
      if (caught instanceof Error && caught.name === "EmailConfirmationRequiredError") {
        navigate("/auth/confirm-email", { state: { email } });
        return;
      }
      setError(caught instanceof Error ? caught.message : "Login fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <PublicPageShell
      description="Willkommen zurück. Verwalte dein Bonusprogramm, deine Gäste und deine Punkteeinlösungen."
      eyebrow="WUXUAI Bonus"
      title="Restaurant Login"
    >
      <PublicContentCard>
        <form className="public-premium-form" onSubmit={handleSubmit}>
          <RequiredFieldsNote />
          {logoutMessage ? <p className="public-premium-alert public-premium-alert-success" role="status">{logoutMessage}</p> : null}
          {liveDataMissing ? <p className="public-premium-alert public-premium-alert-error" role="alert">{liveDataUnavailableMessage}</p> : null}
          <PublicFormField
            autoComplete="email"
            disabled={loading}
            id="login-email"
            label="E-Mail"
            onChange={(event) => setEmail(event.target.value)}
            required
            type="email"
            value={email}
          />
          <PublicFormField
            autoComplete="current-password"
            disabled={loading}
            id="login-password"
            label="Passwort"
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
          {error ? <p className="public-premium-alert public-premium-alert-error" role="alert" aria-live="assertive">{error}</p> : null}
          <PublicPrimaryButton
            disabled={liveDataMissing}
            icon={<LogIn size={18} />}
            loading={loading}
            loadingLabel="Anmeldung läuft …"
            type="submit"
          >
            Anmelden
          </PublicPrimaryButton>
          <div className="public-premium-secondary-actions">
            <Link className="public-premium-secondary-link" to="/auth/forgot-password">Passwort vergessen?</Link>
            <Link className="public-premium-secondary-link" to="/">Zurück zur Startseite</Link>
            <Link className="public-premium-secondary-link" to="/register">Noch nicht registriert?</Link>
          </div>
        </form>
      </PublicContentCard>
    </PublicPageShell>
  );
}
