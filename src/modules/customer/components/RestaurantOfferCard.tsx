import { useEffect, useState } from "react";
import { CalendarDays, Image as ImageIcon } from "lucide-react";
import { SmartMediaFrame } from "../../../shared/components/SmartMediaFrame";
import { mediaPresentationFromRecord } from "../../../shared/mediaPresentation";
import {
  formatRestaurantOfferPrice,
  formatRestaurantOfferPeriod,
  formatRestaurantOfferSchedule,
  restaurantOfferValidityPresentation,
  restaurantOfferTypeLabels,
  type RestaurantOffer,
} from "../../offers/restaurantOfferService";
import "./restaurant-offer-card.css";

function OfferImage({ offer, detail = false }: { offer: RestaurantOffer; detail?: boolean }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [offer.image_url]);
  if (!offer.image_url || failed) {
    return <div aria-hidden="true" className={detail ? "customer-offer-detail-fallback" : "customer-offer-card-fallback"}><ImageIcon size={detail ? 40 : 31} /></div>;
  }
  return <SmartMediaFrame alt={`Bild zu ${offer.title}`} imageUrl={offer.image_url} onImageError={() => setFailed(true)} presentation={mediaPresentationFromRecord(offer)} />;
}

export function RestaurantOfferCard({
  offer,
  onOpen,
  showRestaurant = false,
}: {
  offer: RestaurantOffer;
  onOpen: () => void;
  showRestaurant?: boolean;
}) {
  const validity = restaurantOfferValidityPresentation(offer);
  return (
    <article className="customer-offer-card premium-compact-customer-card">
      <div className="customer-offer-card-media">
        <OfferImage offer={offer} />
        <small>{restaurantOfferTypeLabels[offer.offer_type]}</small>
      </div>
      <div className="customer-offer-card-body">
        {showRestaurant ? <span className="customer-offer-restaurant">{offer.restaurant_name}</span> : null}
        <h3>{offer.title}</h3>
        <p>{offer.short_description}</p>
        <div className="customer-offer-card-validity-row">
          <span className={`customer-offer-validity ${validity.tone}`}>{validity.label}</span>
          <span className="customer-offer-schedule">{formatRestaurantOfferSchedule(offer)}</span>
        </div>
        <div className="customer-offer-card-meta">
          <span><CalendarDays aria-hidden="true" size={16} />{formatRestaurantOfferPeriod(offer)}</span>
          {offer.current_price != null ? <strong>{formatRestaurantOfferPrice(offer.current_price)}</strong> : null}
        </div>
        <button className="premium-button premium-button-secondary" onClick={onOpen} type="button">{offer.button_label}</button>
      </div>
    </article>
  );
}

export function RestaurantOfferDetail({ offer }: { offer: RestaurantOffer }) {
  const validity = restaurantOfferValidityPresentation(offer);
  return (
    <article className="customer-offer-detail">
      <div className="customer-offer-detail-media"><OfferImage detail offer={offer} /></div>
      <span>{restaurantOfferTypeLabels[offer.offer_type]}</span>
      {offer.restaurant_name ? <small>{offer.restaurant_name}</small> : null}
      <h2>{offer.title}</h2>
      <p>{offer.description || offer.short_description}</p>
      <span className={`customer-offer-validity ${validity.tone}`}>{validity.label}</span>
      <div className="customer-offer-detail-meta">
        <span><strong>Gültigkeit:</strong> {formatRestaurantOfferPeriod(offer)}</span>
        <span>{formatRestaurantOfferSchedule(offer)}</span>
        {offer.current_price != null ? <strong>{formatRestaurantOfferPrice(offer.current_price)}</strong> : null}
      </div>
      <p className="customer-offer-responsibility">Angaben zu Preis, Verfügbarkeit und Inhalt stammen vom Restaurant.</p>
    </article>
  );
}
