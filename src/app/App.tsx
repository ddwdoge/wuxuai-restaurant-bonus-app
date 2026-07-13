import { lazy, Suspense } from "react";
import type { ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { ProtectedRoute } from "../modules/auth/ProtectedRoute";
import { LoginPage } from "../modules/auth/LoginPage";
import { GuestBonusInfoPage, PublicHome } from "../modules/public/PublicHome";
import { isSetupAllowedPath } from "../modules/admin/setupAllowedPath";
import { useTenant } from "../modules/tenant/TenantProvider";

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
const StaffPage = lazy(() =>
  import("../modules/admin/pages/StaffPage").then((module) => ({ default: module.StaffPage })),
);
const SettingsPage = lazy(() =>
  import("../modules/admin/pages/SettingsPage").then((module) => ({ default: module.SettingsPage })),
);
const PlatformAdminPage = lazy(() =>
  import("../modules/platform/PlatformAdminPage").then((module) => ({ default: module.PlatformAdminPage })),
);
const RestaurantOnboarding = lazy(() =>
  import("../modules/admin/pages/RestaurantOnboarding").then((module) => ({ default: module.RestaurantOnboarding })),
);
const StaffTablet = lazy(() => import("../modules/staff/StaffTablet").then((module) => ({ default: module.StaffTablet })));
const CustomerPortal = lazy(() =>
  import("../modules/customer/CustomerPortal").then((module) => ({ default: module.CustomerPortal })),
);
const ReferralLanding = lazy(() =>
  import("../modules/customer/ReferralLanding").then((module) => ({ default: module.ReferralLanding })),
);

function RouteLoading() {
  return <div className="auth-shell">Wird geladen...</div>;
}

function CustomerLoading() {
  return <div className="auth-shell">Mein Bonus wird geöffnet...</div>;
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
      <Route path="/register" element={withFallback(<RegisterPage />)} />
      <Route
        path="/admin"
        element={
          <ProtectedRoute allowedRoles={["owner", "admin", "manager"]}>
            <RestaurantSetupGate>{withFallback(<AdminLayout />, <AdminLoading />)}</RestaurantSetupGate>
          </ProtectedRoute>
        }
      >
        <Route index element={withFallback(<AdminDashboard />, <AdminLoading />)} />
        <Route path="onboarding" element={withFallback(<RestaurantOnboarding />, <AdminLoading />)} />
        <Route path="settings" element={withFallback(<SettingsPage />, <AdminLoading />)} />
        <Route path="settings/:section" element={withFallback(<SettingsPage />, <AdminLoading />)} />
        <Route path="branding" element={withFallback(<BrandingPage />, <AdminLoading />)} />
        <Route path="customers" element={withFallback(<CustomersPage />, <AdminLoading />)} />
        <Route path="loyalty" element={withFallback(<LoyaltyPage />, <AdminLoading />)} />
        <Route path="qr" element={withFallback(<QrCenterPage />, <AdminLoading />)} />
        <Route path="rewards" element={withFallback(<RewardsPage />, <AdminLoading />)} />
        <Route path="staff" element={withFallback(<StaffPage />, <AdminLoading />)} />
        <Route path="welcome-gifts" element={withFallback(<WelcomeGiftsPage />, <AdminLoading />)} />
      </Route>
      <Route
        path="/admin/platform"
        element={
          <ProtectedRoute
            allowedRoles={[
              "platform_owner",
              "platform_admin",
              "app_admin",
              "super_admin",
              "wuxuai_admin",
              "support",
              "billing_admin",
              "security_admin",
              "viewer",
            ]}
            roleScope="platform"
          >
            {withFallback(<PlatformAdminPage />, <PlatformLoading />)}
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/platform/restaurants/:restaurantId"
        element={
          <ProtectedRoute
            allowedRoles={[
              "platform_owner",
              "platform_admin",
              "app_admin",
              "super_admin",
              "wuxuai_admin",
              "support",
              "billing_admin",
              "security_admin",
              "viewer",
            ]}
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
            allowedRoles={[
              "platform_owner",
              "platform_admin",
              "app_admin",
              "super_admin",
              "wuxuai_admin",
              "support",
              "billing_admin",
              "security_admin",
              "viewer",
            ]}
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
            allowedRoles={[
              "platform_owner",
              "platform_admin",
              "app_admin",
              "super_admin",
              "wuxuai_admin",
              "support",
              "billing_admin",
              "security_admin",
              "viewer",
            ]}
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
      <Route path="/customer" element={<GuestBonusInfoPage />} />
      <Route path="/customer/:slug" element={withFallback(<CustomerPortal />, <CustomerLoading />)} />
      <Route path="/w/:slug" element={withFallback(<CustomerPortal />, <CustomerLoading />)} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
