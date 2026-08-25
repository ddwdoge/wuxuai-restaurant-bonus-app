import { ArrowRight, LogOut, ShieldAlert } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  portalDestination,
  portalLoginPath,
  wrongPortalCopy,
  type PortalAccess,
  type PortalKind,
} from "./portalAccessUx.mjs";
import { useAuth } from "./AuthProvider";
import {
  PublicContentCard,
  PublicPageShell,
  PublicPrimaryButton,
} from "../public/PublicPageComponents";

type WrongPortalNoticeProps = {
  portal: PortalKind;
  staffSlug?: string | null;
  description?: string;
};

export function WrongPortalNotice({ portal, staffSlug = null, description }: WrongPortalNoticeProps) {
  const { portalAccess, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const access = portalAccess as PortalAccess;
  const destination = portalDestination(portal, access);

  async function switchAccount() {
    await signOut().catch(() => undefined);
    const loginPath = portalLoginPath(portal, staffSlug);
    navigate(loginPath, {
      replace: true,
      state: { from: `${location.pathname}${location.search}` },
    });
  }

  return (
    <PublicPageShell
      description="Deine Anmeldung ist gültig, gehört aber zu einem anderen geschützten Bereich."
      eyebrow="WUXUAI Bonus"
      title="Falscher Anmeldebereich"
    >
      <PublicContentCard>
        <div className="public-premium-status-icon" aria-hidden="true"><ShieldAlert size={28} /></div>
        <div className="public-premium-form">
          <p className="public-premium-alert" role="status">{description ?? wrongPortalCopy(portal, access)}</p>
          {destination ? (
            <PublicPrimaryButton icon={<ArrowRight size={18} />} onClick={() => navigate(destination.path)} type="button">
              {destination.label}
            </PublicPrimaryButton>
          ) : null}
          <button className="public-premium-secondary-link" onClick={() => void switchAccount()} type="button">
            <LogOut aria-hidden="true" size={17} /> Mit anderem Konto anmelden
          </button>
        </div>
      </PublicContentCard>
    </PublicPageShell>
  );
}
