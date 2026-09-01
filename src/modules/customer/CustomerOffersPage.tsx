import { useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { AppDrawer } from "../../shared/components/AppDrawer";
import { AppShell, EmptyState, ErrorState, LoadingState } from "./components/PremiumCustomerUi";
import { RestaurantOfferCard, RestaurantOfferDetail } from "./components/RestaurantOfferCard";
import {
  loadPublicRestaurantOffers,
  recordRestaurantOfferEvent,
  type RestaurantOffer,
} from "../offers/restaurantOfferService";
import "./customer-offers-page.css";

export function CustomerOffersPage() {
  const [searchParams] = useSearchParams();
  const { slug = "" } = useParams();
  const requestedOfferId = searchParams.get("offer");
  const [offers, setOffers] = useState<RestaurantOffer[]>([]);
  const [selected, setSelected] = useState<RestaurantOffer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadPublicRestaurantOffers(slug, 100)
      .then((nextOffers) => {
        if (cancelled) return;
        setOffers(nextOffers);
        if (requestedOfferId) setSelected(nextOffers.find((offer) => offer.id === requestedOfferId) ?? null);
        nextOffers.forEach((offer) => { void recordRestaurantOfferEvent(offer.id, "OFFER_VIEWED"); });
      })
      .catch(() => { if (!cancelled) setError("Aktuelles konnte gerade nicht geladen werden."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [requestedOfferId, slug]);

  const sortedOffers = useMemo(() => {
    return [...offers].sort((left, right) => {
      const leftLunch = left.offer_type === "LUNCH_MENU" ? 1 : 0;
      const rightLunch = right.offer_type === "LUNCH_MENU" ? 1 : 0;
      if (leftLunch !== rightLunch) return rightLunch - leftLunch;
      return new Date(right.published_at ?? right.valid_from).getTime() - new Date(left.published_at ?? left.valid_from).getTime();
    });
  }, [offers]);

  function openOffer(offer: RestaurantOffer) {
    setSelected(offer);
    void recordRestaurantOfferEvent(offer.id, "OFFER_CTA_CLICKED");
  }

  return (
    <AppShell>
      <div className="customer-offers-page customer-offers-shell">
        <header className="customer-offers-header">
          <Link aria-label="Zurück" to={`/customer/${encodeURIComponent(slug)}`}><ArrowLeft aria-hidden="true" size={20} /></Link>
          <div><span>Dein ausgewähltes Lokal</span><h1>Aktuelles & Angebote</h1><p>Neuigkeiten und Angebote dieses Restaurants.</p></div>
        </header>
        {loading ? <LoadingState description="Aktuelles wird geladen." /> : error ? <ErrorState action={<button className="premium-button premium-button-secondary" onClick={() => window.location.reload()} type="button">Erneut versuchen</button>} description={error} title="Aktuelles nicht verfügbar" /> : sortedOffers.length ? (
          <section aria-label="Aktuelle Restaurantbeiträge" className="customer-offer-grid">{sortedOffers.map((offer) => <RestaurantOfferCard key={offer.id} offer={offer} onOpen={() => openOffer(offer)} showRestaurant />)}</section>
        ) : <EmptyState description="Sobald ein Partnerrestaurant etwas veröffentlicht, erscheint es hier." title="Noch nichts Neues" />}
      </div>
      <AppDrawer description="Information des Restaurants" onClose={() => setSelected(null)} open={Boolean(selected)} size="standard" title="Aktuelles & Angebote">{selected ? <RestaurantOfferDetail offer={selected} /> : null}</AppDrawer>
    </AppShell>
  );
}
