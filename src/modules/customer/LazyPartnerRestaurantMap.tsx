import { Component, lazy, Suspense, type ErrorInfo, type ReactNode } from "react";
import type { PartnerRestaurantMapProps } from "./PartnerRestaurantMap";

const PartnerRestaurantMap = lazy(() =>
  import("./PartnerRestaurantMap").then((module) => ({ default: module.PartnerRestaurantMap })),
);

type MapErrorBoundaryProps = {
  children: ReactNode;
  fallback: ReactNode;
};

type MapErrorBoundaryState = {
  failed: boolean;
};

class MapErrorBoundary extends Component<MapErrorBoundaryProps, MapErrorBoundaryState> {
  state: MapErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): MapErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn("Kartenansicht konnte nicht geladen werden.", { name: error.name, componentStack: info.componentStack });
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

type LazyPartnerRestaurantMapProps = PartnerRestaurantMapProps & {
  errorFallback?: ReactNode;
  loadingFallback?: ReactNode;
};

export function LazyPartnerRestaurantMap({
  errorFallback = <p className="muted" role="status">Die Karte konnte nicht geladen werden. Die Unternehmensliste bleibt verfügbar.</p>,
  loadingFallback = <p className="muted" role="status">Karte wird geladen …</p>,
  ...props
}: LazyPartnerRestaurantMapProps) {
  return (
    <MapErrorBoundary fallback={errorFallback}>
      <Suspense fallback={loadingFallback}>
        <PartnerRestaurantMap {...props} />
      </Suspense>
    </MapErrorBoundary>
  );
}
