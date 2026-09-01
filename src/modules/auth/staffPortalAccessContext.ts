import { createContext, useContext } from "react";
import type { StaffRestaurantAccess } from "./staffLoginService";

export const StaffPortalAccessContext = createContext<StaffRestaurantAccess | null>(null);

export function useStaffPortalAccess() {
  return useContext(StaffPortalAccessContext);
}
