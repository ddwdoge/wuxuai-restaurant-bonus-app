import type { PlatformHealthFinding } from "./platformAdminService";

export type HealthFilters = {
  severity: "" | "P0" | "P1" | "P2" | "P3";
  category: "" | "ONBOARDING" | "LOCATION" | "LEGAL" | "PLAN" | "BONUS" | "COUNTRY" | "SYSTEM";
  restaurant: string;
  location: string;
  country: string;
  plan: string;
  health: "" | "HEALTHY";
  query: string;
  finding: string;
};

export const HEALTH_SEVERITIES: readonly string[];
export const HEALTH_CATEGORIES: readonly string[];
export function normalizeHealthFilters(searchParams: URLSearchParams): HealthFilters;
export function filterHealthFindings(
  findings: PlatformHealthFinding[],
  filters: HealthFilters,
  getVisibleFindingText?: (finding: PlatformHealthFinding) => string,
): PlatformHealthFinding[];
export function isHealthSnapshotStale(generatedAt: string, now?: number, maxAgeMs?: number): boolean;
export function findingCounts(findings: PlatformHealthFinding[]): Record<"P0" | "P1" | "P2" | "P3", number>;
