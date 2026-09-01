import { Link } from "react-router-dom";
import { portalLoginLinks, type PublicPortal } from "./portalRecoveryUx.mjs";
import "./portal-login-navigation.css";

export function PortalLoginNavigation({ currentPortal }: { currentPortal: PublicPortal }) {
  const links = portalLoginLinks(currentPortal);

  return (
    <nav aria-label="Andere WUXUAI Bereiche" className="portal-login-navigation">
      <h2>Anderen Bereich öffnen</h2>
      <div>
        {links.map((link) => <Link key={link.portal} to={link.path}>{link.label}</Link>)}
      </div>
    </nav>
  );
}
