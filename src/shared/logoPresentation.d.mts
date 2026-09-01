export type LogoFitMode = "auto" | "manual";

export type LogoPresentation = {
  fitMode: LogoFitMode;
  positionX: number;
  positionY: number;
  scale: number;
};

export const defaultLogoPresentation: Readonly<LogoPresentation>;
export function clampLogoPresentation(input?: Partial<LogoPresentation> & Record<string, unknown>): LogoPresentation;
export function logoAspectKind(width: number, height: number): "wide" | "tall" | "square" | "unknown";
export function logoImageStyle(input?: Partial<LogoPresentation> & Record<string, unknown>): { objectPosition: string; transform: string };
export function relativeLogoScale(
  input?: Partial<LogoPresentation> & Record<string, unknown>,
  baselineInput?: Partial<LogoPresentation> & Record<string, unknown>,
): number;
export function logoPresentationAtRelativeScale(
  input?: Partial<LogoPresentation> & Record<string, unknown>,
  baselineInput?: Partial<LogoPresentation> & Record<string, unknown>,
  factor?: number,
): LogoPresentation;
export function logoPresentationAfterEditorDrag(
  input?: Partial<LogoPresentation> & Record<string, unknown>,
  deltaX?: number,
  deltaY?: number,
  stageWidth?: number,
  stageHeight?: number,
): LogoPresentation;
export function logoCanvasPlacement(
  imageWidth: number,
  imageHeight: number,
  area: { x: number; y: number; width: number; height: number },
  input?: Partial<LogoPresentation> & Record<string, unknown>,
): { x: number; y: number; width: number; height: number };
export function transparentContentAdjustment(
  bounds: { left: number; right: number; top: number; bottom: number } | null,
  imageWidth: number,
  imageHeight: number,
): LogoPresentation | null;
