export function createGuestListState(restaurantId = "") {
  return { restaurantId, query: "" };
}

export function guestListStateReducer(state, action) {
  if (action.type === "restaurant_changed") {
    if (action.restaurantId === state.restaurantId) return state;
    return createGuestListState(action.restaurantId);
  }

  if (action.type === "query_changed") {
    return {
      restaurantId: action.restaurantId,
      query: action.query,
    };
  }

  return state;
}

function normalizeSearchValue(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("de-AT")
    .replace(/\s+/g, " ")
    .trim();
}

export function filterGuestList(customers, query) {
  const terms = normalizeSearchValue(query).split(" ").filter(Boolean);
  if (terms.length === 0) return customers;

  return customers.filter((customer) => {
    const searchable = normalizeSearchValue([
      customer.name,
      customer.phone,
      customer.customer_code,
    ].filter(Boolean).join(" "));
    return terms.every((term) => searchable.includes(term));
  });
}
