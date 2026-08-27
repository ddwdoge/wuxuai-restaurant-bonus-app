import { useEffect, useState } from "react";
import { RestaurantLogoStage, type RestaurantLogoPresentation } from "../../../shared/components/RestaurantLogoStage";

type ImageState = "loading" | "valid" | "error" | "missing";

function normalizedImageUrl(value: string | null | undefined) {
  return value?.trim() || null;
}

export function RestaurantLogoImage({
  alt,
  className,
  logoUrl,
  name,
  presentation,
}: {
  alt: string;
  className?: string;
  logoUrl: string | null;
  name: string;
  presentation?: RestaurantLogoPresentation | null;
}) {
  return <RestaurantLogoStage alt={alt} className={className} logoUrl={logoUrl} name={name} presentation={presentation} size="header" />;
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
