import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Gift, LogIn, UserPlus } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { getWebDeviceId } from "../../shared/lib/deviceId";
import { RestaurantLogoStage } from "../../shared/components/RestaurantLogoStage";
import { useAuth } from "../auth/AuthProvider";
import {
  legalCenterStateFromResponse,
  loadPublicLegalCenter,
  type LegalCenterState,
} from "../legal/legalService";
import { loadPublicReferral, type PublicReferralData } from "../loyalty/loyaltyService";
import {
  formatInvitedReferralDuration,
  normalizeReferralBonusDuration,
  referralBonusMultiplier,
} from "../loyalty/referralBonusSettings.mjs";
import { joinCustomerReferral } from "./customerAccountService";
import { referralInvitationTitle, safeReferralFirstName } from "./referralInviteFlow.mjs";
import {
  AppShell,
  ErrorState,
  LoadingState,
  PageContainer,
  PremiumCard,
  PrimaryButton,
  SecondaryButton,
} from "./components/PremiumCustomerUi";
import "./central-customer.css";

export function ReferralLanding() {
  const { restaurantSlug = "", referralToken = "" } = useParams();
  const { loading: authLoading, portalAccess, user } = useAuth();
  const [data, setData] = useState<PublicReferralData | null>(null);
  const [legalCenterState, setLegalCenterState] = useState<LegalCenterState>({ status: "loading" });
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAcknowledged, setPrivacyAcknowledged] = useState(false);
  const [joined, setJoined] = useState(false);
  const [welcomeGiftAssigned, setWelcomeGiftAssigned] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const returnTo = `/r/${restaurantSlug}/${referralToken}`;

  const reloadLegalCenter = useCallback(async () => {
    if (!restaurantSlug) {
      setLegalCenterState({ status: "error", message: "Rechtliche Informationen sind für diese Einladung nicht verfügbar." });
      return;
    }
    setLegalCenterState({ status: "loading" });
    try {
      const nextData = await loadPublicLegalCenter(restaurantSlug);
      setLegalCenterState(legalCenterStateFromResponse(nextData));
    } catch {
      setLegalCenterState({ status: "error", message: "Rechtliche Informationen konnten gerade nicht geladen werden." });
    }
  }, [restaurantSlug]);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setMessage(null);
    loadPublicReferral(restaurantSlug, referralToken)
      .then((nextData) => {
        if (!cancelled) setData(nextData);
      })
      .catch(() => {
        if (!cancelled) setMessage("Diese Einladung ist ungültig oder nicht mehr verfügbar.");
      });
    void reloadLegalCenter();
    return () => { cancelled = true; };
  }, [referralToken, reloadLegalCenter, restaurantSlug]);

  const inviterFirstName = useMemo(() => safeReferralFirstName(data?.referrer.first_name), [data]);

  async function acceptInvitation() {
    if (submitting || legalCenterState.status !== "ready" || !termsAccepted || !privacyAcknowledged) return;
    setSubmitting(true);
    setMessage(null);
    try {
      const result = await joinCustomerReferral({
        restaurantSlug,
        referralToken,
        termsAccepted,
        privacyAcknowledged,
        deviceId: getWebDeviceId(),
      });
      setWelcomeGiftAssigned(result.welcome_gift_assigned);
      setJoined(true);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Die Einladung konnte gerade nicht angenommen werden.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!data || authLoading) {
    return (
      <AppShell>
        <PageContainer>
          {message ? <ErrorState description={message} title="Einladung nicht verfügbar" /> : <LoadingState description="Einladung wird sicher geprüft." />}
        </PageContainer>
      </AppShell>
    );
  }

  const referralDurationDays = normalizeReferralBonusDuration(data.settings.referral_boost_duration_days);
  const invitedDurationLabel = formatInvitedReferralDuration(referralDurationDays);
  const invitationTitle = referralInvitationTitle(inviterFirstName);
  const legalReady = legalCenterState.status === "ready";

  return (
    <AppShell className="central-auth-shell" fontFamily={data.branding.font_family} primaryColor={data.branding.primary_color}>
      <div className="central-auth-page referral-invite-page">
        <PremiumCard className="central-auth-card referral-invite-card">
          <div className="referral-restaurant-brand">
            <RestaurantLogoStage alt={`Logo von ${data.restaurant.name}`} logoUrl={data.branding.logo_url} name={data.restaurant.name} primaryColor={data.branding.primary_color} size="header" />
            <div><span>Einladung von {data.restaurant.name}</span><h1>{invitationTitle}</h1></div>
          </div>

          <div className="referral-benefit-summary">
            <span className="pill"><Gift aria-hidden="true" size={16} /> Bonus Boost</span>
            <h2>{referralBonusMultiplier}× Punkte für euch beide</h2>
            <p>
              {inviterFirstName ?? "Der einladende Gast"} erhält den vollen Bonuszeitraum von {referralDurationDays} Tagen.
              Du erhältst als eingeladener Freund die Hälfte der Bonusdauer. Dein {referralBonusMultiplier}× Bonus läuft {invitedDurationLabel}.
            </p>
          </div>

          {joined ? (
            <div className="referral-pending-state" role="status">
              <CheckCircle2 aria-hidden="true" size={30} />
              <h2>Einladung erfolgreich angenommen</h2>
              {welcomeGiftAssigned ? <p>Dein Willkommensgeschenk ist bereits verfügbar und wird nach deiner ersten Punktebuchung einlösbar.</p> : null}
              <p>Dein 2× Bonus wird nach deinem ersten qualifizierten Besuch aktiviert.</p>
              <Link className="premium-button premium-button-primary" to={`/customer/${encodeURIComponent(restaurantSlug)}`}>
                Meine Vorteile öffnen
              </Link>
            </div>
          ) : !user ? (
            <div className="central-auth-actions referral-auth-actions">
              <Link className="premium-button premium-button-primary" to={`/customer/register?returnTo=${encodeURIComponent(returnTo)}`}>
                <UserPlus aria-hidden="true" size={19} /> Kundenkonto erstellen
              </Link>
              <Link className="premium-button premium-button-secondary" to={`/customer/login?returnTo=${encodeURIComponent(returnTo)}`}>
                <LogIn aria-hidden="true" size={19} /> Mit bestehendem Konto anmelden
              </Link>
              <small>Die Einladung wird sicher über die E-Mail-Bestätigung hinweg erhalten.</small>
            </div>
          ) : !portalAccess.customer_access ? (
            <div className="central-auth-actions referral-auth-actions">
              <h2>Kundenbereich aktivieren</h2>
              <p>Du bist bereits mit deinem WUXUAI-Konto angemeldet. Ergänze einmalig deine Kundenangaben, um diese Einladung anzunehmen.</p>
              <Link className="premium-button premium-button-primary" to={`/customer/register?returnTo=${encodeURIComponent(returnTo)}`}>
                <UserPlus aria-hidden="true" size={19} /> Kundenbereich aktivieren
              </Link>
            </div>
          ) : (
            <div className="referral-acceptance">
              <div>
                <span>Fast geschafft</span>
                <h2>Einladung bei {data.restaurant.name} annehmen</h2>
                <p>Dein Kundenkonto ist bestätigt. Jetzt fehlen nur noch die restaurantbezogenen Pflichtbestätigungen.</p>
              </div>
              {!legalReady ? (
                <div className="customer-legal-load-warning" role="alert">
                  <p>{legalCenterState.status === "loading"
                    ? "Rechtliche Informationen werden geladen …"
                    : legalCenterState.status === "error"
                      ? legalCenterState.message
                      : "Dieses Restaurant hat die erforderlichen rechtlichen Informationen noch nicht vollständig eingerichtet."}</p>
                  {legalCenterState.status !== "loading" ? <SecondaryButton onClick={() => void reloadLegalCenter()}>Erneut versuchen</SecondaryButton> : null}
                </div>
              ) : (
                <div className="central-join-consents">
                  <p><Link to={`/legal/${encodeURIComponent(restaurantSlug)}#participation_terms`}>Teilnahmebedingungen</Link> · <Link to={`/legal/${encodeURIComponent(restaurantSlug)}#privacy`}>Datenschutzerklärung</Link></p>
                  <label><input aria-required="true" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} type="checkbox" /><span>Ich akzeptiere die Teilnahmebedingungen. *</span></label>
                  <label><input aria-required="true" checked={privacyAcknowledged} onChange={(event) => setPrivacyAcknowledged(event.target.checked)} type="checkbox" /><span>Ich habe die Datenschutzerklärung zur Kenntnis genommen. *</span></label>
                </div>
              )}
              {message ? <p className="central-status-message error" role="alert">{message}</p> : null}
              <PrimaryButton disabled={!legalReady || !termsAccepted || !privacyAcknowledged || submitting} onClick={() => void acceptInvitation()}>
                <CheckCircle2 aria-hidden="true" size={19} /> {submitting ? "Einladung wird gespeichert …" : "Einladung annehmen"}
              </PrimaryButton>
              <Link className="premium-button premium-button-secondary" to={`/customer/${encodeURIComponent(restaurantSlug)}`}>
                Einladung nicht annehmen
              </Link>
            </div>
          )}
        </PremiumCard>
      </div>
    </AppShell>
  );
}
