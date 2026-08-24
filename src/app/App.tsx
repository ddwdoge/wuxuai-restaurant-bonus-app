import { lazy, Suspense, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Navigate, Route, Routes, useLocation, useSearchParams } from "react-router-dom";
import { ProtectedRoute } from "../modules/auth/ProtectedRoute";
import { LoginPage } from "../modules/auth/LoginPage";
import { AuthCallbackPage } from "../modules/auth/AuthCallbackPage";
import { ConfirmEmailPage } from "../modules/auth/ConfirmEmailPage";
import { ForgotPasswordPage } from "../modules/auth/ForgotPasswordPage";
import { UpdatePasswordPage } from "../modules/auth/UpdatePasswordPage";
import { PublicHome } from "../modules/public/PublicHome";
import { OwnerLegalErrorBoundary } from "../modules/legal/OwnerLegalErrorBoundary";
import { isSetupAllowedPath } from "../modules/admin/setupAllowedPath";
import { useTenant } from "../modules/tenant/TenantProvider";
import { useAuth } from "../modules/auth/AuthProvider";
import { PLATFORM_ADMIN_ROLES } from "../modules/platform/platformAdminAuthorization.mjs";
import {
  customerPortalInstanceKey,
  readCustomerScanContext,
} from "../modules/customer/customerScanContext.mjs";

const RegisterPage = lazy(() => import("../modules/auth/RegisterPage").then((module) => ({ default: module.RegisterPage })));
const AdminLayout = lazy(() => import("../modules/admin/AdminLayout").then((module) => ({ default: module.AdminLayout })));
const AdminDashboard = lazy(() =>
  import("../modules/admin/pages/AdminDashboard").then((module) => ({ default: module.AdminDashboard })),
);
const BrandingPage = lazy(() =>
  import("../modules/admin/pages/BrandingPage").then((module) => ({ default: module.BrandingPage })),
);
const CustomersPage = lazy(() =>
  import("../modules/admin/pages/CustomersPage").then((module) => ({ default: module.CustomersPage })),
);
const LoyaltyPage = lazy(() =>
  import("../modules/admin/pages/LoyaltyPage").then((module) => ({ default: module.LoyaltyPage })),
);
const QrCenterPage = lazy(() =>
  import("../modules/admin/pages/QrCenterPage").then((module) => ({ default: module.QrCenterPage })),
);
const RewardsPage = lazy(() =>
  import("../modules/admin/pages/RewardsPage").then((module) => ({ default: module.RewardsPage })),
);
const WelcomeGiftsPage = lazy(() =>
  import("../modules/admin/pages/WelcomeGiftsPage").then((module) => ({ default: module.WelcomeGiftsPage })),
);
const RestaurantOffersPage = lazy(() =>
  import("../modules/admin/pages/RestaurantOffersPage").then((module) => ({ default: module.RestaurantOffersPage })),
);
const StaffPage = lazy(() =>
  import("../modules/admin/pages/StaffPage").then((module) => ({ default: module.StaffPage })),
);
const SettingsPage = lazy(() =>
  import("../modules/admin/pages/SettingsPage").then((module) => ({ default: module.SettingsPage })),
);
const PlatformAdminPage = lazy(() =>
  import("../modules/platform/PlatformAdminPage").then((module) => ({ default: module.PlatformAdminPage })),
);
const PlatformAuditPage = lazy(() =>
  import("../modules/platform/PlatformAuditPage").then((module) => ({ default: module.PlatformAuditPage })),
);
const RestaurantOnboarding = lazy(() =>
  import("../modules/admin/pages/RestaurantOnboarding").then((module) => ({ default: module.RestaurantOnboarding })),
);
const StaffTablet = lazy(() => import("../modules/staff/StaffTablet").then((module) => ({ default: module.StaffTablet })));
const PartnerRestaurantFinderPage = lazy(() =>
  import("../modules/customer/PartnerRestaurantFinderPage").then((module) => ({ default: module.PartnerRestaurantFinderPage })),
);
const CustomerOffersPage = lazy(() =>
  import("../modules/customer/CustomerOffersPage").then((module) => ({ default: module.CustomerOffersPage })),
);
const CentralCustomerPage = lazy(() =>
  import("../modules/customer/CentralCustomerPage").then((module) => ({ default: module.CentralCustomerPage })),
);
const CustomerEmailActionPage = lazy(() =>
  import("../modules/customer/CustomerEmailActionPage").then((module) => ({ default: module.CustomerEmailActionPage })),
);
const CustomerAuthPage = lazy(() =>
  import("../modules/customer/CustomerAuthPage").then((module) => ({ default: module.CustomerAuthPage })),
);
const CustomerAuthCallbackPage = lazy(() =>
  import("../modules/customer/CustomerAuthCallbackPage").then((module) => ({ default: module.CustomerAuthCallbackPage })),
);
const CustomerRestaurantAccess = lazy(() =>
  import("../modules/customer/CustomerRestaurantAccess").then((module) => ({ default: module.CustomerRestaurantAccess })),
);
const LegalCenterPage = lazy(() =>
  import("../modules/legal/LegalCenterPage").then((module) => ({ default: module.LegalCenterPage })),
);
const OwnerLegalSettingsPage = lazy(() =>
  import("../modules/legal/OwnerLegalSettingsPage").then((module) => ({ default: module.OwnerLegalSettingsPage })),
);
const ProgramTerminationPage = lazy(() =>
  import("../modules/legal/ProgramTerminationPage").then((module) => ({ default: module.ProgramTerminationPage })),
);
const BonusActivityReportsPage = lazy(() =>
  import("../modules/reports/BonusActivityReportsPage").then((module) => ({ default: module.BonusActivityReportsPage })),
);
const ReferralLanding = lazy(() =>
  import("../modules/customer/ReferralLanding").then((module) => ({ default: module.ReferralLanding })),
);

