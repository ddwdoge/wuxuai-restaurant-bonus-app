export function requiresCustomerInitiatedQr(pointsCollectionMode) {
  return pointsCollectionMode === "customer_initiated_only" || pointsCollectionMode === "both";
}

export function getQrCenterPurposes(pointsCollectionMode) {
  const purposes = ["new_guest", "staff"];
  if (requiresCustomerInitiatedQr(pointsCollectionMode)) {
    purposes.push("customer_collect_compatibility");
  }
  return purposes;
}
