import type { ButtonHTMLAttributes, CSSProperties, HTMLAttributes, ReactNode } from "react";
import { CheckCircle2, ChevronDown, ChevronRight, Clock3, Gift, Home, Info, LoaderCircle, LockKeyhole, ScanLine, UserRound } from "lucide-react";
import { AppDrawer } from "../../../shared/components/AppDrawer";
import { RestaurantLogoStage, type RestaurantLogoPresentation } from "../../../shared/components/RestaurantLogoStage";
import { RewardImageFrame } from "../../../shared/components/RewardImageFrame";
import type { RewardImageCrop } from "../../../shared/rewardImageCrop";
import "../customer-premium.css";
import "../customer-compact.css";
import "../customer-header-language.css";
import { translateStructural } from "../../../shared/i18n/catalog.mjs";
import { UiButton, UiCard, UiStatus } from "../../../shared/ui";
import { InfoTrigger } from "../../../shared/components/InfoTrigger";
import { LanguageSelector } from "../../../shared/i18n/LanguageSelector";
import { useI18n } from "../../../shared/i18n/I18nProvider";
import { customerPresentationText } from "../customerRewardPresentation.mjs";

const t = (key: string) => translateStructural(key, "de");

export type CustomerView = "home" | "redemptions" | "collect" | "account";

type CustomerAppShellProps = {
  children: ReactNode;
  className?: string;
  fontFamily?: string | null;
  languageInHeader?: boolean;
  primaryColor?: string | null;
};

