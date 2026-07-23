import { useEffect } from "react";
import L from "leaflet";
import "leaflet.markercluster";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import type { PartnerRestaurant } from "./partnerRestaurantService";
import { markerStatus } from "./partnerRestaurantFinder.mjs";

type PartnerRestaurantMapProps = {
  currentSlug?: string | null;
  locations: PartnerRestaurant[];
  onSelect: (location: PartnerRestaurant) => void;
  selectedId: string | null;
  userLocation: { latitude: number; longitude: number } | null;
};

function markerIcon(location: PartnerRestaurant, selected: boolean, current: boolean) {
  const status = markerStatus(location);
  const statusLabel = status === "reward"
    ? "Punkteeinlösung verfügbar"
    : status === "near"
      ? "Nächste Punkteeinlösung fast erreicht"
    : status === "member"
      ? "Punkte vorhanden"
      : status === "registered"
        ? "Registriert"
        : "Partnerrestaurant";

  return L.divIcon({
    className: "partner-map-marker-shell",
    html: `<span class="partner-map-marker ${status}${selected ? " selected" : ""}${current ? " current" : ""}" aria-label="${current ? `Aktueller Restaurantkontext. ${statusLabel}` : statusLabel}"><span></span></span>`,
    iconAnchor: [20, 40],
    iconSize: [40, 40],
  });
}

function PartnerMarkers({ currentSlug, locations, onSelect, selectedId, userLocation }: PartnerRestaurantMapProps) {
  const map = useMap();

  useEffect(() => {
    const cluster = L.markerClusterGroup({
      maxClusterRadius: 48,
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
    });

    locations.forEach((location) => {
      const marker = L.marker([location.latitude, location.longitude], {
        icon: markerIcon(location, selectedId === location.branch_id, currentSlug === location.slug),
        keyboard: true,
        title: location.name,
      });
      marker.on("click", () => onSelect(location));
      cluster.addLayer(marker);
    });

    if (userLocation) {
      cluster.addLayer(L.circleMarker([userLocation.latitude, userLocation.longitude], {
        className: "partner-map-user-location",
        color: "#315a7d",
        fillColor: "#ffffff",
        fillOpacity: 1,
        radius: 7,
        weight: 4,
      }).bindTooltip("Dein Standort"));
    }

    map.addLayer(cluster);
    return () => {
      map.removeLayer(cluster);
    };
  }, [currentSlug, locations, map, onSelect, selectedId, userLocation]);

  useEffect(() => {
    if (locations.length === 0) return;
    const bounds = L.latLngBounds(locations.map((location) => [location.latitude, location.longitude]));
    map.fitBounds(bounds, { maxZoom: 14, padding: [36, 36] });
  }, [locations, map]);

  return null;
}

export function PartnerRestaurantMap(props: PartnerRestaurantMapProps) {
  return (
    <MapContainer
      center={[47.8, 13.2]}
      className="partner-map-canvas"
      scrollWheelZoom
      zoom={7}
      zoomControl
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-Mitwirkende'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <PartnerMarkers {...props} />
    </MapContainer>
  );
}
