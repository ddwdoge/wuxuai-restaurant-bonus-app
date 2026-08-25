import { FormEvent, useEffect, useState } from "react";
import { LogIn, ShieldCheck } from "lucide-react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { RequiredFieldsNote } from "../../shared/components/FormLabel";
import { liveDataUnavailableMessage, supabase } from "../../shared/lib/supabase";
import {
  PublicContentCard,
  PublicFormField,
  PublicPageShell,
  PublicPrimaryButton,
} from "../public/PublicPageComponents";
import { useAuth } from "./AuthProvider";
import { normalizeStaffRestaurantSlug } from "./staffLoginFlow.mjs";
import { loadPublicStaffLoginContext, resolveMyStaffRestaurantAccess } from "./staffLoginService";
import { WrongPortalNotice } from "./WrongPortalNotice";

export function StaffLoginPage() {
  const { loading: authLoading, signIn, signOut, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const restaurantSlug = normalizeStaffRestaurantSlug(searchParams.get("restaurant"));
  const [restaurantName, setRestaurantName] = useState<string | null>(null);
  const [contextLoading, setContextLoading] = useState(Boolean(restaurantSlug));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const readyMessage = typeof (location.state as { logoutMessage?: unknown } | null)?.logoutMessage === "string"
    ? (location.state as { logoutMessage: string }).logoutMessage
    : null;

  useEffect(() => {
    let cancelled = false;
    if (!restaurantSlug) {
      setContextLoading(false);
      setError("Dieser Mitarbeiter-QR ist ungültig. Bitte scanne den QR-Code deines Restaurants erneut.");
      return () => { cancelled = true; };
    }
    setContextLoading(true);
    loadPublicStaffLoginContext(restaurantSlug)
      .then((context) => {
        if (cancelled) return;
        if (!context.available || context.restaurant_slug !== restaurantSlug) {
          setError("Dieser Mitarbeiterzugang ist nicht verfügbar.");
          return;
        }
        setRestaurantName(context.restaurant_name ?? null);
      })
      .catch((caught) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Der Mitarbeiterzugang konnte gerade nicht geladen werden.");
      })
      .finally(() => {
        if (!cancelled) setContextLoading(false);
      });
    return () => { cancelled = true; };
  }, [restaurantSlug]);

  useEffect(() => {
    let cancelled = false;
    if (authLoading || !user || !restaurantSlug || contextLoading) return () => { cancelled = true; };
    setSubmitting(true);
    resolveMyStaffRestaurantAccess(restaurantSlug)
      .then((access) => {
        if (cancelled) return;
        if (access.success && access.restaurant_slug === restaurantSlug) {
          navigate(`/staff/${restaurantSlug}`, { replace: true });
          return;
        }
        setAccessDenied(true);
        setError("Dieses Konto besitzt keinen aktiven Zugang zum Mitarbeiterbereich dieses Restaurants.");
      })
      .catch((caught) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Der Mitarbeiterzugang konnte gerade nicht geprüft werden.");
      })
      .finally(() => {
        if (!cancelled) setSubmitting(false);
      });
    return () => { cancelled = true; };
  }, [authLoading, contextLoading, navigate, restaurantSlug, user]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!restaurantSlug || !restaurantName) return;
    setSubmitting(true);
    setError(null);
    setAccessDenied(false);
    try {
      await signIn(email, password);
      const access = await resolveMyStaffRestaurantAccess(restaurantSlug);
      if (!access.success || access.restaurant_slug !== restaurantSlug) {
        setAccessDenied(true);
        setError("Dieses Konto besitzt keinen aktiven Zugang zum Mitarbeiterbereich dieses Restaurants.");
        return;
      }
      navigate(`/staff/${restaurantSlug}`, { replace: true });
    } catch (caught) {
      if (caught instanceof Error && caught.name === "EmailConfirmationRequiredError") {
        setError("Bitte bestätige zuerst deine E-Mail-Adresse.");
      } else {
        setError(caught instanceof Error ? caught.message : "Anmeldung fehlgeschlagen.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function switchAccount() {
    setSubmitting(true);
    try {
      await signOut();
      setError(null);
    } catch {
      setError("Der Kontowechsel ist gerade nicht möglich.");
    } finally {
      setSubmitting(false);
    }
  }

  const unavailable = !supabase || contextLoading || !restaurantSlug || !restaurantName;

  if (user && accessDenied) {
    return (
      <WrongPortalNotice
        description="Dieses Konto hat keinen Mitarbeiterzugang zu diesem Restaurant."
        portal="staff"
        staffSlug={restaurantSlug}
      />
    );
  }

  return (
    <PublicPageShell
      description="Mit deinem persönlichen Konto anmelden."
      eyebrow={restaurantName ?? "WUXUAI Bonus"}
      title="Mitarbeiterbereich"
    >
      <PublicContentCard>
        <div className="public-premium-status-icon" aria-hidden="true"><ShieldCheck size={28} /></div>
        {user ? (
          <div className="public-premium-form">
            <p className="public-premium-alert" role="status">Dein Mitarbeiterzugang wird für dieses Restaurant geprüft.</p>
            {error ? <p className="public-premium-alert public-premium-alert-error" role="alert">{error}</p> : null}
            {error ? <button className="public-premium-primary-button" disabled={submitting} onClick={() => void switchAccount()} type="button">Anderes Konto verwenden</button> : null}
          </div>
        ) : (
          <form className="public-premium-form" onSubmit={handleSubmit}>
            <RequiredFieldsNote />
            {readyMessage ? <p className="public-premium-alert public-premium-alert-success" role="status">{readyMessage}</p> : null}
            {!supabase ? <p className="public-premium-alert public-premium-alert-error" role="alert">{liveDataUnavailableMessage}</p> : null}
            <PublicFormField autoComplete="email" disabled={submitting} id="staff-login-email" label="E-Mail" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
            <PublicFormField autoComplete="current-password" disabled={submitting} id="staff-login-password" label="Passwort" onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
            {error ? <p className="public-premium-alert public-premium-alert-error" role="alert" aria-live="assertive">{error}</p> : null}
            <PublicPrimaryButton disabled={unavailable} icon={<LogIn size={18} />} loading={submitting} loadingLabel="Anmeldung läuft …" type="submit">Anmelden</PublicPrimaryButton>
          </form>
        )}
      </PublicContentCard>
    </PublicPageShell>
  );
}
