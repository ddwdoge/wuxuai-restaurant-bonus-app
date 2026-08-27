import { useEffect, useState, type CSSProperties } from "react";
import { Store } from "lucide-react";
import type { RestaurantBranding } from "../types/domain";
import { clampLogoPresentation, logoAspectKind, logoImageStyle, type LogoPresentation } from "../logoPresentation.mjs";
import "./restaurant-logo-stage.css";

export type RestaurantLogoPresentation = Pick<RestaurantBranding, "logo_fit_mode" | "logo_position_x" | "logo_position_y" | "logo_scale"> | Partial<LogoPresentation>;

type RestaurantLogoStageProps = {
  alt?: string;
  className?: string;
  logoUrl?: string | null;
  name: string;
  presentation?: RestaurantLogoPresentation | null;
  primaryColor?: string | null;
  size?: "compact" | "header" | "detail" | "preview" | "print";
};

export function RestaurantLogoStage({ alt, className = "", logoUrl, name, presentation, primaryColor, size = "header" }: RestaurantLogoStageProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [aspect, setAspect] = useState<"wide" | "tall" | "square" | "unknown">("unknown");
  const normalizedUrl = logoUrl?.trim() || null;
  const config = clampLogoPresentation(presentation ?? {});
  const showImage = Boolean(normalizedUrl && failedUrl !== normalizedUrl);

  useEffect(() => {
    setAspect("unknown");
  }, [normalizedUrl]);

  return (
    <span
      className={`restaurant-logo-stage size-${size} aspect-${aspect}${showImage ? " has-image" : " is-fallback"}${className ? ` ${className}` : ""}`}
      style={{ "--restaurant-logo-fallback": primaryColor ?? "#9a6b1f" } as CSSProperties}
    >
      {showImage ? (
        <img
          alt={alt ?? `${name} Logo`}
          onError={() => setFailedUrl(normalizedUrl)}
          onLoad={(event) => setAspect(logoAspectKind(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight))}
          src={normalizedUrl ?? undefined}
          style={logoImageStyle(config)}
        />
      ) : (
        <span aria-label={alt ?? `${name} Logo`} className="restaurant-logo-fallback" role="img">
          <Store aria-hidden="true" size={size === "detail" || size === "preview" || size === "print" ? 28 : 18} />
          <span aria-hidden="true">{(name.trim().charAt(0) || "R").toUpperCase()}</span>
        </span>
      )}
    </span>
  );
}
