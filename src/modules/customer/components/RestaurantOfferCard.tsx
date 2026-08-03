import { CalendarDays, Image as ImageIcon } from "lucide-react";
import {
  formatRestaurantOfferPrice,
  restaurantOfferTypeLabels,
  type RestaurantOffer,
} from "../../offers/restaurantOfferService";
import "./restaurant-offer-card.css";

function offerValidity(offer: RestaurantOffer) {
  const formatter = new Intl.DateTimeFormat("de-AT", { day: "2-digit", month: "2-digit" });
  return `Gültig bis ${formatter.format(new Date(offer.valid_to))}`;
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
  return (
    <article className="customer-offer-card">
      <div className="customer-offer-card-media">
        {offer.image_url ? <img alt={`Bild zu ${offer.title}`} loading="lazy" src={offer.image_url} /> : <span><ImageIcon aria-hidden="true" size={31} /></span>}
        <small>{restaurantOfferTypeLabels[offer.offer_type]}</small>
      </div>
      <div className="customer-offer-card-body">
        {showRestaurant ? <span className="customer-offer-restaurant">{offer.restaurant_name}</span> : null}
        <h3>{offer.title}</h3>
        <p>{offer.short_description}</p>
        <div className="customer-offer-card-meta">
          <span><CalendarDays aria-hidden="true" size={16} />{offerValidity(offer)}</span>
          {offer.current_price != null ? <strong>{formatRestaurantOfferPrice(offer.current_price)}</strong> : null}
        </div>
        <button className="premium-button premium-button-secondary" onClick={onOpen} type="button">{offer.button_label}</button>
      </div>
    </article>
  );
}

export function RestaurantOfferDetail({ offer }: { offer: RestaurantOffer }) {
  return (
    <article className="customer-offer-detail">
      {offer.image_url ? <img alt={`Bild zu ${offer.title}`} src={offer.image_url} /> : null}
      <span>{restaurantOfferTypeLabels[offer.offer_type]}</span>
      {offer.restaurant_name ? <small>{offer.restaurant_name}</small> : null}
      <h2>{offer.title}</h2>
      <p>{offer.description || offer.short_description}</p>
      <div className="customer-offer-detail-meta">
        <span>{offerValidity(offer)}</span>
        {offer.time_from && offer.time_to ? <span>{offer.time_from.slice(0, 5)}–{offer.time_to.slice(0, 5)} Uhr</span> : null}
        {offer.current_price != null ? <strong>{formatRestaurantOfferPrice(offer.current_price)}</strong> : null}
      </div>
      <p className="customer-offer-responsibility">Angaben zu Preis, Verfügbarkeit und Inhalt stammen vom Restaurant.</p>
    </article>
  );
}
