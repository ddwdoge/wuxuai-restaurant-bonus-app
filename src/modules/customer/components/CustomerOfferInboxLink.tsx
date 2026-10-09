import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { useI18n } from "../../../shared/i18n/I18nProvider";
import { offerInboxText, readCustomerOfferInbox, watchOfferInboxRefresh } from "../customerOfferInbox";
import "../customer-offer-inbox.css";

export function CustomerOfferInboxLink() {
  const { user, contextRevision } = useAuth();
  const context = user ? `${user.id}:${contextRevision}` : undefined;
  const { language } = useI18n();
  const text = offerInboxText(language);
  const [state, setState] = useState<{ owner: string; available: boolean; count: number } | null>(null);
  useEffect(() => {
    let generation = 0;
    let alive = true;
    const owner = context;
    const refresh = async () => {
      const current = ++generation;
      if (!owner) return;
      try {
        const result = await readCustomerOfferInbox(null, 1);
        if (alive && current === generation) setState({ owner, available: result.available, count: result.unread_count });
      } catch { if (alive && current === generation) setState(null); }
    };
    void refresh();
    const unwatch = watchOfferInboxRefresh(() => { void refresh(); });
    return () => { alive = false; unwatch(); };
  }, [context]);
  if (!state?.available || state.owner !== context) return null;
  return <NavLink to="/customer/inbox" data-i18n-skip="true" className={({ isActive }) => `customer-offer-inbox-link${isActive ? " active" : ""}`} aria-label={`${text[0]}${state.count ? `: ${state.count} ${text[2]}` : ""}`}>
    <span className="customer-offer-inbox-icon"><Bell size={20} aria-hidden="true" />{state.count > 0 ? <span className="customer-offer-inbox-badge" aria-hidden="true">{state.count}</span> : null}</span>
    <span>{text[0]}</span>
  </NavLink>;
}