export function AppShell({ children, className = "", fontFamily, languageInHeader = false, primaryColor }: CustomerAppShellProps) {
  return (
    <main
      className={`customer-premium-shell ${languageInHeader ? "customer-language-in-header " : ""}${className}`.trim()}
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

export function CustomerLanguageAction({ className = "" }: { className?: string }) {
  const { language } = useI18n();
  const label = customerPresentationText("languageChangeCurrent", language);
  return <LanguageSelector ariaLabel={label} className={`customer-standalone-language ${className}`.trim()} />;
}

export function PageContainer({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`customer-page-container ${className}`.trim()}>{children}</div>;
}

type RestaurantLogoProps = {
  logoUrl?: string | null;
  name: string;
  presentation?: RestaurantLogoPresentation | null;
  primaryColor?: string | null;
};

export function RestaurantLogo({ logoUrl, name, presentation, primaryColor }: RestaurantLogoProps) {
  return <RestaurantLogoStage className="premium-restaurant-logo" logoUrl={logoUrl} name={name} presentation={presentation} primaryColor={primaryColor} size="compact" />;
}

type CustomerHeaderProps = RestaurantLogoProps & {
  compact?: boolean;
  customerName?: string | null;
  onInfo: () => void;
  onSwitchRestaurant?: () => void;
  languageSelector?: boolean;
  subtitle?: string;
};

export function CustomerHeader({ compact = false, languageSelector = false, logoUrl, name, onInfo, onSwitchRestaurant, presentation, primaryColor, subtitle = "Meine Vorteile" }: CustomerHeaderProps) {
  const { language } = useI18n();
  const t = (key: string) => customerPresentationText(key.replace("customer.", ""), language);
  return (
    <header className={`premium-customer-header${compact ? " compact" : ""}${languageSelector ? " has-language-selector" : ""}`}>
      {onSwitchRestaurant ? (
        <button data-i18n-skip="true" aria-label={t("customer.restaurantSwitch")} className="premium-customer-restaurant-selector" onClick={onSwitchRestaurant} type="button">
          <RestaurantLogo logoUrl={logoUrl} name={name} presentation={presentation} primaryColor={primaryColor} />
          <span className="premium-customer-header-copy">
            {!compact ? <span>{subtitle}</span> : null}
            <strong>{name}</strong>
          </span>
          <ChevronDown aria-hidden="true" size={18} />
        </button>
      ) : (
        <>
          <RestaurantLogo logoUrl={logoUrl} name={name} presentation={presentation} primaryColor={primaryColor} />
          <span className="premium-customer-header-copy">
            {!compact ? <span>{subtitle}</span> : null}
            <strong>{name}</strong>
          </span>
        </>
      )}
      {languageSelector ? <LanguageSelector ariaLabel={t("customer.languageChangeCurrent")} className="customer-header-language" /> : null}
      <InfoTrigger className="premium-icon-button" label={t("customer.helpOpen")} onClick={onInfo} />
    </header>
  );
}

type BottomNavigationProps = {
  activeView: CustomerView;
  onChange: (view: CustomerView) => void;
};

const navigationItems = [
  { label: "customer.home", value: "home" as const, icon: Home },
  { label: "customer.redeem", value: "redemptions" as const, icon: Gift },
  { label: "customer.collect", value: "collect" as const, icon: ScanLine, primary: true },
  { label: "customer.account", value: "account" as const, icon: UserRound },
];

export function BottomNavigation({ activeView, onChange }: BottomNavigationProps) {
  const { language } = useI18n();
  const t = (key: string) => customerPresentationText(key.replace("customer.", ""), language);
  return (
    <nav data-i18n-skip="true" aria-label={t("customer.navigation")} className="premium-bottom-navigation">
      {navigationItems.map(({ icon: Icon, label, primary, value }) => (
        <button
          aria-current={activeView === value ? "page" : undefined}
          aria-label={primary ? t("customer.collectPoints") : undefined}
          className={`${activeView === value ? "active " : ""}${primary ? "primary-action" : ""}`.trim()}
          key={value}
          onClick={() => onChange(value)}
          type="button"
        >
          <span className="premium-navigation-icon"><Icon aria-hidden="true" size={primary ? 24 : 21} /></span>
          <span>{t(label)}</span>
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
    <UiCard className={`premium-card premium-card-${variant} ${className}`.trim()} variant={variant === "highlight" ? "summary" : "default"} {...props}>
      {children}
    </UiCard>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode };

export function PrimaryButton({ children, className = "", ...props }: ButtonProps) {
  return <UiButton className={`premium-button premium-button-primary ${className}`.trim()} variant="primary" {...props}>{children}</UiButton>;
}

export function SecondaryButton({ children, className = "", ...props }: ButtonProps) {
  return <UiButton className={`premium-button premium-button-secondary ${className}`.trim()} variant="secondary" {...props}>{children}</UiButton>;
}

export function StatusBadge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "success" | "warning" | "error" }) {
  return <UiStatus className={`premium-status-badge ${tone}`} tone={tone}>{children}</UiStatus>;
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
  boostDetail?: string | null;
  boostLabel?: string | null;
  label: string;
  note: string;
  onInfo?: () => void;
  progress?: number;
  progressLabel?: string;
  value: string;
};

export function PointsCard({ boostDetail, boostLabel, label, note, onInfo, progress, progressLabel = "Punktefortschritt", value }: PointsCardProps) {
  const { language } = useI18n();
  return (
    <PremiumCard className="premium-points-card" variant="highlight">
      <div className="premium-points-heading">
        <span className="premium-points-title">
          <span>{label}</span>
          {onInfo ? (
            <InfoTrigger className="premium-points-info" label={customerPresentationText("pointsInfo", language)} onClick={onInfo} />
          ) : null}
        </span>
        {boostLabel ? <StatusBadge tone="warning">{boostLabel}</StatusBadge> : null}
      </div>
      <strong className="premium-points-value">{value}</strong>
      {boostDetail ? <small className="premium-points-boost-detail">{boostDetail}</small> : null}
      {typeof progress === "number" ? <ProgressBar label={progressLabel === "Punktefortschritt" ? customerPresentationText("progress", language) : progressLabel} value={progress} /> : null}
      <p data-i18n-skip="true">{note}</p>
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

export function RewardImage({ crop, imageFirst = false, imageUrl, renderScaleMode, title }: { crop?: Partial<RewardImageCrop> | null; imageFirst?: boolean; imageUrl?: string | null; renderScaleMode?: "contain" | "cover"; title: string }) {
  const { language } = useI18n();
  return (
    <div className="premium-reward-image" data-i18n-skip="true">
      {imageUrl ? <RewardImageFrame alt={title} crop={crop} imageUrl={imageUrl} loading={imageFirst ? "lazy" : undefined} renderScaleMode={renderScaleMode} /> : <Gift aria-label={customerPresentationText("placeholder", language, { title })} size={38} />}
    </div>
  );
}

export type RewardCardState = "available" | "locked" | "redeeming" | "redeemed" | "expired";

type RewardCardProps = {
  imageFirst?: boolean;
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
  available: { icon: CheckCircle2, label: t("rewards.available") },
  locked: { icon: LockKeyhole, label: t("rewards.locked") },
  redeeming: { icon: LoaderCircle, label: t("rewards.redeeming") },
  redeemed: { icon: CheckCircle2, label: t("common.redeemed") },
  expired: { icon: Clock3, label: t("common.expired") },
};

export function RewardCard({ actionLabel: providedActionLabel, category, imageCrop, imageFirst = false, imageUrl, meta, onOpen, state, status, title }: RewardCardProps) {
  const { language } = useI18n();
  const actionLabel = providedActionLabel ?? customerPresentationText("details", language);
  const stateMeta = rewardStateMeta[state];
  const StateIcon = stateMeta.icon;
  const actionContent = imageFirst ? <><span>{actionLabel}</span><ChevronRight aria-hidden="true" className="customer-image-first-chevron" size={22} /></> : actionLabel;

  return (
    <PremiumCard className={`premium-compact-customer-card premium-reward-card state-${state}`}>
      <div className="premium-reward-media">
        <RewardImage crop={imageCrop} imageFirst={imageFirst} imageUrl={imageUrl} title={title} />
        {state !== "available" ? (
          <span data-i18n-skip="true" className="premium-lock-badge" aria-label={customerPresentationText(state, language)}>
            <StateIcon aria-hidden="true" size={18} />
          </span>
        ) : null}
      </div>
      <div className="premium-reward-copy">
        {category ? <span>{category}</span> : null}
        <h3 data-i18n-skip="true">{title}</h3>
        <strong data-i18n-skip="true">{meta}</strong>
        <p data-i18n-skip="true" className={`premium-reward-status state-${state}`}><StateIcon aria-hidden="true" size={14} /> {status}</p>
      </div>
      {onOpen ? (
        state === "available"
          ? <PrimaryButton data-i18n-skip="true" aria-label={`${title}: ${actionLabel}`} className={imageFirst ? "customer-image-first-action" : undefined} onClick={onOpen}>{actionContent}</PrimaryButton>
          : <SecondaryButton data-i18n-skip="true" aria-label={`${title}: ${actionLabel}`} className={imageFirst ? "customer-image-first-action" : undefined} onClick={onOpen}>{actionContent}</SecondaryButton>
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
