import { Building2 } from "lucide-react";
import { useI18n } from "../../shared/i18n/I18nProvider";
import { useTenant } from "./TenantProvider";

export function TenantSwitcher() {
  const { activeRestaurant, restaurants, setActiveRestaurantId } = useTenant();
  const { translateKey: t } = useI18n();

  return (
    <div className="tenant-switcher">
      <label className="field tenant-switcher-field" htmlFor="tenant-switcher">
        <span className="tenant-switcher-label">
          <Building2 aria-hidden="true" size={14} /> {t("owner.tenantSwitcher.label")}
        </span>
        <select
          className="select"
          id="tenant-switcher"
          value={activeRestaurant?.id ?? ""}
          onChange={(event) => setActiveRestaurantId(event.target.value)}
        >
          {restaurants.map((restaurant) => (
            <option key={restaurant.id} value={restaurant.id}>
              {restaurant.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
