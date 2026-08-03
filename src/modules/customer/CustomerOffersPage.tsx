import { useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { AppDrawer } from "../../shared/components/AppDrawer";
import { AppShell, EmptyState, ErrorState, LoadingState } from "./components/PremiumCustomerUi";
import { RestaurantOfferCard, RestaurantOfferDetail } from "./components/RestaurantOfferCard";
import { readStoredCustomerTokens } from "./customerTokenStorage";
import { loadPartnerRestaurants } from "./partnerRestaurantService";
import {
  loadPublicRestaurantOffers,
  recordRestaurantOfferEvent,
  type RestaurantOffer,
} from "../offers/restaurantOfferService";
import "./customer-offers-page.css";

export function CustomerOffersPage() {
  const [searchParams] = useSearchParams();
  const currentSlug = searchParams.get("current");
  const [offers, setOffers] = useState<RestaurantOffer[]>([]);
  const [membershipOrder, setMembershipOrder] = useState(new Map<string, { registered: boolean; points: number }>());
  const [selected, setSelected] = useState<RestaurantOffer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadPublicRestaurantOffers(null, 100), loadPartnerRestaurants()])
      .then(([nextOffers, partners]) => {
        if (cancelled) return;
        setOffers(nextOffers);
        setMembershipOrder(new Map(partners.locations.map((location) => [location.slug, {
          registered: Boolean(location.membership?.registered),
          points: location.membership?.points_balance ?? 0,
        }])));
        nextOffers.forEach((offer) => { void recordRestaurantOfferEvent(offer.id, "OFFER_VIEWED"); });
      })
      .catch(() => { if (!cancelled) setError("Aktuelles konnte gerade nicht geladen werden."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const sortedOffers = useMemo(() => {
    const storedSlugs = new Set(Object.keys(readStoredCustomerTokens()));
    return [...offers].sort((left, right) => {
      const leftMembership = membershipOrder.get(left.restaurant_slug ?? "");
      const rightMembership = membershipOrder.get(right.restaurant_slug ?? "");
      const leftVisited = leftMembership?.registered || storedSlugs.has(left.restaurant_slug ?? "") ? 1 : 0;
      const rightVisited = rightMembership?.registered || storedSlugs.has(right.restaurant_slug ?? "") ? 1 : 0;
      if (leftVisited !== rightVisited) return rightVisited - leftVisited;
      if ((leftMembership?.points ?? 0) !== (rightMembership?.points ?? 0)) return (rightMembership?.points ?? 0) - (leftMembership?.points ?? 0);
      return new Date(right.published_at ?? right.valid_from).getTime() - new Date(left.published_at ?? left.valid_from).getTime();
    });
  }, [membershipOrder, offers]);

  function openOffer(offer: RestaurantOffer) {
    setSelected(offer);
    void recordRestaurantOfferEvent(offer.id, "OFFER_CTA_CLICKED");
  }

  return (
    <AppShell>
      <div className="customer-offers-page customer-offers-shell">
        <header className="customer-offers-header">
          <Link aria-label="Zurück" to={currentSlug ? `/customer/${encodeURIComponent(currentSlug)}` : "/customer/restaurants"}><ArrowLeft aria-hidden="true" size={20} /></Link>
          <div><span>WUXUAI Partner</span><h1>Aktuelles</h1><p>Neuigkeiten und Angebote deiner Restaurants auf einen Blick.</p></div>
        </header>
        {loading ? <LoadingState description="Aktuelles wird geladen." /> : error ? <ErrorState action={<button className="premium-button premium-button-secondary" onClick={() => window.location.reload()} type="button">Erneut versuchen</button>} description={error} title="Aktuelles nicht verfügbar" /> : sortedOffers.length ? (
          <section aria-label="Aktuelle Restaurantbeiträge" className="customer-offer-grid">{sortedOffers.map((offer) => <RestaurantOfferCard key={offer.id} offer={offer} onOpen={() => openOffer(offer)} showRestaurant />)}</section>
        ) : <EmptyState description="Sobald ein Partnerrestaurant etwas veröffentlicht, erscheint es hier." title="Noch nichts Neues" />}
      </div>
      <AppDrawer description="Information des Restaurants" onClose={() => setSelected(null)} open={Boolean(selected)} size="standard" title="Aktuelles & Angebote">{selected ? <RestaurantOfferDetail offer={selected} /> : null}</AppDrawer>
    </AppShell>
  );
}
