import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthProvider";
import type { UserRole } from "../../shared/types/domain";
import { isOwnerEmailConfirmed } from "./ownerAuthFlow.mjs";
import { buildStaffLoginPath, staffSlugFromLegacyPath } from "./staffLoginFlow.mjs";
import type { PortalKind } from "./portalAccessUx.mjs";
import { WrongPortalNotice } from "./WrongPortalNotice";
import { useI18n } from "../../shared/i18n/I18nProvider";

type ProtectedRouteProps = {
  allowedRoles: UserRole[];
  children: React.ReactNode;
  roleScope?: "restaurant" | "platform";
  requireConfirmedEmail?: boolean;
  portalKind?: Exclude<PortalKind, "customer">;
};

export function ProtectedRoute({ allowedRoles, children, portalKind, roleScope = "restaurant", requireConfirmedEmail = false }: ProtectedRouteProps) {
  const { translateKey: t } = useI18n();
  const {
    loading,
    platformRole,
    portalAccess,
    portalAccessError,
    restaurantAuthorizationError,
    restaurantRole,
    retryAuthorization,
    user,
  } = useAuth();
  const location = useLocation();
  const effectivePortalKind = portalKind ?? (location.pathname === "/staff" || staffSlugFromLegacyPath(location.pathname) ? "staff" : undefined);
  const activeRole = roleScope === "platform" ? platformRole : restaurantRole;
  const portalAllowed = effectivePortalKind === "owner"
    ? portalAccess.owner_access
    : effectivePortalKind === "staff"
      ? portalAccess.staff_access
      : effectivePortalKind === "platform"
        ? portalAccess.platform_access
        : true;

  if (loading) {
    return <div className="auth-shell">Lade Sitzung...</div>;
  }

  if (!user) {
    const staffSlug = staffSlugFromLegacyPath(location.pathname);
    const loginPath = location.pathname === "/staff" || staffSlug
      ? buildStaffLoginPath(staffSlug)
      : "/restaurant/login";
    return <Navigate to={loginPath} state={{ from: location }} replace />;
  }

  if (requireConfirmedEmail && !isOwnerEmailConfirmed(user)) {
    return <Navigate to="/auth/confirm-email" state={{ email: user.email ?? "" }} replace />;
  }

  if (roleScope === "restaurant" && restaurantAuthorizationError) {
    return (
      <main className="auth-shell" role="alert">
        <h1>{t("errors.businessAccess")}</h1>
        <p>{t("errors.businessAccessRetry")}</p>
        <button onClick={retryAuthorization} type="button">Erneut versuchen</button>
      </main>
    );
  }

  if (portalAccessError) {
    return (
      <main className="auth-shell" role="alert">
        <h1>Zugang konnte nicht geprüft werden</h1>
        <p>Deine Anmeldung bleibt bestehen. Bitte prüfe den Zugang erneut.</p>
        <button onClick={retryAuthorization} type="button">Erneut versuchen</button>
      </main>
    );
  }

  if (effectivePortalKind && !portalAllowed) {
    return <WrongPortalNotice portal={effectivePortalKind} staffSlug={staffSlugFromLegacyPath(location.pathname)} />;
  }

  if (!activeRole || !allowedRoles.includes(activeRole)) {
    const staffSlug = staffSlugFromLegacyPath(location.pathname);
    if (location.pathname === "/staff" || staffSlug) {
      return <Navigate to={buildStaffLoginPath(staffSlug)} replace />;
    }
    if (roleScope === "platform") {
      return <div className="auth-shell">Du hast keinen Zugriff auf diese Seite.</div>;
    }
    return (
      <main className="auth-shell" role="alert">
        <h1>{t("errors.noBusinessAccess")}</h1>
        <p>{t("errors.noBusinessAssigned")}</p>
        <button onClick={retryAuthorization} type="button">Erneut prüfen</button>
      </main>
    );
  }

  return <>{children}</>;
}
