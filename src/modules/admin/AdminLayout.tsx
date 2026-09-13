import { useEffect, useRef, useState } from "react";
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  ChevronDown,
  Gift,
  Home,
  Lock,
  LogOut,
  Menu,
  Newspaper,
  QrCode,
  ScrollText,
  Settings,
  Smartphone,
  Users,
} from "lucide-react";
import { AppDrawer } from "../../shared/components/AppDrawer";
import { RestaurantLogoStage } from "../../shared/components/RestaurantLogoStage";
import { useAuth } from "../auth/AuthProvider";
import { TenantSwitcher } from "../tenant/TenantSwitcher";
import { useTenant } from "../tenant/TenantProvider";
import { isSetupAllowedPath } from "./setupAllowedPath";
import "./admin-premium.css";
import { useI18n } from "../../shared/i18n/I18nProvider";
import { LanguageSelector } from "../../shared/i18n/LanguageSelector";
import { KassaAcknowledgementGate } from "../kassa/KassaAcknowledgementGate";

function readProfileName(user: ReturnType<typeof useAuth>["user"], fallback: string) {
  const metadataName = user?.user_metadata?.full_name ?? user?.user_metadata?.name;
  if (typeof metadataName === "string" && metadataName.trim()) {
    return metadataName.trim();
  }

  return user?.email?.split("@")[0] || fallback;
}

