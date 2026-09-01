import assert from "node:assert/strict";
import test from "node:test";
import {
  isUsableRestaurantSlug,
  loadPortalForRestaurant,
  persistScopedActiveRedemption,
  readScopedActiveRedemption,
  removeScopedActiveRedemption,
  restoreScopedActiveRedemption,
} from "../src/modules/customer/customerRedemptionSession.mjs";

class MemoryStorage {
  #items = new Map();

  getItem(key) {
    return this.#items.get(key) ?? null;
  }

  setItem(key, value) {
    this.#items.set(key, String(value));
  }

  removeItem(key) {
    this.#items.delete(key);
  }

  entries() {
    return [...this.#items.entries()];
  }
}

const redemption = {
  code: "483921",
  expiresAt: "2099-07-23T12:15:00.000Z",
  redemptionId: "redemption-a-1",
  rewardId: "reward-a-1",
  assignmentId: null,
  title: "Gratis Dessert",
  redemptionType: "points_redemption",
  pointsSpent: 300,
};

function activeServerStatus(input) {
  return Promise.resolve({
    active: true,
    status: "active",
    expires_at: redemption.expiresAt,
    checkedRedemptionId: input.redemptionId,
  });
}

test("aktive Einlösung bleibt bei A, erscheint nicht bei B und wird bei A servervalidiert restauriert", async () => {
  const storage = new MemoryStorage();
  const tokenA = "customer-token-a";
  const storedKey = await persistScopedActiveRedemption(storage, {
    restaurantSlug: "restaurant-a",
    customerToken: tokenA,
    redemption,
  });

  assert.match(storedKey, /restaurant-a/);
  assert.match(storedKey, /redemption-a-1/);
  assert.doesNotMatch(storedKey, new RegExp(tokenA));

  let serverChecks = 0;
  const atRestaurantB = await restoreScopedActiveRedemption(storage, {
    restaurantSlug: "restaurant-b",
    customerToken: "customer-token-b",
  }, async (input) => {
    serverChecks += 1;
    return activeServerStatus(input);
  });
  assert.equal(atRestaurantB.state, "none");
  assert.equal(atRestaurantB.redemption, null);
  assert.equal(serverChecks, 0);

  const backAtRestaurantA = await restoreScopedActiveRedemption(storage, {
    restaurantSlug: "restaurant-a",
    customerToken: tokenA,
  }, async (input) => {
    serverChecks += 1;
    return activeServerStatus(input);
  });
  assert.equal(backAtRestaurantA.state, "active");
  assert.equal(backAtRestaurantA.redemption?.code, redemption.code);
  assert.equal(backAtRestaurantA.redemption?.redemptionId, redemption.redemptionId);
  assert.equal(serverChecks, 1);
});

test("zwei Kunden desselben Restaurants erhalten vollständig getrennte Restore-Sessions", async () => {
  const storage = new MemoryStorage();
  await persistScopedActiveRedemption(storage, {
    restaurantSlug: "restaurant-a",
    customerToken: "customer-token-1",
    redemption,
  });

  assert.equal(await readScopedActiveRedemption(storage, {
    restaurantSlug: "restaurant-a",
    customerToken: "customer-token-2",
  }), null);
  assert.equal((await readScopedActiveRedemption(storage, {
    restaurantSlug: "restaurant-a",
    customerToken: "customer-token-1",
  }))?.code, redemption.code);

  await removeScopedActiveRedemption(storage, {
    restaurantSlug: "restaurant-a",
    customerToken: "customer-token-2",
  });
  assert.equal((await readScopedActiveRedemption(storage, {
    restaurantSlug: "restaurant-a",
    customerToken: "customer-token-1",
  }))?.redemptionId, redemption.redemptionId);
});

test("manipulierter Restore-State wird vor jedem Serveraufruf verworfen", async () => {
  const storage = new MemoryStorage();
  const scope = { restaurantSlug: "restaurant-a", customerToken: "customer-token-a" };
  const recordKey = await persistScopedActiveRedemption(storage, { ...scope, redemption });
  const record = JSON.parse(storage.getItem(recordKey));
  record.restaurantSlug = "restaurant-b";
  storage.setItem(recordKey, JSON.stringify(record));

  let serverChecks = 0;
  const restored = await restoreScopedActiveRedemption(storage, scope, async () => {
    serverChecks += 1;
    return activeServerStatus({ redemptionId: redemption.redemptionId });
  });
  assert.equal(restored.state, "none");
  assert.equal(serverChecks, 0);
  assert.equal(storage.entries().length, 0);
});

test("Serverstatus beendet lokale Einlösung und verhindert eine zweite lokale Aktivierung", async () => {
  const storage = new MemoryStorage();
  const scope = { restaurantSlug: "restaurant-a", customerToken: "customer-token-a" };
  await persistScopedActiveRedemption(storage, { ...scope, redemption });

  const restored = await restoreScopedActiveRedemption(storage, scope, async () => ({
    active: false,
    status: "redeemed",
  }));
  assert.equal(restored.state, "redeemed");
  assert.equal(await readScopedActiveRedemption(storage, scope), null);
});

test("leerer oder syntaktisch ungültiger Slug löst keinen Portal-Service aus", async () => {
  for (const restaurantSlug of ["", "   ", "../restaurant-a", "restaurant a"]) {
    let serviceCalls = 0;
    const result = await loadPortalForRestaurant({
      restaurantSlug,
      customerToken: "customer-token-a",
      loadPortal: async () => {
        serviceCalls += 1;
        return { restaurant: "A" };
      },
    });
    assert.equal(isUsableRestaurantSlug(restaurantSlug), false);
    assert.equal(result.status, "invalid");
    assert.equal(serviceCalls, 0);
  }
});

test("Loader-Fehler liefert keine vorherigen Portaldaten zurück", async () => {
  const previousData = { restaurant: "Restaurant A", rewards: ["Dessert"] };
  const successful = await loadPortalForRestaurant({
    restaurantSlug: "restaurant-a",
    customerToken: "customer-token-a",
    loadPortal: async () => previousData,
  });
  assert.deepEqual(successful.data, previousData);

  const failed = await loadPortalForRestaurant({
    restaurantSlug: "restaurant-a",
    customerToken: "customer-token-a",
    loadPortal: async () => {
      throw new Error("Netzwerkfehler");
    },
  });
  assert.equal(failed.status, "error");
  assert.equal(failed.data, null);
  assert.match(failed.error.message, /Netzwerkfehler/);
});
