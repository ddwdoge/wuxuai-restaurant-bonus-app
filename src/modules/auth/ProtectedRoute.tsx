import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthProvider";
import type { UserRole } from "../../shared/types/domain";
import { isOwnerEmailConfirmed } from "./ownerAuthFlow.mjs";
import { buildStaffLoginPath, staffSlugFromLegacyPath } from "./staffLoginFlow.mjs";

type ProtectedRouteProps = {
  allowedRoles: UserRole[];
  children: React.ReactNode;
  roleScope?: "restaurant" | "platform";
  requireConfirmedEmail?: boolean;
};

export function ProtectedRoute({ allowedRoles, children, roleScope = "restaurant", requireConfirmedEmail = false }: ProtectedRouteProps) {
  const {
    loading,
    platformRole,
    restaurantAuthorizationError,
    restaurantRole,
    retryAuthorization,
    user,
  } = useAuth();
  const location = useLocation();
  const activeRole = roleScope === "platform" ? platformRole : restaurantRole;

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
        <h1>Restaurantzugang konnte nicht geladen werden</h1>
        <p>Deine Anmeldung bleibt bestehen. Bitte prüfe den Restaurantzugang erneut.</p>
        <button onClick={retryAuthorization} type="button">Erneut versuchen</button>
      </main>
    );
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
        <h1>Kein Restaurantzugang eingerichtet</h1>
        <p>Für dieses Konto ist aktuell kein Restaurant hinterlegt. Deine Anmeldung bleibt bestehen.</p>
        <button onClick={retryAuthorization} type="button">Erneut prüfen</button>
      </main>
    );
  }

  return <>{children}</>;
}
