export type StarterKitQrKind = "restaurant" | "staff" | "bonus";

export type StarterKitPageDefinition = {
  audienceLabel?: string;
  headline: string;
  id: string;
  qrKind: StarterKitQrKind;
  referralHint?: boolean;
  secondaryNote?: string;
  subheadline: string;
};

export const STARTER_KIT_FOOTER: string;
export const STARTER_KIT_LAYOUT: {
  readonly canvas: { readonly height: number; readonly width: number };
  readonly contentMargin: number;
  readonly logo: { readonly height: number; readonly width: number; readonly x: number; readonly y: number };
  readonly restaurantName: { readonly fontSize: number; readonly lineHeight: number; readonly y: number };
  readonly audience: { readonly fontSize: number; readonly y: number };
  readonly headline: { readonly fontSize: number; readonly lineHeight: number; readonly y: number };
  readonly description: { readonly fontSize: number; readonly lineHeight: number; readonly y: number };
  readonly qr: { readonly frameInset: number; readonly frameRadius: number; readonly size: number; readonly x: number; readonly y: number };
  readonly secondaryNote: { readonly fontSize: number; readonly lineHeight: number; readonly y: number };
  readonly referral: { readonly height: number; readonly y: number };
  readonly footer: { readonly fontSize: number; readonly y: number };
};
export const STARTER_KIT_REFERRAL: {
  readonly title: string;
  readonly benefits: ReadonlyArray<{ readonly icon: string; readonly label: string; readonly value: string }>;
  readonly note: string;
};
export function getStarterKitPageDefinitions(includeCustomerCollectCompatibility?: boolean): StarterKitPageDefinition[];
