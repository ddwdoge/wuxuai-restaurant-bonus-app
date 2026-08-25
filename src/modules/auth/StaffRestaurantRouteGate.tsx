import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { normalizeStaffRestaurantSlug } from "./staffLoginFlow.mjs";
import { resolveMyStaffRestaurantAccess } from "./staffLoginService";

export function StaffRestaurantRouteGate({ children }: { children: React.ReactNode }) {
  const { slug: routeSlug } = useParams();
  const slug = normalizeStaffRestaurantSlug(routeSlug);
  const [state, setState] = useState<"loading" | "allowed" | "denied" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    if (!slug) {
      setState("denied");
      return () => { cancelled = true; };
    }
    setState("loading");
    resolveMyStaffRestaurantAccess(slug)
      .then((access) => {
        if (!cancelled) setState(access.success && access.restaurant_slug === slug ? "allowed" : "denied");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => { cancelled = true; };
  }, [slug]);

  if (state === "loading") return <div className="auth-shell">Mitarbeiterzugang wird geprüft …</div>;
  if (state === "error") {
    return <main className="auth-shell" role="alert"><h1>Zugang konnte nicht geprüft werden</h1><p>Bitte lade die Seite erneut.</p></main>;
  }
  if (state === "denied") {
    return <main className="auth-shell" role="alert"><h1>Kein Mitarbeiterzugang</h1><p>Dieses Konto besitzt keinen aktiven Mitarbeiterzugang für dieses Restaurant.</p></main>;
  }
  return <>{children}</>;
}
