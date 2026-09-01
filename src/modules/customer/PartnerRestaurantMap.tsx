import { useCallback, useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet.markercluster";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "./partner-restaurant-map.css";
import type { PartnerRestaurant } from "./partnerRestaurantService";
import { markerStatus } from "./partnerRestaurantFinder.mjs";

export type PartnerRestaurantMapProps = {
  currentSlug?: string | null;
  locations: PartnerRestaurant[];
  onSelect: (location: PartnerRestaurant) => void;
  selectedId: string | null;
  userLocation: { latitude: number; longitude: number } | null;
  tileUrl?: string;
};

export const OPENSTREETMAP_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

function MapSizeSync() {
  const map = useMap();

  useEffect(() => {
    const container = map.getContainer();
    let frame = window.requestAnimationFrame(() => {
      frame = window.requestAnimationFrame(() => map.invalidateSize({ animate: false }));
    });
    let previousWidth = container.clientWidth;
    let previousHeight = container.clientHeight;
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(([entry]) => {
      const width = Math.round(entry.contentRect.width);
      const height = Math.round(entry.contentRect.height);
      if (width <= 0 || height <= 0 || (width === previousWidth && height === previousHeight)) return;
      previousWidth = width;
      previousHeight = height;
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => map.invalidateSize({ animate: false }));
    });

    observer?.observe(container);
    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [map]);

  return null;
}

function markerIcon(location: PartnerRestaurant, selected: boolean, current: boolean) {
  const status = markerStatus(location);
  const statusLabel = status === "closed"
    ? "Aktuell geschlossen"
    : status === "reward"
    ? "Punkteeinlösung verfügbar"
    : status === "near"
      ? "Nächste Punkteeinlösung fast erreicht"
    : status === "member"
      ? "Punkte vorhanden"
      : status === "registered"
        ? "Registriert"
        : "Partnerlokal";
  const visitedLabel = (location.membership?.visits_count ?? 0) > 0 ? "Bereits besucht. " : "Noch nicht besucht. ";
  const markerSymbol = status === "closed" ? "–" : status === "reward" ? "!" : status === "near" ? "+" : status === "member" ? "P" : status === "registered" ? "✓" : "·";

  return L.divIcon({
    className: "partner-map-marker-shell",
    html: `<span class="partner-map-marker ${status}${(location.membership?.visits_count ?? 0) > 0 ? " visited" : ""}${selected ? " selected" : ""}${current ? " current" : ""}" aria-label="${current ? "Aktueller Restaurantkontext. " : ""}${visitedLabel}${statusLabel}"><span aria-hidden="true">${markerSymbol}</span></span>`,
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

export function PartnerRestaurantMap({ tileUrl = OPENSTREETMAP_TILE_URL, ...props }: PartnerRestaurantMapProps) {
  const [tileAttempt, setTileAttempt] = useState(0);
  const [tileState, setTileState] = useState<"loading" | "loaded" | "failed">("loading");
  const tileLoadedRef = useRef(false);

  useEffect(() => {
    tileLoadedRef.current = false;
    setTileState("loading");
    const timeout = window.setTimeout(() => {
      if (!tileLoadedRef.current) setTileState("failed");
    }, 8_000);
    return () => window.clearTimeout(timeout);
  }, [tileAttempt, tileUrl]);

  const retryTiles = useCallback(() => {
    setTileAttempt((attempt) => attempt + 1);
  }, []);

  return (
    <div className="partner-map-runtime">
      <MapContainer
        center={[47.8, 13.2]}
        className="partner-map-canvas"
        scrollWheelZoom
        zoom={7}
        zoomControl
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-Mitwirkende'
          eventHandlers={{
            tileload: () => {
              tileLoadedRef.current = true;
              setTileState("loaded");
            },
            tileerror: () => {
              if (!tileLoadedRef.current) setTileState("failed");
            },
          }}
          key={`${tileUrl}-${tileAttempt}`}
          url={tileUrl}
        />
        <MapSizeSync />
        <PartnerMarkers {...props} />
      </MapContainer>
      {tileState === "failed" ? (
        <div className="partner-map-tile-error" role="alert">
          <strong>Karte konnte nicht geladen werden.</strong>
          <button className="button secondary" onClick={retryTiles} type="button">Erneut versuchen</button>
        </div>
      ) : null}
    </div>
  );
}
