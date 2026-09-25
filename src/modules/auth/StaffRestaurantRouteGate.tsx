import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { normalizeStaffRestaurantSlug } from "./staffLoginFlow.mjs";
import { resolveMyStaffRestaurantAccess, type StaffRestaurantAccess } from "./staffLoginService";
import { StaffPortalAccessContext } from "./staffPortalAccessContext";
import { useI18n } from "../../shared/i18n/I18nProvider";

export function StaffRestaurantRouteGate({ children }: { children: React.ReactNode }) {
  const { translateKey: t } = useI18n();
  const { slug: routeSlug } = useParams();
  const slug = normalizeStaffRestaurantSlug(routeSlug);
  const [check, setCheck] = useState<{
    slug: string | null;
    status: "loading" | "allowed" | "denied" | "error";
    access: StaffRestaurantAccess | null;
  }>({ slug: null, status: "loading", access: null });
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!slug) {
      setCheck({ slug, status: "denied", access: null });
      return () => { cancelled = true; };
    }
    setCheck({ slug, status: "loading", access: null });
    resolveMyStaffRestaurantAccess(slug)
      .then((access) => {
        if (cancelled) return;
        if (access.success && access.restaurant_slug === slug) {
          setCheck({ slug, status: "allowed", access });
          return;
        }
        setCheck({ slug, status: "denied", access: null });
      })
      .catch(() => {
        if (!cancelled) setCheck({ slug, status: "error", access: null });
      });
    return () => { cancelled = true; };
  }, [revision, slug]);

  // A prior tenant's successful check is never authority for the current URL,
  // even for the render that precedes effect cleanup on a slug transition.
  const current = check.slug === slug;
  const authorized = current && check.status === "allowed" && check.access?.success === true
    && check.access.restaurant_slug === slug
    && ["owner", "admin", "manager", "staff", "supervisor"].includes(check.access.restaurant_role ?? "");
  if (!current || check.status === "loading") return <div className="auth-shell">Mitarbeiterzugang wird geprüft …</div>;
  if (check.status === "error") {
    return <main className="auth-shell" role="alert"><h1>Zugang konnte nicht geprüft werden</h1><p>Deine Anmeldung bleibt bestehen.</p><button onClick={() => setRevision((current) => current + 1)} type="button">Erneut versuchen</button></main>;
  }
  if (!authorized) {
    return <main className="auth-shell" role="alert"><h1>Kein Mitarbeiterzugang</h1><p>{t("auth.staffAccess.noScopedAccess")}</p></main>;
  }
  return <StaffPortalAccessContext.Provider value={check.access}>{children}</StaffPortalAccessContext.Provider>;
}
