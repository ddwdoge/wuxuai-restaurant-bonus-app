import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { useI18n } from "../../shared/i18n/I18nProvider";
import { AppDrawer } from "../../shared/components/AppDrawer";
import { AppShell, CustomerLanguageAction } from "./components/PremiumCustomerUi";
import { CentralCustomerNavigation } from "./components/CentralCustomerNavigation";
import { RestaurantOfferDetail } from "./components/RestaurantOfferCard";
import type { RestaurantOffer } from "../offers/restaurantOfferService";
import { announceOfferInboxChange, offerInboxText, openCustomerOfferInboxEntry, readCustomerOfferInbox, watchOfferInboxRefresh, type OfferInbox, type OfferInboxCursor } from "./customerOfferInbox";
import "./customer-offer-inbox.css";

export function CustomerOfferInboxPage() {
  const { user, contextRevision } = useAuth();
  const context = user ? `${user.id}:${contextRevision}` : undefined;
  const { language } = useI18n();
  const text = offerInboxText(language);
  const [state, setState] = useState<{ owner: string; inbox: OfferInbox } | null>(null);
  const [selected, setSelected] = useState<{ owner: string; offer: RestaurantOffer } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [openError, setOpenError] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const generation = useRef(0);
  const opening = useRef(false);
  const identity = useRef(context);
  useLayoutEffect(() => {
    identity.current = context;
    return () => { identity.current = undefined; };
  }, [context]);

  const load = useCallback(async (cursor: OfferInboxCursor | null = null) => {
    const current = ++generation.current;
    const owner = context;
    if (!owner) return;
    setLoading(true); setError(false);
    try {
      const result = await readCustomerOfferInbox(cursor);
      if (current !== generation.current || identity.current !== owner) return;
      setState(previous => ({ owner, inbox: { ...result, items: cursor && previous?.owner === owner
        ? [...previous.inbox.items, ...result.items.filter(item => !previous.inbox.items.some(old => old.id === item.id))] : result.items } }));
    } catch {
      if (current === generation.current && identity.current === owner) { setState(null); setError(true); }
    } finally { if (current === generation.current) setLoading(false); }
  }, [context]);

  useEffect(() => {
    const requests = generation;
    setState(null); setSelected(null); setBusyId(null); setOpenError(false); opening.current = false;
    void load();
    const unwatch = watchOfferInboxRefresh(() => { setSelected(null); void load(); });
    return () => { ++requests.current; unwatch(); };
  }, [load]);

  async function open(id: string) {
    if (opening.current) return;
    opening.current = true; setBusyId(id); setOpenError(false);
    const owner = context;
    try {
      const result = await openCustomerOfferInboxEntry(id);
      if (!owner || owner !== identity.current) return;
      // Refresh others before presenting this exact server-returned offer.
      announceOfferInboxChange();
      setSelected({ owner, offer: result.offer });
      await load();
    } catch {
      if (owner === identity.current) { setSelected(null); setOpenError(true); await load(); }
    } finally {
      if (owner === identity.current) { opening.current = false; setBusyId(null); }
    }
  }
  const inbox = state && state.owner === context ? state.inbox : null;
  const offer = selected && selected.owner === context ? selected.offer : null;
  return <AppShell><main className="customer-offer-inbox-page" data-i18n-skip="true">
    <header><Link to="/customer">{text[11]}</Link><CustomerLanguageAction /><h1>{text[1]}</h1></header>
    {inbox?.available ? <p role="status">{text[2]}: <strong data-testid="inbox-unread-count">{inbox.unread_count}</strong></p> : null}
    {loading ? <p role="status">{text[3]}</p> : null}
    {error ? <div role="alert"><p>{text[4]}</p><button type="button" onClick={() => void load()}>{text[5]}</button></div> : null}
    {openError ? <p role="alert">{text[8]}</p> : null}
    {!loading && !error && !inbox?.items.length ? <p>{text[6]}</p> : null}
    <ul>{inbox?.items.map(item => <li key={item.id}>
      <button type="button" disabled={busyId !== null} onClick={() => void open(item.id)} data-notification-id={item.id}>
        <span>{item.restaurant_name}</span><strong>{item.title}</strong><small>{item.read_at ? text[10] : text[2]}</small>
      </button>
    </li>)}</ul>
    {inbox?.next_cursor ? <button type="button" disabled={loading} onClick={() => void load(inbox.next_cursor)}>{text[7]}</button> : null}
  </main><CentralCustomerNavigation />
    <AppDrawer open={Boolean(offer)} onClose={() => setSelected(null)} title={offer?.title ?? text[0]} closeLabel={text[9]}>
      {offer ? <RestaurantOfferDetail offer={offer} preserveTitle /> : null}
    </AppDrawer>
  </AppShell>;
}
