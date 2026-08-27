import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, LoaderCircle, MapPin, Search, Store } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { AppDrawer } from "../../../shared/components/AppDrawer";
import {
  loadCustomerAccount,
  openCustomerAccountMembership,
  type CustomerAccountMembership,
} from "../customerAccountService";
import { customerSwitcherMemberships } from "../customerRestaurantSwitcher.mjs";
import { RestaurantLogo } from "./PremiumCustomerUi";
import "./customer-restaurant-switcher.css";

type CustomerRestaurantSwitcherProps = {
  currentSlug: string;
  onClose: () => void;
  open: boolean;
};

type RestaurantRowProps = {
  current?: boolean;
  membership: CustomerAccountMembership;
  onSelect: (membership: CustomerAccountMembership) => void;
};

function RestaurantRow({ current, membership, onSelect }: RestaurantRowProps) {
  return (
    <button
      aria-current={current ? "true" : undefined}
      aria-label={`${membership.name}, ${membership.points_balance} Punkte${current ? ", aktuell ausgewählt" : ""}`}
      className={`customer-restaurant-switcher-row${current ? " current" : ""}`}
      onClick={() => onSelect(membership)}
      type="button"
    >
      <RestaurantLogo logoUrl={membership.logo_url} name={membership.name} />
      <span className="customer-restaurant-switcher-copy">
        <strong>{membership.name}</strong>
        {membership.city ? <small><MapPin aria-hidden="true" size={13} /> {membership.city}</small> : null}
      </span>
      <span className="customer-restaurant-switcher-points">{membership.points_balance} Punkte</span>
      {current ? <span className="customer-restaurant-switcher-current"><Check aria-hidden="true" size={15} /> Aktuell</span> : null}
    </button>
  );
}

export function CustomerRestaurantSwitcher({ currentSlug, onClose, open }: CustomerRestaurantSwitcherProps) {
  const navigate = useNavigate();
  const [memberships, setMemberships] = useState<CustomerAccountMembership[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [switchingMembership, setSwitchingMembership] = useState<CustomerAccountMembership | null>(null);
  const [failedMembership, setFailedMembership] = useState<CustomerAccountMembership | null>(null);

  const loadMemberships = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const account = await loadCustomerAccount();
      setMemberships(account?.memberships ?? []);
    } catch {
      setLoadError("Deine Restaurants konnten gerade nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setFailedMembership(null);
    void loadMemberships();
  }, [loadMemberships, open]);

  const activeMemberships = useMemo(
    () => customerSwitcherMemberships(memberships, currentSlug),
    [currentSlug, memberships],
  );
  const visibleMemberships = useMemo(
    () => customerSwitcherMemberships(memberships, currentSlug, query),
    [currentSlug, memberships, query],
  );
  const currentMembership = visibleMemberships.find((membership) => membership.slug === currentSlug) ?? null;
  const otherMemberships = visibleMemberships.filter((membership) => membership.slug !== currentSlug);

  async function switchRestaurant(membership: CustomerAccountMembership) {
    if (switchingMembership) return;
    if (membership.slug === currentSlug) {
      onClose();
      return;
    }
    setFailedMembership(null);
    setSwitchingMembership(membership);
    try {
      const canonicalSlug = await openCustomerAccountMembership(membership);
      navigate(`/customer/${encodeURIComponent(canonicalSlug)}`);
      onClose();
    } catch {
      setFailedMembership(membership);
    } finally {
      setSwitchingMembership(null);
    }
  }

  return (
    <AppDrawer
      description="Wähle eines deiner Restaurants."
      dismissOnOverlay={!switchingMembership}
      onClose={switchingMembership ? () => undefined : onClose}
      open={open}
      size="standard"
      title="Restaurant wechseln"
    >
      <div className="customer-restaurant-switcher">
        {switchingMembership ? (
          <div className="customer-restaurant-switcher-loading" role="status">
            <LoaderCircle aria-hidden="true" size={28} />
            <strong>Restaurant wird gewechselt…</strong>
          </div>
        ) : loading ? (
          <div className="customer-restaurant-switcher-loading" role="status">
            <LoaderCircle aria-hidden="true" size={28} />
            <span>Deine Restaurants werden geladen.</span>
          </div>
        ) : loadError ? (
          <div className="customer-restaurant-switcher-error" role="alert">
            <strong>{loadError}</strong>
            <button className="premium-button premium-button-secondary" onClick={() => void loadMemberships()} type="button">Erneut versuchen</button>
          </div>
        ) : (
          <>
            {currentMembership ? <section><h3>Aktuell</h3><RestaurantRow current membership={currentMembership} onSelect={(membership) => void switchRestaurant(membership)} /></section> : null}
            <section>
              <h3>Deine Restaurants</h3>
              {activeMemberships.length > 5 ? (
                <label className="customer-restaurant-switcher-search">
                  <Search aria-hidden="true" size={17} />
                  <span className="sr-only">Deine Restaurants durchsuchen</span>
                  <input onChange={(event) => setQuery(event.target.value)} placeholder="Restaurant filtern" type="search" value={query} />
                </label>
              ) : null}
              <div className="customer-restaurant-switcher-list">
                {otherMemberships.map((membership) => <RestaurantRow key={membership.restaurant_id} membership={membership} onSelect={(selectedMembership) => void switchRestaurant(selectedMembership)} />)}
                {!otherMemberships.length ? <p>Keine weiteren Restaurants in dieser Auswahl.</p> : null}
              </div>
            </section>
            {failedMembership ? (
              <div className="customer-restaurant-switcher-error" role="alert">
                <strong>Restaurant konnte nicht gewechselt werden.</strong>
                <button className="premium-button premium-button-secondary" onClick={() => void switchRestaurant(failedMembership)} type="button">Erneut versuchen</button>
              </div>
            ) : null}
            <Link className="customer-restaurant-switcher-discover" to="/customer/restaurants"><Store aria-hidden="true" size={17} /> Neues Restaurant entdecken</Link>
          </>
        )}
      </div>
    </AppDrawer>
  );
}
