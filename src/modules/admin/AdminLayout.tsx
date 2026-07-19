import { useEffect, useRef, useState } from "react";
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  ChevronDown,
  Gift,
  Home,
  Lock,
  LogOut,
  Menu,
  QrCode,
  Settings,
  Smartphone,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { TenantSwitcher } from "../tenant/TenantSwitcher";
import { useTenant } from "../tenant/TenantProvider";
import { isSetupAllowedPath } from "./setupAllowedPath";

export function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const { signOut, user } = useAuth();
  const { activeRestaurant, branding, clearTenantState, loading } = useTenant();
  const restaurantStatusLabel =
    activeRestaurant?.status === "active" ? "aktiv" : activeRestaurant?.status === "draft" ? "Entwurf" : "gesperrt";
  const onboardingStatus = activeRestaurant?.onboarding_status ?? "draft";
  const setupIncomplete = Boolean(activeRestaurant && onboardingStatus !== "ready" && onboardingStatus !== "completed");
  const isOnboardingRoute = location.pathname === "/admin/onboarding";
  const isSetupAllowedRoute = isSetupAllowedPath(location.pathname);
  const navItems = [
    { to: "/admin", label: "Dashboard", icon: Home, end: true },
    { to: "/admin/rewards", label: "Punkteeinlösung", icon: Gift },
    { to: "/admin/welcome-gifts", label: "Willkommensgeschenke", icon: Gift },
    { to: "/admin/customers", label: "Gäste", icon: Users },
    { to: "/admin/qr", label: "QR Center", icon: QrCode },
    { to: "/admin/staff", label: "Mitarbeiter", icon: Smartphone },
    { to: "/admin/settings", label: "Einstellungen", icon: Settings },
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
      logoutMessage = "Deine lokale Sitzung wurde beendet. Die Online-Abmeldung konnte gerade nicht vollständig bestätigt werden.";
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
        <UserRound aria-hidden="true" size={18} />
        <span className="profile-menu-label">{user?.email ?? "Restaurantkonto"}</span>
        <ChevronDown aria-hidden="true" size={16} />
      </button>
      {profileMenuOpen ? (
        <div className="profile-menu-popover" role="menu">
          <button disabled={loggingOut} onClick={handleLogout} role="menuitem" type="button">
            <LogOut aria-hidden="true" size={18} />
            {loggingOut ? "Abmeldung läuft..." : "Abmelden"}
          </button>
        </div>
      ) : null}
    </div>
  );

  const renderNavigation = (variant: "sidebar" | "drawer") => (
    <nav aria-label={variant === "drawer" ? "Restaurant Menü" : "Restaurant Portal Navigation"}>
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
    return <div className="auth-shell">Restaurant Portal wird geladen...</div>;
  }

  if (setupIncomplete && !isSetupAllowedRoute) {
    return <Navigate to="/admin/onboarding" replace />;
  }

  if (isOnboardingRoute) {
    return (
      <div className="setup-shell">
        <div className="setup-session-actions">
          {profileMenu}
          <button className="button secondary setup-mobile-logout" disabled={loggingOut} onClick={handleLogout} type="button">
            <LogOut size={18} />
            {loggingOut ? "Abmeldung läuft..." : "Abmelden"}
          </button>
        </div>
        <Outlet />
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="restaurant-brand-header admin-restaurant-brand">
          <span className="restaurant-logo-frame">
            {branding?.logo_url ? (
              <img
                alt={`${activeRestaurant?.name ?? "Restaurant"} Logo`}
                className="restaurant-logo-image"
                src={branding.logo_url}
              />
            ) : (
              <span className="restaurant-logo-placeholder">
                {(activeRestaurant?.name.trim().charAt(0) || "W").toUpperCase()}
              </span>
            )}
          </span>
          <div className="restaurant-brand-copy">
            <span className="admin-brand-kicker">WUXUAI Bonus</span>
            <span className="restaurant-brand-title">{activeRestaurant?.name ?? "Restaurant Portal"}</span>
            <span className="restaurant-brand-subtitle">Restaurant Portal</span>
          </div>
        </div>
        <div className="topbar-actions">
          <span className="pill">{restaurantStatusLabel}</span>
          <TenantSwitcher />
          {profileMenu}
        </div>
        <button
          aria-expanded={mobileMenuOpen}
          aria-label="Restaurant Menü öffnen"
          className="button secondary mobile-menu-button"
          onClick={() => setMobileMenuOpen(true)}
          type="button"
        >
          <Menu size={18} />
          Menü
        </button>
      </header>
      <div className="layout">
        <aside className="sidebar">
          {renderNavigation("sidebar")}
          {setupIncomplete ? (
            <p className="sidebar-lock-message">
              Bitte beende zuerst die Einrichtung. Danach wird dein Restaurant-Arbeitsbereich freigeschaltet.
            </p>
          ) : null}
        </aside>
        <main className="content">
          <Outlet />
        </main>
      </div>
      {mobileMenuOpen ? (
        <div className="mobile-menu-backdrop" onClick={() => setMobileMenuOpen(false)} role="presentation">
          <aside
            aria-label="Restaurant Menü"
            className="mobile-menu-drawer"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mobile-menu-header">
              <strong>Restaurant Menü</strong>
              <button className="button secondary mobile-menu-close" onClick={() => setMobileMenuOpen(false)} type="button">
                <X size={18} />
                Schließen
              </button>
            </div>
            {renderNavigation("drawer")}
            {setupIncomplete ? (
              <p className="sidebar-lock-message">
                Bitte beende zuerst die Einrichtung. Danach wird dein Restaurant-Arbeitsbereich freigeschaltet.
              </p>
            ) : null}
            <button className="mobile-menu-logout" disabled={loggingOut} onClick={handleLogout} type="button">
              <LogOut aria-hidden="true" size={18} />
              {loggingOut ? "Abmeldung läuft..." : "Abmelden"}
            </button>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
