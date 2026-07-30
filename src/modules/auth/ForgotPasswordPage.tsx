import { FormEvent, useState } from "react";
import { Send } from "lucide-react";
import { Link } from "react-router-dom";
import { RequiredFieldsNote } from "../../shared/components/FormLabel";
import {
  PublicContentCard,
  PublicFormField,
  PublicPageShell,
  PublicPrimaryButton,
} from "../public/PublicPageComponents";
import { requestOwnerPasswordReset } from "./ownerAuthService";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await requestOwnerPasswordReset(email);
      setSubmitted(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Der Reset-Link konnte gerade nicht angefordert werden.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <PublicPageShell
      description="Wir senden dir einen sicheren Link, mit dem du ein neues Passwort festlegen kannst."
      eyebrow="Restaurant Login"
      title="Passwort zurücksetzen"
    >
      <PublicContentCard>
        <form className="public-premium-form" onSubmit={handleSubmit}>
          <RequiredFieldsNote />
          <PublicFormField
            autoComplete="email"
            disabled={loading || submitted}
            id="forgot-password-email"
            label="E-Mail-Adresse"
            onChange={(event) => setEmail(event.target.value)}
            required
            type="email"
            value={email}
          />
          {submitted ? (
            <p className="public-premium-alert public-premium-alert-success" role="status">
              Falls ein Konto mit dieser E-Mail-Adresse existiert, wurde ein Link zum Zurücksetzen des Passworts versendet.
            </p>
          ) : null}
          {error ? <p className="public-premium-alert public-premium-alert-error" role="alert">{error}</p> : null}
          <PublicPrimaryButton
            disabled={submitted || !email.trim()}
            icon={<Send size={18} />}
            loading={loading}
            loadingLabel="Reset-Link wird gesendet …"
            type="submit"
          >
            Reset-Link senden
          </PublicPrimaryButton>
          <div className="public-premium-secondary-actions">
            <Link className="public-premium-secondary-link" to="/restaurant/login">Zurück zum Login</Link>
          </div>
        </form>
      </PublicContentCard>
    </PublicPageShell>
  );
}
