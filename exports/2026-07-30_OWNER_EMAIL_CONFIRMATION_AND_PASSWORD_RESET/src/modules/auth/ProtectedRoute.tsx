import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthProvider";
import type { UserRole } from "../../shared/types/domain";
import { isOwnerEmailConfirmed } from "./ownerAuthFlow.mjs";

type ProtectedRouteProps = {
  allowedRoles: UserRole[];
  children: React.ReactNode;
  roleScope?: "restaurant" | "platform";
  requireConfirmedEmail?: boolean;
};

export function ProtectedRoute({ allowedRoles, children, roleScope = "restaurant", requireConfirmedEmail = false }: ProtectedRouteProps) {
  const { loading, platformRole, restaurantRole, user } = useAuth();
  const location = useLocation();
  const activeRole = roleScope === "platform" ? platformRole : restaurantRole;

  if (loading) {
    return <div className="auth-shell">Lade Sitzung...</div>;
  }

  if (!user) {
    return <Navigate to="/restaurant/login" state={{ from: location }} replace />;
  }

  if (requireConfirmedEmail && !isOwnerEmailConfirmed(user)) {
    return <Navigate to="/auth/confirm-email" state={{ email: user.email ?? "" }} replace />;
  }

  if (!activeRole || !allowedRoles.includes(activeRole)) {
    if (roleScope === "platform") {
      return <div className="auth-shell">Du hast keinen Zugriff auf diese Seite.</div>;
    }
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
