import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, LogIn, Store, UserPlus } from "lucide-react";
import { Link } from "react-router-dom";
import { getWebDeviceId } from "../../shared/lib/deviceId";
import { useAuth } from "../auth/AuthProvider";
import { legalCenterStateFromResponse, loadPublicLegalCenter } from "../legal/legalService";
import { CustomerPortal } from "./CustomerPortal";
import { AppShell, ErrorState, LoadingState, PremiumCard, PrimaryButton, SecondaryButton } from "./components/PremiumCustomerUi";
import { joinCustomerRestaurant, loadCustomerRestaurantContext, openCustomerMembership, type CustomerRestaurantContext } from "./customerAccountService";
import { readStoredCustomerToken } from "./customerTokenStorage";
import "./central-customer.css";

export function CustomerRestaurantAccess({ isBonusCollection, restaurantSlug }: { isBonusCollection: boolean; restaurantSlug: string }) {
  const { loading: authLoading, user } = useAuth();
  const [context, setContext] = useState<CustomerRestaurantContext | null>(null);
  const [portalRestaurantSlug, setPortalRestaurantSlug] = useState<string | null>(null);
  const [legalReady, setLegalReady] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAcknowledged, setPrivacyAcknowledged] = useState(false);
  const [joining, setJoining] = useState(false);
  const [joinSuccessMessage, setJoinSuccessMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const returnTo = `${isBonusCollection ? "/w" : "/customer"}/${encodeURIComponent(restaurantSlug)}`;

  const loadContext = useCallback(async () => {
    if (!user) return;
    setError(null);
    setJoinSuccessMessage(null);
    setPortalRestaurantSlug(null);
    try {
      const nextContext = await loadCustomerRestaurantContext(restaurantSlug);
      setContext(nextContext);
      if (nextContext.membership_exists) {
        const activeSlug = await openCustomerMembership(nextContext.restaurant_id);
        setPortalRestaurantSlug(activeSlug);
      } else {
        const legal = legalCenterStateFromResponse(await loadPublicLegalCenter(restaurantSlug));
        setLegalReady(legal.status === "ready");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Dieses Restaurant konnte gerade nicht geöffnet werden.");
    }
  }, [restaurantSlug, user]);

  useEffect(() => { void loadContext(); }, [loadContext]);

  async function join() {
    if (!context || joining || !termsAccepted || !privacyAcknowledged) return;
    setJoining(true);
    setError(null);
    try {
      const result = await joinCustomerRestaurant({
        restaurantSlug,
        termsAccepted,
        privacyAcknowledged,
        deviceId: getWebDeviceId(),
        existingCustomerToken: readStoredCustomerToken(restaurantSlug),
      });
      const activeSlug = await openCustomerMembership(context.restaurant_id);
      if (result.joined) {
        setJoinSuccessMessage(`Du bist jetzt im Bonusprogramm von ${context.restaurant_name}.`);
      }
      setPortalRestaurantSlug(activeSlug);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Der Beitritt konnte gerade nicht abgeschlossen werden.");
    } finally {
      setJoining(false);
    }
  }

  if (authLoading) return <AppShell className="central-auth-shell"><div className="central-auth-page"><LoadingState description="Dein Kundenkonto wird geprüft." /></div></AppShell>;
  if (!user) return (
    <AppShell className="central-auth-shell"><div className="central-auth-page"><PremiumCard className="central-auth-card">
      <div className="central-icon-heading"><Store aria-hidden="true" size={24} /><div><span>Restaurant erkannt</span><h1>{restaurantSlug}</h1></div></div>
      <p>Melde dich mit deinem WUXUAI-Kundenkonto an. Der gescannte Restaurantkontext bleibt dabei erhalten.</p>
      <div className="central-auth-actions"><Link className="premium-button premium-button-primary" to={`/customer/login?returnTo=${encodeURIComponent(returnTo)}`}><LogIn aria-hidden="true" size={19} /> Mit bestehendem Kundenkonto anmelden</Link><Link className="premium-button premium-button-secondary" to={`/customer/register?returnTo=${encodeURIComponent(returnTo)}`}><UserPlus aria-hidden="true" size={19} /> Neues Kundenkonto erstellen</Link></div>
    </PremiumCard></div></AppShell>
  );
  if (portalRestaurantSlug) return <CustomerPortal entryMessage={joinSuccessMessage} isBonusCollection={isBonusCollection} restaurantSlug={portalRestaurantSlug} />;
  if (error && !context) return <AppShell className="central-auth-shell"><div className="central-auth-page"><ErrorState action={<SecondaryButton onClick={() => void loadContext()}>Erneut versuchen</SecondaryButton>} description={error} title="Bonusprogramm konnte nicht geöffnet werden" /></div></AppShell>;
  if (!context) return <AppShell className="central-auth-shell"><div className="central-auth-page"><LoadingState description="Das Restaurant wird geladen." /></div></AppShell>;

  return <AppShell className="central-auth-shell"><div className="central-auth-page"><PremiumCard className="central-auth-card">
    <div className="central-icon-heading"><Store aria-hidden="true" size={24} /><div><span>Neues Lokal</span><h1>{context.restaurant_name}</h1></div></div>
    <h2>Möchtest du dem Bonusprogramm von {context.restaurant_name} beitreten?</h2>
    <p>Deine Punkte und Belohnungen gelten ausschließlich für dieses Restaurant. Es wird kein zweites Kundenkonto erstellt.</p>
    {!legalReady ? <p className="central-status-message" role="alert">Dieses Restaurant hat die erforderlichen rechtlichen Dokumente noch nicht vollständig veröffentlicht.</p> : <div className="central-join-consents">
      <p><Link to={`/legal/${encodeURIComponent(restaurantSlug)}#participation_terms`}>Teilnahmebedingungen</Link> · <Link to={`/legal/${encodeURIComponent(restaurantSlug)}#privacy`}>Datenschutzerklärung</Link></p>
      <label><input aria-required="true" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} required type="checkbox" /> <span>Ich akzeptiere die Teilnahmebedingungen. *</span></label>
      <label><input aria-required="true" checked={privacyAcknowledged} onChange={(event) => setPrivacyAcknowledged(event.target.checked)} required type="checkbox" /> <span>Ich habe die Datenschutzerklärung zur Kenntnis genommen. *</span></label>
    </div>}
    {error ? <p className="central-status-message" role="alert">{error}</p> : null}
    <div className="central-auth-actions"><Link className="premium-button premium-button-secondary" to="/customer">Abbrechen</Link><PrimaryButton disabled={!legalReady || !termsAccepted || !privacyAcknowledged || joining} onClick={() => void join()}><CheckCircle2 aria-hidden="true" size={19} /> {joining ? "Beitritt wird gespeichert …" : "Bonusprogramm beitreten"}</PrimaryButton></div>
  </PremiumCard></div></AppShell>;
}
