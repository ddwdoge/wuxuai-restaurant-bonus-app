import type { PointsCollectionMode } from "../../shared/types/domain";

export type QrCenterPurpose = "new_guest" | "staff" | "customer_collect_compatibility";

export function requiresCustomerInitiatedQr(pointsCollectionMode: PointsCollectionMode): boolean;
export function getQrCenterPurposes(pointsCollectionMode: PointsCollectionMode): QrCenterPurpose[];
