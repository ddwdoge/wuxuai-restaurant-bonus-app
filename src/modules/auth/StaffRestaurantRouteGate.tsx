import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { normalizeStaffRestaurantSlug } from "./staffLoginFlow.mjs";
import { resolveMyStaffRestaurantAccess, type StaffRestaurantAccess } from "./staffLoginService";
import { StaffPortalAccessContext } from "./staffPortalAccessContext";

export function StaffRestaurantRouteGate({ children }: { children: React.ReactNode }) {
  const { slug: routeSlug } = useParams();
  const slug = normalizeStaffRestaurantSlug(routeSlug);
  const [state, setState] = useState<"loading" | "allowed" | "denied" | "error">("loading");
  const [access, setAccess] = useState<StaffRestaurantAccess | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!slug) {
      setState("denied");
      return () => { cancelled = true; };
    }
    setState("loading");
    setAccess(null);
    resolveMyStaffRestaurantAccess(slug)
      .then((access) => {
        if (cancelled) return;
        if (access.success && access.restaurant_slug === slug) {
          setAccess(access);
          setState("allowed");
          return;
        }
        setState("denied");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => { cancelled = true; };
  }, [revision, slug]);

  if (state === "loading") return <div className="auth-shell">Mitarbeiterzugang wird geprüft …</div>;
  if (state === "error") {
    return <main className="auth-shell" role="alert"><h1>Zugang konnte nicht geprüft werden</h1><p>Deine Anmeldung bleibt bestehen.</p><button onClick={() => setRevision((current) => current + 1)} type="button">Erneut versuchen</button></main>;
  }
  if (state === "denied") {
    return <main className="auth-shell" role="alert"><h1>Kein Mitarbeiterzugang</h1><p>Dieses Konto besitzt keinen aktiven Zugang zum Mitarbeiterbereich dieses Restaurants.</p></main>;
  }
  return <StaffPortalAccessContext.Provider value={access}>{children}</StaffPortalAccessContext.Provider>;
}