function RouteLoading() {
  return <div className="auth-shell">Wird geladen...</div>;
}

function CustomerLoading() {
  return <div className="auth-shell">Dein Bonuskonto wird erkannt …</div>;
}

function AdminLoading() {
  return <div className="auth-shell">Restaurant Portal wird geladen...</div>;
}

function StaffLoading() {
  return <div className="auth-shell">Mitarbeiterbereich wird geladen...</div>;
}

function PlatformLoading() {
  return <div className="auth-shell">WUXUAI Admin wird geladen...</div>;
}

function withFallback(children: ReactNode, fallback: ReactNode = <RouteLoading />) {
  return <Suspense fallback={fallback}>{children}</Suspense>;
}

function CustomerPortalRoute() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const customerToken = searchParams.get("token") ?? "";
  const [historyRevision, setHistoryRevision] = useState(0);
  const scanContext = readCustomerScanContext(location.pathname);

  useEffect(() => {
    function handlePageShow(event: PageTransitionEvent) {
      if (event.persisted) setHistoryRevision((current) => current + 1);
    }

    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);

  if (!scanContext) return <Navigate to="/customer" replace />;

  return withFallback(
    <CustomerRestaurantAccess
      isBonusCollection={scanContext.routeKind === "collect"}
      key={customerPortalInstanceKey(scanContext, customerToken, historyRevision)}
      restaurantSlug={scanContext.restaurantSlug}
    />,
    <CustomerLoading />,
  );
}

function CustomerCentralRoute({ children }: { children: ReactNode }) {
  const { loading, user } = useAuth();
  const location = useLocation();
  if (loading) return <CustomerLoading />;
  if (!user) return <Navigate replace to={`/customer/login?returnTo=${encodeURIComponent(`${location.pathname}${location.search}`)}`} />;
  return <>{children}</>;
}

