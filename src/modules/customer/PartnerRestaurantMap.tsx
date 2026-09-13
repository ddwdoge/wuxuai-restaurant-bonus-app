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
import { customerPresentationText } from "./customerRewardPresentation.mjs";
import { useI18n } from "../../shared/i18n/I18nProvider";

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
  const { language } = useI18n();

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

  useEffect(() => {
    const container = map.getContainer();
    const zoomIn = container.querySelector<HTMLElement>(".leaflet-control-zoom-in");
    const zoomOut = container.querySelector<HTMLElement>(".leaflet-control-zoom-out");
    const applyLabel = (element: HTMLElement | null, key: string) => {
      if (!element) return;
      const label = customerPresentationText(key, language);
      element.setAttribute("aria-label", label);
      element.setAttribute("title", label);
    };
    applyLabel(zoomIn, "mapZoomIn");
    applyLabel(zoomOut, "mapZoomOut");
  }, [language, map]);

  return null;
}

function markerIcon(location: PartnerRestaurant, selected: boolean, current: boolean, language: string) {
  const text = (key: string) => customerPresentationText(key, language);
  const status = markerStatus(location);
  const statusLabel = status === "closed"
    ? text("mapClosed")
    : status === "reward"
    ? text("mapReward")
    : status === "near"
      ? text("mapNearReward")
    : status === "member"
      ? text("mapPointsAvailable")
      : status === "registered"
        ? text("mapRegistered")
        : text("mapPartner");
  const visitedLabel = (location.membership?.visits_count ?? 0) > 0 ? `${text("finderVisited")}. ` : `${text("finderNotVisited")}. `;
  const markerSymbol = status === "closed" ? "–" : status === "reward" ? "!" : status === "near" ? "+" : status === "member" ? "P" : status === "registered" ? "✓" : "·";

  return L.divIcon({
    className: "partner-map-marker-shell",
    html: `<span class="partner-map-marker ${status}${(location.membership?.visits_count ?? 0) > 0 ? " visited" : ""}${selected ? " selected" : ""}${current ? " current" : ""}" aria-label="${current ? `${text("mapCurrentContext")}. ` : ""}${visitedLabel}${statusLabel}"><span aria-hidden="true">${markerSymbol}</span></span>`,
    iconAnchor: [20, 40],
    iconSize: [40, 40],
  });
}

function PartnerMarkers({ currentSlug, locations, onSelect, selectedId, userLocation }: PartnerRestaurantMapProps) {
  const map = useMap();
  const { language } = useI18n();

  useEffect(() => {
    const cluster = L.markerClusterGroup({
      maxClusterRadius: 48,
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
    });

    locations.forEach((location) => {
      const marker = L.marker([location.latitude, location.longitude], {
        icon: markerIcon(location, selectedId === location.branch_id, currentSlug === location.slug, language),
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
      }).bindTooltip(customerPresentationText("mapUserLocation", language)));
    }

    map.addLayer(cluster);
    return () => {
      map.removeLayer(cluster);
    };
  }, [currentSlug, language, locations, map, onSelect, selectedId, userLocation]);

  useEffect(() => {
    if (locations.length === 0) return;
    const bounds = L.latLngBounds(locations.map((location) => [location.latitude, location.longitude]));
    map.fitBounds(bounds, { maxZoom: 14, padding: [36, 36] });
  }, [locations, map]);

  return null;
}

export function PartnerRestaurantMap({ tileUrl = OPENSTREETMAP_TILE_URL, ...props }: PartnerRestaurantMapProps) {
  const { language } = useI18n();
  const text = (key: string) => customerPresentationText(key, language);
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
          attribution={`&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> ${text("mapContributors")}`}
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
          <strong>{text("mapLoadError")}</strong>
          <button className="button secondary" onClick={retryTiles} type="button">{text("retry")}</button>
        </div>
      ) : null}
    </div>
  );
}
