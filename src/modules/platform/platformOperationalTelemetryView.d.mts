import type { PlatformOperationalStatus } from "./platformAdminService";

export function getOperationalStatusPresentation(status: PlatformOperationalStatus): {
  label: string;
  tone: "success" | "warning" | "danger" | "neutral";
};

export function getOperationalReasonLabel(reason: string | null | undefined): string | null;

export function formatOperationalDateTime(value: string | null | undefined): string;
