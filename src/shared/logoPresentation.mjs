export const defaultLogoPresentation = Object.freeze({
  fitMode: "auto",
  positionX: 0.5,
  positionY: 0.5,
  scale: 1,
});

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function clampLogoPresentation(input = {}) {
  return {
    fitMode: input.fitMode === "manual" || input.logo_fit_mode === "manual" ? "manual" : "auto",
    positionX: Math.min(1, Math.max(0, finiteNumber(input.positionX ?? input.logo_position_x, 0.5))),
    positionY: Math.min(1, Math.max(0, finiteNumber(input.positionY ?? input.logo_position_y, 0.5))),
    scale: Math.min(3, Math.max(0.75, finiteNumber(input.scale ?? input.logo_scale, 1))),
  };
}

export function logoAspectKind(width, height) {
  const safeWidth = finiteNumber(width, 0);
  const safeHeight = finiteNumber(height, 0);
  if (safeWidth <= 0 || safeHeight <= 0) return "unknown";
  const ratio = safeWidth / safeHeight;
  if (ratio >= 1.55) return "wide";
  if (ratio <= 0.72) return "tall";
  return "square";
}

export function logoImageStyle(input = {}) {
  const presentation = clampLogoPresentation(input);
  if (presentation.fitMode === "auto") {
    return { objectPosition: "50% 50%", transform: "none" };
  }
  const translateX = (presentation.positionX - 0.5) * 34;
  const translateY = (presentation.positionY - 0.5) * 34;
  return {
    objectPosition: "50% 50%",
    transform: `translate(${translateX}%, ${translateY}%) scale(${presentation.scale})`,
  };
}

export function logoCanvasPlacement(imageWidth, imageHeight, area, input = {}) {
  const presentation = clampLogoPresentation(input);
  const aspect = logoAspectKind(imageWidth, imageHeight);
  const paddingRatio = aspect === "wide" ? 0.06 : aspect === "tall" ? 0.08 : 0.1;
  const availableWidth = area.width * (1 - paddingRatio * 2);
  const availableHeight = area.height * (1 - paddingRatio * 2);
  const containScale = Math.min(availableWidth / imageWidth, availableHeight / imageHeight);
  const manualScale = presentation.fitMode === "manual" ? presentation.scale : 1;
  const width = imageWidth * containScale * manualScale;
  const height = imageHeight * containScale * manualScale;
  const travelX = Math.max(0, area.width - Math.min(width, area.width));
  const travelY = Math.max(0, area.height - Math.min(height, area.height));
  return {
    height,
    width,
    x: area.x + (area.width - width) / 2 + (presentation.positionX - 0.5) * travelX,
    y: area.y + (area.height - height) / 2 + (presentation.positionY - 0.5) * travelY,
  };
}

export function transparentContentAdjustment(bounds, imageWidth, imageHeight) {
  if (!bounds || !imageWidth || !imageHeight) return null;
  const contentWidth = bounds.right - bounds.left + 1;
  const contentHeight = bounds.bottom - bounds.top + 1;
  if (contentWidth <= 0 || contentHeight <= 0) return null;
  const coverage = (contentWidth * contentHeight) / (imageWidth * imageHeight);
  if (coverage >= 0.86) return null;
  const scale = Math.min(3, Math.max(1, Math.min(imageWidth / contentWidth, imageHeight / contentHeight) * 0.9));
  return {
    fitMode: "manual",
    positionX: Math.min(1, Math.max(0, 1 - ((bounds.left + bounds.right) / 2) / imageWidth)),
    positionY: Math.min(1, Math.max(0, 1 - ((bounds.top + bounds.bottom) / 2) / imageHeight)),
    scale,
  };
}
