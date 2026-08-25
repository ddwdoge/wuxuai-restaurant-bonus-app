import { useEffect, useState } from "react";
import { Store } from "lucide-react";

type ImageState = "loading" | "valid" | "error" | "missing";

function normalizedImageUrl(value: string | null | undefined) {
  return value?.trim() || null;
}

function restaurantInitial(name: string) {
  return name.trim().charAt(0).toLocaleUpperCase("de-AT") || "W";
}

export function RestaurantLogoImage({
  alt,
  className,
  logoUrl,
  name,
}: {
  alt: string;
  className?: string;
  logoUrl: string | null;
  name: string;
}) {
  const source = normalizedImageUrl(logoUrl);
  const [state, setState] = useState<ImageState>(source ? "loading" : "missing");

  useEffect(() => {
    setState(source ? "loading" : "missing");
  }, [source]);

  return (
    <span className={className} data-image-state={state}>
      {source && state !== "error" ? (
        <img
          alt={alt}
          className={state === "valid" ? "is-loaded" : undefined}
          key={source}
          loading="lazy"
          onError={() => setState("error")}
          onLoad={() => setState("valid")}
          src={source}
        />
      ) : null}
      {state !== "valid" ? (
        <span aria-hidden="true" className="restaurant-logo-placeholder">
          <Store size={22} />
          <strong>{restaurantInitial(name)}</strong>
        </span>
      ) : null}
    </span>
  );
}

export function RestaurantHeroImage({
  coverImageUrl,
  logoUrl,
  name,
}: {
  coverImageUrl: string | null;
  logoUrl: string | null;
  name: string;
}) {
  const source = normalizedImageUrl(coverImageUrl);
  const [state, setState] = useState<ImageState>(source ? "loading" : "missing");

  useEffect(() => {
    setState(source ? "loading" : "missing");
  }, [source]);

  return (
    <div
      aria-label={state === "valid" ? undefined : `${name} Titelbild nicht verfügbar`}
      className="partner-detail-hero"
      data-image-state={state}
      role={state === "valid" ? undefined : "img"}
    >
      <div aria-hidden={state === "valid"} className="partner-detail-hero-fallback">
        <RestaurantLogoImage alt={`${name} Logo`} className="partner-detail-hero-logo" logoUrl={logoUrl} name={name} />
      </div>
      {source && state !== "error" ? (
        <img
          alt={`${name} Titelbild`}
          className={`partner-detail-cover${state === "valid" ? " is-loaded" : ""}`}
          key={source}
          loading="lazy"
          onError={() => setState("error")}
          onLoad={() => setState("valid")}
          src={source}
        />
      ) : null}
    </div>
  );
}
