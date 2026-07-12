import { Building2 } from "lucide-react";
import { useTenant } from "./TenantProvider";

export function TenantSwitcher() {
  const { activeRestaurant, restaurants, setActiveRestaurantId } = useTenant();

  return (
    <div className="tenant-switcher">
      <label className="field" htmlFor="tenant-switcher">
        <span>
          <Building2 size={14} /> Restaurant
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
