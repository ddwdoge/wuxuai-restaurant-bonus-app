import React from "react";

type PortalAccess = { success: boolean; restaurant_slug?: string; restaurant_role?: string };
type Queue = { actor_role: "STAFF" | "OWNER"; server_now: string; requests: Array<Record<string, unknown>> };
type Pending<T> = { slug: string; resolve: (value: T) => void; reject: (reason: Error) => void };

const qa = ((window as any).__d4c ??= {
  portalRequests: [] as Pending<PortalAccess>[],
  queueRequests: [] as Pending<Queue>[],
  actions: [] as Array<{ action: string; redemptionId: string; correlationId: string }>,
  otherWrites: 0,
});

export function resolveMyStaffRestaurantAccess(slug: string): Promise<PortalAccess> {
  return new Promise((resolve, reject) => qa.portalRequests.push({ slug, resolve, reject }));
}

export function loadSecureRedemptionQueue(slug: string): Promise<Queue> {
  return new Promise((resolve, reject) => qa.queueRequests.push({ slug, resolve, reject }));
}

export async function actOnSecureRedemption(action: string, redemptionId: string, correlationId: string) {
  qa.actions.push({ action, redemptionId, correlationId });
  return { success: true };
}

export async function rotateSecureRedemptionPin() {
  qa.otherWrites++;
  throw new Error("PIN_MUTATION_FORBIDDEN_IN_QUEUE_VIEW_TEST");
}

export function useI18n() {
  return { language: ((window as any).__d4cLanguage ?? "de") as "de",
    translateKey: (key: string) => key };
}

export function RewardImageFrame({ alt }: { alt: string }) {
  return <div className="reward-image-frame"><img alt={alt}
    src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'/%3E" /></div>;
}
