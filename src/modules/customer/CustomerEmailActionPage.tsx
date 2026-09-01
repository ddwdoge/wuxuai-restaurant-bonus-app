import { useEffect, useState } from "react";
import { CheckCircle2, MailX, ShieldCheck } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "../../shared/lib/supabase";
import { AppShell, ErrorState, LoadingState, PremiumCard } from "./components/PremiumCustomerUi";
import "./central-customer.css";

export function CustomerEmailActionPage({ action }: { action: "confirm" | "unsubscribe" }) {
  const [searchParams] = useSearchParams();
  const [state, setState] = useState<"loading" | "success" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    const token = searchParams.get("code") ?? "";
    if (!supabase || token.length < 32) {
      setState("error");
      return;
    }
    const request = action === "confirm"
      ? supabase.rpc("confirm_customer_offer_email", { input_confirmation_token: token })
      : supabase.rpc("withdraw_customer_offer_email", { input_unsubscribe_token: token });
    void request.then(({ data, error }) => {
      if (cancelled) return;
      const result = data && typeof data === "object" ? data as Record<string, unknown> : {};
      const succeeded = action === "confirm" ? result.confirmed === true : result.withdrawn === true;
      setState(!error && succeeded ? "success" : "error");
    });
    return () => { cancelled = true; };
  }, [action, searchParams]);

  return (
    <AppShell className="central-auth-shell">
      <div className="central-customer-page central-email-action-page">
        {state === "loading" ? <LoadingState description={action === "confirm" ? "Deine Einwilligung wird bestätigt." : "Deine Abmeldung wird gespeichert."} /> : null}
        {state === "error" ? <ErrorState description="Der Link ist ungültig oder nicht mehr gültig. Deine Punkte und Mitgliedschaften bleiben unverändert." title={action === "confirm" ? "Bestätigung nicht möglich" : "Abmeldung nicht möglich"} /> : null}
        {state === "success" ? (
          <PremiumCard className="central-email-action-card" variant="success">
            {action === "confirm" ? <CheckCircle2 aria-hidden="true" size={34} /> : <MailX aria-hidden="true" size={34} />}
            <div><span><ShieldCheck aria-hidden="true" size={16} /> Sicher gespeichert</span><h1>{action === "confirm" ? "E-Mail-Einwilligung bestätigt" : "Angebots-E-Mails abgemeldet"}</h1><p>{action === "confirm" ? "Du erhältst Zusammenfassungen erst nach dieser Bestätigung und nur für das ausgewählte Lokal." : "Die Abmeldung gilt sofort für dieses Lokal. Deine Punkte und Mitgliedschaft bleiben erhalten."}</p></div>
            <Link className="premium-button premium-button-primary" to="/customer/account">Zum Konto</Link>
          </PremiumCard>
        ) : null}
      </div>
    </AppShell>
  );
}
