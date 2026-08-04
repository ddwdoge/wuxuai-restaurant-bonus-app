import { useEffect, useRef, useState } from "react";
import { MailCheck } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../../shared/lib/supabase";
import { AppShell, ErrorState, LoadingState, PremiumCard } from "./components/PremiumCustomerUi";
import { customerAuthReturnStorageKey, safeCustomerReturnPath } from "./CustomerAuthPage";
import "./central-customer.css";

export function CustomerAuthCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (started.current || !supabase) return;
    started.current = true;
    let cancelled = false;
    async function confirm() {
      try {
        const code = searchParams.get("code");
        if (code) {
          const { error: exchangeError } = await supabase!.auth.exchangeCodeForSession(code);
          if (exchangeError) throw exchangeError;
        } else {
          const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
          const accessToken = hash.get("access_token");
          const refreshToken = hash.get("refresh_token");
          if (accessToken && refreshToken) {
            const { error: sessionError } = await supabase!.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
            if (sessionError) throw sessionError;
          }
        }
        const { data } = await supabase!.auth.getSession();
        if (!data.session?.user.email_confirmed_at) throw new Error("Bestätigung fehlt");
        const { error: profileError } = await supabase!.rpc("ensure_authenticated_customer_account");
        if (profileError) throw profileError;
        const storedReturn = window.sessionStorage.getItem(customerAuthReturnStorageKey);
        window.sessionStorage.removeItem(customerAuthReturnStorageKey);
        const returnTo = safeCustomerReturnPath(searchParams.get("returnTo") ?? storedReturn);
        window.history.replaceState({}, document.title, "/customer/auth/callback");
        if (!cancelled) navigate(returnTo, { replace: true });
      } catch {
        window.history.replaceState({}, document.title, "/customer/auth/callback");
        if (!cancelled) setError("Dieser Bestätigungslink ist ungültig oder abgelaufen.");
      }
    }
    void confirm();
    return () => { cancelled = true; };
  }, [navigate, searchParams]);

  return <AppShell className="central-auth-shell"><div className="central-auth-page"><PremiumCard className="central-auth-card central-auth-status"><MailCheck aria-hidden="true" size={30} />{error ? <ErrorState description={error} title="Konto konnte nicht bestätigt werden" /> : <LoadingState description="Dein Kundenkonto wird sicher vorbereitet." />}<Link to="/customer/login">Zur Kundenanmeldung</Link></PremiumCard></div></AppShell>;
}
