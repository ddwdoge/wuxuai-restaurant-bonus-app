export const HEALTH_SEVERITIES = Object.freeze(["P0", "P1", "P2", "P3"]);
export const HEALTH_CATEGORIES = Object.freeze(["ONBOARDING", "LOCATION", "LEGAL", "PLAN", "BONUS", "COUNTRY", "SYSTEM"]);

export function normalizeHealthFilters(searchParams) {
  const severity = searchParams.get("severity") ?? "";
  const category = searchParams.get("category") ?? "";
  return {
    severity: HEALTH_SEVERITIES.includes(severity) ? severity : "",
    category: HEALTH_CATEGORIES.includes(category) ? category : "",
    restaurant: searchParams.get("restaurant") ?? "",
    location: searchParams.get("location") ?? "",
    country: (searchParams.get("country") ?? "").toUpperCase(),
    plan: (searchParams.get("plan") ?? "").toUpperCase(),
    health: searchParams.get("health") === "HEALTHY" ? "HEALTHY" : "",
    query: searchParams.get("query") ?? "",
    finding: searchParams.get("finding") ?? "",
  };
}

export function filterHealthFindings(findings, filters, getVisibleFindingText = () => "") {
  const query = filters.query.trim().toLocaleLowerCase();
  return findings.filter((finding) => {
    const target = finding.target ?? {};
    const searchable = [
      finding.type,
      finding.category,
      getVisibleFindingText(finding),
      target.restaurant_name,
      target.country,
      target.plan,
      target.system_area,
    ]
      .filter(Boolean).join(" ").toLocaleLowerCase();
    return (!filters.severity || finding.severity === filters.severity)
      && (!filters.category || finding.category === filters.category)
      && (!filters.restaurant || target.restaurant_id === filters.restaurant)
      && (!filters.location || target.location_id === filters.location)
      && (!filters.country || target.country === filters.country)
      && (!filters.plan || target.plan === filters.plan)
      && (!query || searchable.includes(query));
  });
}

export function isHealthSnapshotStale(generatedAt, now = Date.now(), maxAgeMs = 5 * 60 * 1000) {
  const timestamp = new Date(generatedAt).getTime();
  return !Number.isFinite(timestamp) || now - timestamp > maxAgeMs;
}

export function findingCounts(findings) {
  return HEALTH_SEVERITIES.reduce((result, severity) => {
    result[severity] = findings.filter((finding) => finding.severity === severity).length;
    return result;
  }, { P0: 0, P1: 0, P2: 0, P3: 0 });
}
