import type { ButtonHTMLAttributes, CSSProperties, HTMLAttributes, ReactNode } from "react";
import { CheckCircle2, Clock3, Gift, Home, Info, LoaderCircle, LockKeyhole, ScanLine, UserRound } from "lucide-react";
import { AppDrawer } from "../../../shared/components/AppDrawer";
import { RewardImageFrame } from "../../../shared/components/RewardImageFrame";
import type { RewardImageCrop } from "../../../shared/rewardImageCrop";
import "../customer-premium.css";

export type CustomerView = "home" | "redemptions" | "collect" | "account";

type CustomerAppShellProps = {
  children: ReactNode;
  className?: string;
  fontFamily?: string | null;
  primaryColor?: string | null;
};

export function AppShell({ children, className = "", fontFamily, primaryColor }: CustomerAppShellProps) {
  return (
    <main
      className={`customer-premium-shell ${className}`.trim()}
      style={{
        "--customer-brand": primaryColor ?? "#b88a3b",
        fontFamily: fontFamily
          ? `"${fontFamily}", Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
          : undefined,
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
  compact?: boolean;
  customerName?: string | null;
  onInfo: () => void;
  subtitle?: string;
};

export function CustomerHeader({ compact = false, logoUrl, name, onInfo, primaryColor, subtitle = "Meine Vorteile" }: CustomerHeaderProps) {
  return (
    <header className={`premium-customer-header${compact ? " compact" : ""}`}>
      <RestaurantLogo logoUrl={logoUrl} name={name} primaryColor={primaryColor} />
      <div>
        {!compact ? <span>{subtitle}</span> : null}
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
  { label: "Sammeln", value: "collect" as const, icon: ScanLine, primary: true },
  { label: "Konto", value: "account" as const, icon: UserRound },
];

export function BottomNavigation({ activeView, onChange }: BottomNavigationProps) {
  return (
    <nav aria-label="Meine Vorteile Navigation" className="premium-bottom-navigation">
      {navigationItems.map(({ icon: Icon, label, primary, value }) => (
        <button
          aria-current={activeView === value ? "page" : undefined}
          aria-label={primary ? "Punkte sammeln" : undefined}
          className={`${activeView === value ? "active " : ""}${primary ? "primary-action" : ""}`.trim()}
          key={value}
          onClick={() => onChange(value)}
          type="button"
        >
          <span className="premium-navigation-icon"><Icon aria-hidden="true" size={primary ? 24 : 21} /></span>
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

type BenefitTileProps = {
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  status: string;
};

export function BenefitTile({ disabled = false, icon, label, onClick, status }: BenefitTileProps) {
  const content = (
    <>
      <span className="premium-benefit-icon" aria-hidden="true">{icon}</span>
      <strong>{label}</strong>
      <span>{status}</span>
    </>
  );

  return onClick ? (
    <button className="premium-benefit-tile interactive" disabled={disabled} onClick={onClick} type="button">{content}</button>
  ) : (
    <article className="premium-benefit-tile">{content}</article>
  );
}

export function RewardImage({ crop, imageUrl, title }: { crop?: Partial<RewardImageCrop> | null; imageUrl?: string | null; title: string }) {
  return (
    <div className="premium-reward-image">
      {imageUrl ? <RewardImageFrame alt={title} crop={crop} imageUrl={imageUrl} /> : <Gift aria-label={`Standardbild ${title}`} size={38} />}
    </div>
  );
}

export type RewardCardState = "available" | "locked" | "redeeming" | "redeemed" | "expired";

type RewardCardProps = {
  actionLabel?: string;
  category?: string | null;
  imageUrl?: string | null;
  imageCrop?: Partial<RewardImageCrop> | null;
  meta: string;
  onOpen?: () => void;
  state: RewardCardState;
  status: string;
  title: string;
};

const rewardStateMeta: Record<RewardCardState, { icon: typeof LockKeyhole; label: string }> = {
  available: { icon: CheckCircle2, label: "Einlösbar" },
  locked: { icon: LockKeyhole, label: "Noch gesperrt" },
  redeeming: { icon: LoaderCircle, label: "Einlösung läuft" },
  redeemed: { icon: CheckCircle2, label: "Eingelöst" },
  expired: { icon: Clock3, label: "Abgelaufen" },
};

export function RewardCard({ actionLabel = "Details ansehen", category, imageCrop, imageUrl, meta, onOpen, state, status, title }: RewardCardProps) {
  const stateMeta = rewardStateMeta[state];
  const StateIcon = stateMeta.icon;

  return (
    <PremiumCard className={`premium-reward-card state-${state}`}>
      <div className="premium-reward-media">
        <RewardImage crop={imageCrop} imageUrl={imageUrl} title={title} />
        {state !== "available" ? (
          <span className="premium-lock-badge" aria-label={stateMeta.label}>
            <StateIcon aria-hidden="true" size={18} />
          </span>
        ) : null}
      </div>
      <div className="premium-reward-copy">
        {category ? <span>{category}</span> : null}
        <h3>{title}</h3>
        <strong>{meta}</strong>
        <p className={`premium-reward-status state-${state}`}><StateIcon aria-hidden="true" size={14} /> {status}</p>
      </div>
      {onOpen ? (
        state === "available"
          ? <PrimaryButton aria-label={`${title}: ${actionLabel}`} onClick={onOpen}>{actionLabel}</PrimaryButton>
          : <SecondaryButton aria-label={`${title}: ${actionLabel}`} onClick={onOpen}>{actionLabel}</SecondaryButton>
      ) : null}
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
