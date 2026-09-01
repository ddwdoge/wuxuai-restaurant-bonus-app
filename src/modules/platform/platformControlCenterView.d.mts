import type { PlatformMetric, PlatformSubsystemHealth, RestaurantStatus } from "./platformAdminService";

export function formatPlatformMetric<T>(metric: PlatformMetric<T> | null | undefined, formatter?: (value: T) => string): string;
export function getHealthPresentation(status: PlatformSubsystemHealth): { label: string; tone: "success" | "warning" | "danger" | "neutral" };
export function getOverallHealthPresentation(status: "healthy" | "warning" | "error" | "unknown"): { label: string; tone: "success" | "warning" | "danger" | "neutral" };
export function getReferralDurationPresentation(durationDays: number, durationType: "preset" | "custom"): string;
export function getRestaurantStatusLabel(status: RestaurantStatus): string;
export function getSetupLabel(completed: boolean): string;
