import type { CSSProperties, ReactNode } from "react";
import { starterKitSingleLineFontSize, STARTER_KIT_LAYOUT } from "../lib/starterKitPages.mjs";
import { RestaurantLogoStage, type RestaurantLogoPresentation } from "./RestaurantLogoStage";

type RestaurantBrandIdentityProps = {
  contextLabel?: string;
  logoUrl?: string | null;
  name: string;
  presentation?: RestaurantLogoPresentation | null;
  primaryColor?: string | null;
  variant: "a6" | "qr-card";
};

function previewBoxStyle(box: { height: number; width: number; x: number; y: number }): CSSProperties {
  return {
    height: box.height,
    left: box.x,
    top: box.y,
    width: box.width,
  };
}

function previewTextStyle(y: number, fontSize: number): CSSProperties {
  return {
    fontSize,
    top: y,
  };
}

export function RestaurantBrandIdentity({ contextLabel, logoUrl, name, presentation, primaryColor, variant }: RestaurantBrandIdentityProps): ReactNode {
  if (variant === "a6") {
    const nameFontSize = starterKitSingleLineFontSize(name, {
      fontSize: STARTER_KIT_LAYOUT.restaurantName.fontSize,
      maxWidth: STARTER_KIT_LAYOUT.canvas.width - STARTER_KIT_LAYOUT.contentMargin * 2 - 40,
      minFontSize: STARTER_KIT_LAYOUT.restaurantName.minFontSize,
    });
    return (
      <>
        <div className="starter-kit-a6-logo" style={previewBoxStyle(STARTER_KIT_LAYOUT.logo)}>
          <RestaurantLogoStage logoUrl={logoUrl} name={name} placementMode="canonical" presentation={presentation} primaryColor={primaryColor} size="print" style={{ height: "100%", maxWidth: "none", width: "100%" }} />
        </div>
        <div className="starter-kit-a6-name" style={previewTextStyle(STARTER_KIT_LAYOUT.restaurantName.y, nameFontSize)}>{name}</div>
      </>
    );
  }

  return (
    <div className="restaurant-brand-header qr-preview-brand">
      <RestaurantLogoStage className="restaurant-logo-frame" logoUrl={logoUrl} name={name} placementMode="canonical" presentation={presentation} primaryColor={primaryColor} size="header" />
      <div className="restaurant-brand-copy">
        <span className="restaurant-brand-title">{name}</span>
        <span className="restaurant-brand-subtitle">{contextLabel}</span>
      </div>
    </div>
  );
}
