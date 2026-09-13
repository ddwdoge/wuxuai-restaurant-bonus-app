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
import { useI18n } from "../../../shared/i18n/I18nProvider";
import { customerPresentationText } from "../customerRewardPresentation.mjs";

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
  const { translateKey: t } = useI18n();
  const pointsLabel = t("customer.pointsCount").replace("{count}", String(membership.points_balance));
  return (
    <button
      aria-current={current ? "true" : undefined}
      aria-label={t("customer.membershipLabel")
        .replace("{name}", membership.name)
        .replace("{points}", pointsLabel)
        .replace("{current}", current ? `, ${t("customer.currentlySelected")}` : "")}
      className={`customer-restaurant-switcher-row${current ? " current" : ""}`}
      onClick={() => onSelect(membership)}
      type="button"
    >
      <RestaurantLogo logoUrl={membership.logo_url} name={membership.name} />
      <span className="customer-restaurant-switcher-copy">
        <strong>{membership.name}</strong>
        {membership.city ? <small><MapPin aria-hidden="true" size={13} /> {membership.city}</small> : null}
      </span>
      <span className="customer-restaurant-switcher-points">{pointsLabel}</span>
      {current ? <span className="customer-restaurant-switcher-current"><Check aria-hidden="true" size={15} /> {t("customer.current")}</span> : null}
    </button>
  );
}

export function CustomerRestaurantSwitcher({ currentSlug, onClose, open }: CustomerRestaurantSwitcherProps) {
  const navigate = useNavigate();
  const { language, translateKey: t } = useI18n();
  const ct = (key: string) => customerPresentationText(key, language);
  const [memberships, setMemberships] = useState<CustomerAccountMembership[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState("");
  const [switchingMembership, setSwitchingMembership] = useState<CustomerAccountMembership | null>(null);
  const [failedMembership, setFailedMembership] = useState<CustomerAccountMembership | null>(null);

  const loadMemberships = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const account = await loadCustomerAccount();
      setMemberships(account?.memberships ?? []);
    } catch {
      setLoadError(true);
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
      closeLabel={ct("close")}
      description={ct("switcherDescription")}
      dismissOnOverlay={!switchingMembership}
      onClose={switchingMembership ? () => undefined : onClose}
      open={open}
      size="standard"
      title={ct("restaurantSwitch")}
    >
      <div className="customer-restaurant-switcher">
        {switchingMembership ? (
          <div className="customer-restaurant-switcher-loading" role="status">
            <LoaderCircle aria-hidden="true" size={28} />
            <strong>{ct("switcherSwitching")}</strong>
          </div>
        ) : loading ? (
          <div className="customer-restaurant-switcher-loading" role="status">
            <LoaderCircle aria-hidden="true" size={28} />
            <span>{ct("switcherLoading")}</span>
          </div>
        ) : loadError ? (
          <div className="customer-restaurant-switcher-error" role="alert">
            <strong>{ct("switcherLoadError")}</strong>
            <button className="premium-button premium-button-secondary" onClick={() => void loadMemberships()} type="button">{ct("retry")}</button>
          </div>
        ) : (
          <>
            {currentMembership ? <section><h3>{t("customer.current")}</h3><RestaurantRow current membership={currentMembership} onSelect={(membership) => void switchRestaurant(membership)} /></section> : null}
            <section>
              <h3>{ct("switcherRestaurantsHeading")}</h3>
              {activeMemberships.length > 5 ? (
                <label className="customer-restaurant-switcher-search">
                  <Search aria-hidden="true" size={17} />
                  <span className="sr-only">{ct("switcherSearchLabel")}</span>
                  <input onChange={(event) => setQuery(event.target.value)} placeholder={ct("switcherSearchPlaceholder")} type="search" value={query} />
                </label>
              ) : null}
              <div className="customer-restaurant-switcher-list">
                {otherMemberships.map((membership) => <RestaurantRow key={membership.restaurant_id} membership={membership} onSelect={(selectedMembership) => void switchRestaurant(selectedMembership)} />)}
                {!otherMemberships.length ? <p>{ct("switcherEmpty")}</p> : null}
              </div>
            </section>
            {failedMembership ? (
              <div className="customer-restaurant-switcher-error" role="alert">
                <strong>{ct("switcherSwitchError")}</strong>
                <button className="premium-button premium-button-secondary" onClick={() => void switchRestaurant(failedMembership)} type="button">{ct("retry")}</button>
              </div>
            ) : null}
            <Link className="customer-restaurant-switcher-discover" to="/customer/restaurants"><Store aria-hidden="true" size={17} /> {ct("switcherDiscover")}</Link>
          </>
        )}
      </div>
    </AppDrawer>
  );
}
