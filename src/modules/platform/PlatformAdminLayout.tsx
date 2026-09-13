import { useState, type ReactNode } from "react";
import { Activity, Building2, Globe2, HeartPulse, LayoutDashboard, Menu, PackageCheck, Settings2 } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { AppDrawer } from "../../shared/components/AppDrawer";
import { LanguageSelector } from "../../shared/i18n/LanguageSelector";
import { useI18n } from "../../shared/i18n/I18nProvider";
import { platformAdminNavigationMessages, type PlatformAdminSection } from "./platformAdminNavigationI18n";

type PlatformAdminLayoutProps = {
  children: ReactNode;
  className?: string;
  description: string;
  title: string;
  toolbar?: ReactNode;
};

const items: Array<{ key: PlatformAdminSection; path: string; icon: typeof LayoutDashboard }> = [
  { key: "overview", path: "/admin/platform", icon: LayoutDashboard },
  { key: "businesses", path: "/admin/platform/businesses", icon: Building2 },
  { key: "plans", path: "/admin/platform/plans", icon: PackageCheck },
  { key: "countries", path: "/admin/platform/countries", icon: Globe2 },
  { key: "health", path: "/admin/platform/health", icon: HeartPulse },
  { key: "audit", path: "/admin/platform/audit", icon: Activity },
  { key: "system", path: "/admin/platform/system", icon: Settings2 },
];

function isActiveSection(pathname: string, key: PlatformAdminSection) {
  if (key === "overview") return pathname === "/admin/platform" || pathname === "/platform-admin";
  if (key === "businesses") return pathname.startsWith("/admin/platform/businesses") || pathname.startsWith("/admin/platform/restaurants") || pathname === "/platform-admin/restaurants";
  return pathname.startsWith(`/admin/platform/${key}`);
}

function Navigation({ close }: { close?: () => void }) {
  const { language } = useI18n();
  const pathname = useLocation().pathname;
  const t = platformAdminNavigationMessages(language);
  return <nav aria-label={t.navigation} className="platform-admin-navigation">
    {items.map(({ key, path, icon: Icon }) => {
      const active = isActiveSection(pathname, key);
      return <NavLink aria-current={active ? "page" : undefined} className={active ? "active" : undefined} key={key} onClick={close} to={path}>
        <Icon aria-hidden="true" size={19} />
        <span>{t[key]}</span>
        {active ? <strong aria-hidden="true">●</strong> : null}
      </NavLink>;
    })}
  </nav>;
}

export function PlatformAdminLayout({ children, className = "", description, title, toolbar }: PlatformAdminLayoutProps) {
  const { language } = useI18n();
  const t = platformAdminNavigationMessages(language);
  const [menuOpen, setMenuOpen] = useState(false);

  return <main className={`platform-admin-shell platform-admin-layout${className ? ` ${className}` : ""}`}>
    <header className="platform-admin-header">
      <div className="platform-admin-header-primary">
        <div className="platform-admin-header-identity"><span className="admin-brand-kicker">WUXUAI Admin</span><h1>{title}</h1></div>
        <div className="platform-admin-header-primary-actions">
          <LanguageSelector />
          <button aria-expanded={menuOpen} aria-haspopup="dialog" className="button secondary platform-admin-menu-trigger" onClick={() => setMenuOpen(true)} type="button">
            <Menu aria-hidden="true" size={20} /><span className="platform-admin-menu-label">{t.adminMenu}</span>
          </button>
        </div>
      </div>
      <p className="platform-admin-header-description">{description}</p>
      {toolbar ? <div className="platform-admin-header-toolbar">{toolbar}</div> : null}
    </header>

    <div className="platform-admin-workspace">
      <aside className="platform-admin-sidebar"><Navigation /></aside>
      <div className="platform-admin-content">{children}</div>
    </div>

    <AppDrawer className="platform-admin-menu-drawer" closeLabel={t.close} description={t.navigation} onClose={() => setMenuOpen(false)} open={menuOpen} size="compact" title={t.adminMenu}>
      <Navigation close={() => setMenuOpen(false)} />
    </AppDrawer>
  </main>;
}
