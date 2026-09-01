import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Store } from "lucide-react";
import type { RestaurantBranding } from "../types/domain";
import { clampLogoPresentation, logoAspectKind, logoCanvasPlacement, logoImageStyle, type LogoPresentation } from "../logoPresentation.mjs";
import "./restaurant-logo-stage.css";

export type RestaurantLogoPresentation = Pick<RestaurantBranding, "logo_fit_mode" | "logo_position_x" | "logo_position_y" | "logo_scale"> | Partial<LogoPresentation>;

type RestaurantLogoStageProps = {
  alt?: string;
  className?: string;
  logoUrl?: string | null;
  name: string;
  onImageMetrics?: (metrics: { aspect: "wide" | "tall" | "square"; ratio: number }) => void;
  placementMode?: "default" | "canonical";
  presentation?: RestaurantLogoPresentation | null;
  primaryColor?: string | null;
  size?: "compact" | "header" | "detail" | "preview" | "print";
  style?: CSSProperties;
};

export function RestaurantLogoStage({ alt, className = "", logoUrl, name, onImageMetrics, placementMode = "default", presentation, primaryColor, size = "header", style }: RestaurantLogoStageProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [aspect, setAspect] = useState<"wide" | "tall" | "square" | "unknown">("unknown");
  const [imageSize, setImageSize] = useState({ height: 0, width: 0 });
  const [canonicalStyle, setCanonicalStyle] = useState<CSSProperties>({});
  const stageRef = useRef<HTMLSpanElement>(null);
  const normalizedUrl = logoUrl?.trim() || null;
  const config = useMemo(() => clampLogoPresentation(presentation ?? {}), [presentation]);
  const showImage = Boolean(normalizedUrl && failedUrl !== normalizedUrl);

  useEffect(() => {
    setAspect("unknown");
    setImageSize({ height: 0, width: 0 });
  }, [normalizedUrl]);

  useLayoutEffect(() => {
    if (placementMode !== "canonical" || !imageSize.width || !imageSize.height || !stageRef.current) {
      setCanonicalStyle({});
      return;
    }

    const stage = stageRef.current;
    const updatePlacement = () => {
      const width = stage.clientWidth;
      const height = stage.clientHeight;
      if (!width || !height) return;
      const placement = logoCanvasPlacement(
        imageSize.width,
        imageSize.height,
        { height, width, x: 0, y: 0 },
        config,
      );
      setCanonicalStyle({
        height: placement.height,
        left: placement.x,
        maxWidth: "none",
        objectFit: "fill",
        padding: 0,
        position: "absolute",
        top: placement.y,
        transform: "none",
        width: placement.width,
      });
    };

    updatePlacement();
    const observer = new ResizeObserver(updatePlacement);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [config, imageSize.height, imageSize.width, placementMode]);

  return (
    <span
      className={`restaurant-logo-stage size-${size} aspect-${aspect}${showImage ? " has-image" : " is-fallback"}${placementMode === "canonical" ? " placement-canonical" : ""}${className ? ` ${className}` : ""}`}
      ref={stageRef}
      style={{ ...style, "--restaurant-logo-fallback": primaryColor ?? "#9a6b1f" } as CSSProperties}
    >
      {showImage ? (
        <img
          alt={alt ?? `${name} Logo`}
          onError={() => setFailedUrl(normalizedUrl)}
          onLoad={(event) => {
            const nextAspect = logoAspectKind(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight);
            setAspect(nextAspect);
            setImageSize({ height: event.currentTarget.naturalHeight, width: event.currentTarget.naturalWidth });
            if (nextAspect !== "unknown") {
              onImageMetrics?.({ aspect: nextAspect, ratio: event.currentTarget.naturalWidth / event.currentTarget.naturalHeight });
            }
          }}
          src={normalizedUrl ?? undefined}
          style={placementMode === "canonical" ? canonicalStyle : logoImageStyle(config)}
        />
      ) : (
        placementMode === "canonical" ? (
          <span aria-label={alt ?? `${name} Logo`} className="restaurant-logo-fallback canonical-logo-fallback" role="img">
            <span aria-hidden="true">{(name.trim().charAt(0) || "R").toUpperCase()}</span>
          </span>
        ) : (
          <span aria-label={alt ?? `${name} Logo`} className="restaurant-logo-fallback" role="img">
            <Store aria-hidden="true" size={size === "detail" || size === "preview" || size === "print" ? 28 : 18} />
            <span aria-hidden="true">{(name.trim().charAt(0) || "R").toUpperCase()}</span>
          </span>
        )
      )}
    </span>
  );
}