function RestaurantSetupGate({ children }: { children: ReactNode }) {
  const { activeRestaurant, loading } = useTenant();
  const location = useLocation();
  const isSetupAllowedRoute = isSetupAllowedPath(location.pathname);
  const onboardingStatus = activeRestaurant?.onboarding_status ?? "draft";
  const onboardingCompleted = onboardingStatus === "ready" || onboardingStatus === "completed";

  if (loading) {
    return <AdminLoading />;
  }

  if (activeRestaurant && !onboardingCompleted && !isSetupAllowedRoute) {
    return <Navigate to="/admin/onboarding" replace />;
  }

  return <>{children}</>;
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<PublicHome />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/restaurant/login" element={<LoginPage />} />
      <Route path="/register" element={withFallback(<RegisterPage />)} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route path="/auth/confirm-email" element={<ConfirmEmailPage />} />
      <Route path="/auth/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/auth/update-password" element={<UpdatePasswordPage />} />
      <Route
        path="/admin"
        element={
          <ProtectedRoute allowedRoles={["owner", "admin", "manager"]} requireConfirmedEmail>
            <RestaurantSetupGate>{withFallback(<AdminLayout />, <AdminLoading />)}</RestaurantSetupGate>
          </ProtectedRoute>
        }
      >
        <Route index element={withFallback(<AdminDashboard />, <AdminLoading />)} />
        <Route path="onboarding" element={withFallback(<RestaurantOnboarding />, <AdminLoading />)} />
        <Route path="settings" element={withFallback(<SettingsPage />, <AdminLoading />)} />
        <Route path="settings/program-end" element={withFallback(<ProgramTerminationPage />, <AdminLoading />)} />
        <Route path="settings/:section" element={withFallback(<SettingsPage />, <AdminLoading />)} />
        <Route path="branding" element={withFallback(<BrandingPage />, <AdminLoading />)} />
        <Route path="customers" element={withFallback(<CustomersPage />, <AdminLoading />)} />
        <Route path="loyalty" element={withFallback(<LoyaltyPage />, <AdminLoading />)} />
        <Route path="qr" element={withFallback(<QrCenterPage />, <AdminLoading />)} />
        <Route path="rewards" element={withFallback(<RewardsPage />, <AdminLoading />)} />
        <Route path="staff" element={withFallback(<StaffPage />, <AdminLoading />)} />
        <Route path="welcome-gifts" element={withFallback(<WelcomeGiftsPage />, <AdminLoading />)} />
        <Route path="offers" element={withFallback(<RestaurantOffersPage />, <AdminLoading />)} />
        <Route path="reports" element={withFallback(<BonusActivityReportsPage />, <AdminLoading />)} />
        <Route path="legal" element={withFallback(<OwnerLegalErrorBoundary><OwnerLegalSettingsPage /></OwnerLegalErrorBoundary>, <AdminLoading />)} />
      </Route>
      <Route
        path="/admin/platform"
        element={
          <ProtectedRoute
            allowedRoles={[...PLATFORM_ADMIN_ROLES]}
            roleScope="platform"
          >
            {withFallback(<PlatformAdminPage />, <PlatformLoading />)}
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/platform/audit"
        element={
          <ProtectedRoute
            allowedRoles={[...PLATFORM_ADMIN_ROLES]}
            roleScope="platform"
          >
            {withFallback(<PlatformAuditPage />, <PlatformLoading />)}
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/platform/restaurants/:restaurantId"
        element={
          <ProtectedRoute
            allowedRoles={[...PLATFORM_ADMIN_ROLES]}
            roleScope="platform"
          >
            {withFallback(<PlatformAdminPage />, <PlatformLoading />)}
          </ProtectedRoute>
        }
      />
      <Route
        path="/platform-admin"
        element={
          <ProtectedRoute
            allowedRoles={[...PLATFORM_ADMIN_ROLES]}
            roleScope="platform"
          >
            {withFallback(<PlatformAdminPage />, <PlatformLoading />)}
          </ProtectedRoute>
        }
      />
      <Route
        path="/platform-admin/restaurants"
        element={
          <ProtectedRoute
            allowedRoles={[...PLATFORM_ADMIN_ROLES]}
            roleScope="platform"
          >
            {withFallback(<PlatformAdminPage />, <PlatformLoading />)}
          </ProtectedRoute>
        }
      />
      <Route
        path="/staff/:slug"
        element={
          <ProtectedRoute allowedRoles={["staff", "supervisor", "owner", "admin", "manager"]}>
            <RestaurantSetupGate>{withFallback(<StaffTablet />, <StaffLoading />)}</RestaurantSetupGate>
          </ProtectedRoute>
        }
      />
      <Route path="/r/:restaurantSlug/:referralToken" element={withFallback(<ReferralLanding />, <CustomerLoading />)} />
      <Route path="/customer/login" element={withFallback(<CustomerAuthPage mode="login" />, <CustomerLoading />)} />
      <Route path="/customer/register" element={withFallback(<CustomerAuthPage mode="register" />, <CustomerLoading />)} />
      <Route path="/customer/auth/callback" element={withFallback(<CustomerAuthCallbackPage />, <CustomerLoading />)} />
      <Route path="/customer" element={<CustomerCentralRoute>{withFallback(<CentralCustomerPage view="home" />, <CustomerLoading />)}</CustomerCentralRoute>} />
      <Route path="/customer/locations" element={<CustomerCentralRoute>{withFallback(<CentralCustomerPage view="locations" />, <CustomerLoading />)}</CustomerCentralRoute>} />
      <Route path="/customer/account" element={<CustomerCentralRoute>{withFallback(<CentralCustomerPage view="account" />, <CustomerLoading />)}</CustomerCentralRoute>} />
      <Route path="/customer/email/confirm" element={withFallback(<CustomerEmailActionPage action="confirm" />, <CustomerLoading />)} />
      <Route path="/customer/email/unsubscribe" element={withFallback(<CustomerEmailActionPage action="unsubscribe" />, <CustomerLoading />)} />
      <Route path="/customer/restaurants" element={<CustomerCentralRoute>{withFallback(<PartnerRestaurantFinderPage />, <CustomerLoading />)}</CustomerCentralRoute>} />
      <Route path="/customer/:slug/offers" element={<CustomerCentralRoute>{withFallback(<CustomerOffersPage />, <CustomerLoading />)}</CustomerCentralRoute>} />
      <Route path="/legal/:slug" element={withFallback(<LegalCenterPage />, <CustomerLoading />)} />
      <Route path="/customer/:slug" element={<CustomerPortalRoute />} />
      <Route path="/w/:slug" element={<CustomerPortalRoute />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
