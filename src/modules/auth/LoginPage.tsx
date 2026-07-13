import { FormEvent, useState } from "react";
import { LogIn } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./AuthProvider";
import { completePendingOwnerRegistration } from "./registerOwnerService";
import { liveDataUnavailableMessage, supabase } from "../../shared/lib/supabase";

export function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const liveDataMissing = !supabase;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await signIn(email, password);
      const completedPendingRegistration = await completePendingOwnerRegistration(email);
      if (completedPendingRegistration) {
        window.location.assign("/admin/onboarding");
        return;
      }
      navigate("/admin");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Login fehlgeschlagen.");
    }
  }

  return (
    <main className="auth-shell">
      <section className="card">
        <div className="page-header">
          <div>
            <h1>Restaurant Login</h1>
            <p className="muted">
              {liveDataMissing ? liveDataUnavailableMessage : "Für Besitzer und Manager."}
            </p>
          </div>
        </div>
        <form className="form" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="email">E-Mail</label>
            <input
              className="input"
              id="email"
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
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          {error ? <p className="muted">{error}</p> : null}
          <button className="button" disabled={liveDataMissing} type="submit">
            <LogIn size={18} />
            Anmelden
          </button>
        </form>
      </section>
    </main>
  );
}
