import type { ButtonHTMLAttributes, CSSProperties, HTMLAttributes, ReactNode } from "react";
import { Gift, Home, Info, LockKeyhole, QrCode, UserRound } from "lucide-react";
import { AppDrawer } from "../../../shared/components/AppDrawer";
import "../customer-premium.css";

export type CustomerView = "home" | "redemptions" | "collect" | "account";

type CustomerAppShellProps = {
  children: ReactNode;
  fontFamily?: string | null;
  primaryColor?: string | null;
};

export function AppShell({ children, fontFamily, primaryColor }: CustomerAppShellProps) {
  return (
    <main
      className="customer-premium-shell"
      style={{
        "--customer-brand": primaryColor ?? "#b88a3b",
        fontFamily: fontFamily ?? undefined,
      } as CSSProperties}
    >
      {children}
    </main>
  );
}

export function PageContainer({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`customer-page-container ${className}`.trim()}>{children}</div>;
}

type RestaurantLogoProps = {
  logoUrl?: string | null;
  name: string;
  primaryColor?: string | null;
};

export function RestaurantLogo({ logoUrl, name, primaryColor }: RestaurantLogoProps) {
  return (
    <span className="premium-restaurant-logo">
      {logoUrl ? (
        <img alt={`${name} Logo`} src={logoUrl} />
      ) : (
        <span aria-hidden="true" style={{ background: primaryColor ?? "#b88a3b" }}>
          {(name.trim().charAt(0) || "W").toUpperCase()}
        </span>
      )}
    </span>
  );
}

type CustomerHeaderProps = RestaurantLogoProps & {
  customerName?: string | null;
  onInfo: () => void;
  subtitle?: string;
};

export function CustomerHeader({ customerName, logoUrl, name, onInfo, primaryColor, subtitle = "Mein Bonus" }: CustomerHeaderProps) {
  return (
    <header className="premium-customer-header">
      <RestaurantLogo logoUrl={logoUrl} name={name} primaryColor={primaryColor} />
      <div>
        <span>{customerName ? `Willkommen zurück, ${customerName.split(" ")[0]}` : subtitle}</span>
        <strong>{name}</strong>
      </div>
      <button aria-label="So funktioniert's öffnen" className="premium-icon-button" onClick={onInfo} type="button">
        <Info aria-hidden="true" size={21} />
      </button>
    </header>
  );
}

type BottomNavigationProps = {
  activeView: CustomerView;
  onChange: (view: CustomerView) => void;
};

const navigationItems = [
  { label: "Start", value: "home" as const, icon: Home },
  { label: "Einlösen", value: "redemptions" as const, icon: Gift },
  { label: "Sammeln", value: "collect" as const, icon: QrCode },
  { label: "Konto", value: "account" as const, icon: UserRound },
];