export function AdminLayout() {
  const { translateKey: t } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const { portalAccess, restaurantRole, signOut, user } = useAuth();
  const { activeRestaurant, branding, clearTenantState, loading } = useTenant();
  const restaurantStatus = activeRestaurant?.status ?? "draft";
  const restaurantStatusLabel =
    restaurantStatus === "active" ? t("owner.status.active") : restaurantStatus === "draft" ? t("owner.status.draft") : t("owner.status.blocked");
  const profileName = readProfileName(user, t("owner.profile.account"));
  const profileInitial = profileName.charAt(0).toLocaleUpperCase("de-AT") || "R";
  const profileRoleLabel = restaurantRole
    ? t(`owner.profile.${restaurantRole === "supervisor" ? "staff" : restaurantRole}`)
    : t("owner.profile.account");
  const onboardingStatus = activeRestaurant?.onboarding_status ?? "draft";
  const setupIncomplete = Boolean(activeRestaurant && onboardingStatus !== "ready" && onboardingStatus !== "completed");
  const isOnboardingRoute = location.pathname === "/admin/onboarding";
  const isSetupAllowedRoute = isSetupAllowedPath(location.pathname);
  const navItems = [
    { to: "/admin", label: t("owner.dashboard"), icon: Home, end: true },
    { to: "/admin/rewards", label: t("owner.rewards"), icon: Gift },
    { to: "/admin/welcome-gifts", label: t("owner.welcomeGifts"), icon: Gift },
    { to: "/admin/offers", label: t("owner.offers"), icon: Newspaper },
    { to: "/admin/customers", label: t("owner.customers"), icon: Users },
    { to: "/admin/qr", label: t("owner.qrCenter"), icon: QrCode },
    { to: "/admin/staff", label: t("owner.staff"), icon: Smartphone },
    { to: "/admin/reports", label: t("owner.reports"), icon: ScrollText },
    { to: "/admin/settings", label: t("owner.settings"), icon: Settings },
  ];

  useEffect(() => {
    setMobileMenuOpen(false);
    setProfileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMobileMenuOpen(false);
        setProfileMenuOpen(false);
      }
    }

    function handleResize() {
      if (window.innerWidth >= 1024) {
        setMobileMenuOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setProfileMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  async function handleLogout() {
    if (loggingOut) {
      return;
    }

    setLoggingOut(true);
    setMobileMenuOpen(false);
    setProfileMenuOpen(false);
    clearTenantState();
    let logoutMessage: string | undefined;

    try {
      await signOut();
    } catch {
      logoutMessage = t("owner.logoutError");
    } finally {
      clearTenantState();
      navigate("/restaurant/login", {
        replace: true,
        state: logoutMessage ? { logoutMessage } : null,
      });
    }
  }

  const profileMenu = (
    <div className="profile-menu desktop-profile-menu" ref={profileMenuRef}>
      <button
        aria-expanded={profileMenuOpen}
        aria-haspopup="menu"
        className="profile-menu-trigger"
        onClick={() => setProfileMenuOpen((current) => !current)}
        type="button"
      >
        <span aria-hidden="true" className="profile-menu-avatar">
          {profileInitial}
        </span>
        <span className="profile-menu-copy" title={user?.email ?? profileName}>
          <span className="profile-menu-label">{profileName}</span>
          <span className="profile-menu-role">{profileRoleLabel}</span>
        </span>
        <ChevronDown aria-hidden="true" className="profile-menu-chevron" size={16} />
      </button>
      {profileMenuOpen ? (
        <div className="profile-menu-popover" role="menu">
          {portalAccess.customer_access ? <button onClick={() => navigate("/customer")} role="menuitem" type="button"><ArrowRight aria-hidden="true" size={18} />{t("owner.profile.customerPortal")}</button> : null}
          {portalAccess.staff_access ? <button onClick={() => navigate(portalAccess.preferred_staff_slug ? `/staff/${encodeURIComponent(portalAccess.preferred_staff_slug)}` : "/staff")} role="menuitem" type="button"><ArrowRight aria-hidden="true" size={18} />{t("owner.profile.staffPortal")}</button> : null}
          {portalAccess.platform_access ? <button onClick={() => navigate("/platform-admin")} role="menuitem" type="button"><ArrowRight aria-hidden="true" size={18} />{t("owner.profile.platformPortal")}</button> : null}
          <button disabled={loggingOut} onClick={handleLogout} role="menuitem" type="button">
            <LogOut aria-hidden="true" size={18} />
            {loggingOut ? t("owner.logoutPending") : t("owner.logout")}
          </button>
        </div>
      ) : null}
    </div>
  );

  const renderNavigation = (variant: "sidebar" | "drawer") => (
    <nav aria-label={variant === "drawer" ? t("owner.menu") : t("owner.navigation")}>
      {navItems.map((item) => {
        const Icon = item.icon;
        const locked = setupIncomplete && !isSetupAllowedPath(item.to);
        if (locked) {
          return (
            <span
              aria-disabled="true"
              className="nav-link locked"
              key={item.to}
              role="link"
            >
              <Lock size={18} />
              {item.label}
            </span>
          );
        }

        return (
          <NavLink
            className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
            end={item.end}
            key={item.to}
            onClick={() => {
              if (variant === "drawer") {
                setMobileMenuOpen(false);
              }
            }}
            to={item.to}
          >
            <Icon size={18} />
            {item.label}
          </NavLink>
        );
      })}
    </nav>
  );

  if (loading) {
    return <div className="auth-shell">{t("owner.header.loading")}</div>;
  }

  if (setupIncomplete && !isSetupAllowedRoute) {
    return <Navigate to="/admin/onboarding" replace />;
  }

  if (isOnboardingRoute) {
    return (
      <div className="setup-shell">
        <Outlet
          context={{
            onboardingAccountAction: <div className="onboarding-account-actions"><LanguageSelector />{profileMenu}</div>,
            onboardingRestaurantAction: <TenantSwitcher />,
          }}
        />
      </div>
    );
  }

  const portal = (
    <div className="app-shell premium-owner-shell">
      <header className="topbar premium-owner-topbar">
        <div className="restaurant-brand-header admin-restaurant-brand">
          <RestaurantLogoStage className="restaurant-logo-frame" logoUrl={branding?.logo_url} name={activeRestaurant?.name ?? "Restaurant"} presentation={branding} primaryColor={branding?.primary_color} size="header" />
          <div className="restaurant-brand-copy">
            <span className="admin-brand-kicker">WUXUAI Bonus</span>
            <span className="restaurant-brand-title">{activeRestaurant?.name ?? t("owner.dashboardTitle")}</span>
            <span className="restaurant-brand-subtitle">{t("owner.header.area")}</span>
          </div>
        </div>
        <div className="owner-header-primary-actions">
          <LanguageSelector />
          <button
            aria-expanded={mobileMenuOpen}
            aria-label={t("owner.header.menuOpen")}
            className="button secondary mobile-menu-button"
            onClick={() => setMobileMenuOpen(true)}
            title={t("owner.menu")}
            type="button"
          >
            <Menu aria-hidden="true" size={18} />
            <span className="owner-mobile-menu-label">{t("owner.menu")}</span>
          </button>
        </div>
        <div className="topbar-actions owner-restaurant-context-actions">
          <span className="pill mobile-restaurant-status">{restaurantStatusLabel}</span>
          <span className={`restaurant-status-badge restaurant-status-${restaurantStatus}`}>
            <span aria-hidden="true" className="restaurant-status-dot" />
            {restaurantStatusLabel}
          </span>
          <TenantSwitcher />
          {profileMenu}
        </div>
      </header>
      <div className="layout">
        <aside className="sidebar premium-owner-sidebar">
          <div className="premium-sidebar-heading">
            <span>{t("owner.workspace")}</span>
            <strong>{t("owner.dashboardTitle")}</strong>
          </div>
          {renderNavigation("sidebar")}
          {setupIncomplete ? (
            <p className="sidebar-lock-message">
              {t("owner.setup.required")}
            </p>
          ) : null}
        </aside>
        <main className="content premium-owner-content">
          <Outlet />
        </main>
      </div>
      <AppDrawer
        description={t("owner.header.menuDescription")}
        footer={(
          <button className="mobile-menu-logout" disabled={loggingOut} onClick={handleLogout} type="button">
            <LogOut aria-hidden="true" size={18} />
            {loggingOut ? t("owner.logoutPending") : t("owner.logout")}
          </button>
        )}
        onClose={() => setMobileMenuOpen(false)}
        open={mobileMenuOpen}
        size="standard"
        title={t("owner.menu")}
      >
        <div className="mobile-menu-navigation">
          {renderNavigation("drawer")}
          {setupIncomplete ? (
            <p className="sidebar-lock-message">
              {t("owner.setup.required")}
            </p>
          ) : null}
        </div>
      </AppDrawer>
    </div>
  );
  return activeRestaurant && (restaurantRole === "owner" || restaurantRole === "admin")
    ? <KassaAcknowledgementGate restaurantId={activeRestaurant.id}>{portal}</KassaAcknowledgementGate>
    : portal;
}
