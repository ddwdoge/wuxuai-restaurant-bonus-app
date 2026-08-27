import { useEffect, useState } from "react";
import { RestaurantLogoStage, type RestaurantLogoPresentation } from "../../../shared/components/RestaurantLogoStage";
import { SmartMediaFrame } from "../../../shared/components/SmartMediaFrame";
import type { MediaPresentation } from "../../../shared/mediaPresentation";

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
  presentation,
}: {
  coverImageUrl: string | null;
  logoUrl: string | null;
  name: string;
  presentation?: Partial<MediaPresentation> | null;
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
      <SmartMediaFrame
        alt={`${name} Titelbild`}
        className="partner-detail-cover"
        fallback={<div className="partner-detail-hero-fallback"><RestaurantLogoImage alt={`${name} Logo`} className="partner-detail-hero-logo" logoUrl={logoUrl} name={name} /></div>}
        imageUrl={state === "error" ? null : source}
        onImageError={() => setState("error")}
        onImageLoad={() => setState("valid")}
        presentation={presentation}
      />
    </div>
  );
}