export function BottomNavigation({ activeView, onChange }: BottomNavigationProps) {
  return (
    <nav aria-label="Mein Bonus Navigation" className="premium-bottom-navigation">
      {navigationItems.map(({ icon: Icon, label, value }) => (
        <button
          aria-current={activeView === value ? "page" : undefined}
          className={activeView === value ? "active" : ""}
          key={value}
          onClick={() => onChange(value)}
          type="button"
        >
          <Icon aria-hidden="true" size={21} />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}

export function SectionHeader({ action, subtitle, title }: { action?: ReactNode; subtitle?: string; title: string }) {
  return (
    <header className="premium-section-header">
      <div>
        <h2>{title}</h2>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {action}
    </header>
  );
}

type PremiumCardProps = HTMLAttributes<HTMLElement> & {
  children: ReactNode;
  variant?: "standard" | "highlight" | "success" | "information";
};

export function PremiumCard({ children, className = "", variant = "standard", ...props }: PremiumCardProps) {
  return (
    <article className={`premium-card premium-card-${variant} ${className}`.trim()} {...props}>
      {children}
    </article>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode };

export function PrimaryButton({ children, className = "", ...props }: ButtonProps) {
  return <button className={`premium-button premium-button-primary ${className}`.trim()} {...props}>{children}</button>;
}

export function SecondaryButton({ children, className = "", ...props }: ButtonProps) {
  return <button className={`premium-button premium-button-secondary ${className}`.trim()} {...props}>{children}</button>;
}

export function StatusBadge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "success" | "warning" | "error" }) {
  return <span className={`premium-status-badge ${tone}`}>{children}</span>;
}

export function ProgressBar({ label, value }: { label: string; value: number }) {
  const safeValue = Math.min(100, Math.max(0, value));
  return (
    <div className="premium-progress" aria-label={label} aria-valuemax={100} aria-valuemin={0} aria-valuenow={safeValue} role="progressbar">
      <span style={{ width: `${safeValue}%` }} />
    </div>
  );
}

type PointsCardProps = {
  boostLabel?: string | null;
  label: string;
  note: string;
  progress?: number;
  progressLabel?: string;
  value: string;
};

export function PointsCard({ boostLabel, label, note, progress, progressLabel = "Punktefortschritt", value }: PointsCardProps) {
  return (
    <PremiumCard className="premium-points-card" variant="highlight">
      <div className="premium-points-heading">
        <span>{label}</span>
        {boostLabel ? <StatusBadge tone="warning">{boostLabel}</StatusBadge> : null}
      </div>
      <strong className="premium-points-value">{value}</strong>
      {typeof progress === "number" ? <ProgressBar label={progressLabel} value={progress} /> : null}
      <p>{note}</p>
    </PremiumCard>
  );
}

export function RewardImage({ imageUrl, title }: { imageUrl?: string | null; title: string }) {
  return (
    <div className="premium-reward-image">
      {imageUrl ? <img alt={title} src={imageUrl} /> : <Gift aria-label={`Standardbild ${title}`} size={38} />}
    </div>
  );
}

type RewardCardProps = {
  category?: string | null;
  imageUrl?: string | null;
  locked?: boolean;
  meta: string;
  onOpen?: () => void;
  status: string;
  title: string;
};

export function RewardCard({ category, imageUrl, locked, meta, onOpen, status, title }: RewardCardProps) {
  return (
    <PremiumCard className={`premium-reward-card${locked ? " locked" : ""}`}>
      <div className="premium-reward-media">
        <RewardImage imageUrl={imageUrl} title={title} />
        {locked ? <span className="premium-lock-badge" aria-label="Noch gesperrt"><LockKeyhole aria-hidden="true" size={18} /></span> : null}
      </div>
      <div className="premium-reward-copy">
        {category ? <span>{category}</span> : null}
        <h3>{title}</h3>
        <strong>{meta}</strong>
        <p>{status}</p>
      </div>
      {onOpen ? <PrimaryButton onClick={onOpen}>Details ansehen</PrimaryButton> : null}
    </PremiumCard>
  );
}

type StateProps = { action?: ReactNode; description: string; title: string };

export function EmptyState({ action, description, title }: StateProps) {
  return <PremiumCard className="premium-state-card"><Gift aria-hidden="true" size={28} /><h3>{title}</h3><p>{description}</p>{action}</PremiumCard>;
}

export function LoadingState({ description = "Dein Bonus wird geladen." }: { description?: string }) {
  return <div className="premium-loading-state" role="status"><span aria-hidden="true" /><p>{description}</p></div>;
}

export function ErrorState({ action, description, title }: StateProps) {
  return <PremiumCard className="premium-state-card premium-error-state"><Info aria-hidden="true" size={28} /><h3>{title}</h3><p>{description}</p>{action}</PremiumCard>;
}

export const PremiumDrawer = AppDrawer;

export function ConfirmationDialog({ children, description, footer, onClose, open, title }: {
  children: ReactNode;
  description?: string;
  footer?: ReactNode;
  onClose: () => void;
  open: boolean;
  title: string;
}) {
  return <AppDrawer description={description} footer={footer} onClose={onClose} open={open} title={title}>{children}</AppDrawer>;
}
