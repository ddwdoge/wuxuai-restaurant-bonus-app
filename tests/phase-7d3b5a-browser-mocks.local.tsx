import React from "react";

type PortalAccess = { success: boolean; restaurant_slug?: string; restaurant_role?: string };
type Queue = { actor_role: "STAFF" | "OWNER"; server_now: string; requests: Array<Record<string, unknown>> };
type Pending<T> = { slug: string; resolve: (value: T) => void; reject: (reason: Error) => void };

const qa = ((window as any).__d3b5a ??= {
  portalRequests: [] as Pending<PortalAccess>[],
  queueRequests: [] as Pending<Queue>[],
  writes: 0,
});

export function resolveMyStaffRestaurantAccess(slug: string): Promise<PortalAccess> {
  return new Promise((resolve, reject) => qa.portalRequests.push({ slug, resolve, reject }));
}

export function loadSecureRedemptionQueue(slug: string): Promise<Queue> {
  return new Promise((resolve, reject) => qa.queueRequests.push({ slug, resolve, reject }));
}

export async function actOnSecureRedemption() { qa.writes++; throw new Error("MUTATION_FORBIDDEN_IN_RENDER_TEST"); }
export async function rotateSecureRedemptionPin() { qa.writes++; throw new Error("MUTATION_FORBIDDEN_IN_RENDER_TEST"); }

export function useI18n() {
  return { language: ((window as any).__d3b5aLanguage ?? "de") as "de",
    translateKey: (key: string) => key };
}

export function RewardImageFrame({ alt }: { alt: string }) {
  return <div aria-label={alt} style={{ width: "100%", aspectRatio: "16 / 9" }} />;
}
