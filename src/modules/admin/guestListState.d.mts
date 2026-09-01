import type { Customer } from "../../shared/types/domain";

export type GuestListState = {
  restaurantId: string;
  query: string;
};

export type GuestListAction =
  | { type: "restaurant_changed"; restaurantId: string }
  | { type: "query_changed"; restaurantId: string; query: string };

export function createGuestListState(restaurantId?: string): GuestListState;
export function guestListStateReducer(state: GuestListState, action: GuestListAction): GuestListState;
export function filterGuestList(customers: Customer[], query: string): Customer[];
