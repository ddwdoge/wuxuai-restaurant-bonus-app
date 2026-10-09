import { useEffect, useRef, useState } from "react";
import { CheckCircle2, MailX, ShieldCheck } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "../../shared/lib/supabase";
import { AppShell, CustomerLanguageAction, ErrorState, LoadingState, PremiumCard } from "./components/PremiumCustomerUi";
import "./central-customer.css";

export function CustomerEmailActionPage({ action }: { action: "confirm" | "unsubscribe" }) {
  const [searchParams] = useSearchParams();
  const [state, setState] = useState<"loading" | "success" | "error">("loading");
  const inFlight = useRef<{ key: string; result: Promise<boolean> } | null>(null);
  const token = searchParams.get("code") ?? "";

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    if (!supabase || token.length < 32) {
      setState("error");
      return;
    }
    const key = `${action}:${token}`;
    if (inFlight.current?.key !== key) {
      const result = (async () => {
        const { data, error } = action === "confirm"
          ? await supabase.rpc("confirm_customer_offer_email", { input_confirmation_token: token })
          : await supabase.rpc("withdraw_customer_offer_email", { input_unsubscribe_token: token });
        const receipt = data && typeof data === "object" ? data as Record<string, unknown> : {};
        return !error && (action === "confirm" ? receipt.confirmed === true : receipt.withdrawn === true);
      })();
      inFlight.current = { key, result };
    }
    void inFlight.current.result.then((succeeded) => {
      if (cancelled) return;
      setState(succeeded ? "success" : "error");
    });
    return () => { cancelled = true; };
  }, [action, token]);

  return (
    <AppShell className="central-auth-shell">
      <div className="central-customer-page central-email-action-page">
        <div className="central-card-header-actions"><CustomerLanguageAction /></div>
        {state === "loading" ? <LoadingState description={action === "confirm" ? "Deine Einwilligung wird bestätigt." : "Deine Abmeldung wird gespeichert."} /> : null}
        {state === "error" ? <ErrorState description="Der Link ist ungültig oder nicht mehr gültig. Deine Punkte und Mitgliedschaften bleiben unverändert." title={action === "confirm" ? "Bestätigung nicht möglich" : "Abmeldung nicht möglich"} /> : null}
        {state === "success" ? (
          <PremiumCard className="central-email-action-card" variant="success">
            {action === "confirm" ? <CheckCircle2 aria-hidden="true" size={34} /> : <MailX aria-hidden="true" size={34} />}
            <div><span><ShieldCheck aria-hidden="true" size={16} /> Sicher gespeichert</span><h1>{action === "confirm" ? "E-Mail-Einwilligung bestätigt" : "Angebots-E-Mails abgemeldet"}</h1><p>{action === "confirm" ? "Deine Entscheidung ist für das ausgewählte Lokal gespeichert. Ein Versand bleibt von den aktuellen Freigaben abhängig." : "Die Abmeldung gilt sofort für dieses Lokal. Deine Punkte und Mitgliedschaft bleiben erhalten."}</p></div>
            <Link className="premium-button premium-button-primary" to="/customer/account">Zum Konto</Link>
          </PremiumCard>
        ) : null}
      </div>
    </AppShell>
  );
}
