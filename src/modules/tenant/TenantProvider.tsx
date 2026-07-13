import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../shared/lib/supabase";
import type { Restaurant, RestaurantBranding } from "../../shared/types/domain";
import { useAuth } from "../auth/AuthProvider";

type TenantContextValue = {
  restaurants: Restaurant[];
  activeRestaurant: Restaurant | null;
  branding: RestaurantBranding | null;
  loading: boolean;
  refreshTenants: () => Promise<void>;
  setActiveRestaurantId: (restaurantId: string) => void;
};

const TenantContext = createContext<TenantContextValue | null>(null);

type RestaurantMembership = {
  restaurant_id: string;
};

const restaurantSelect =
  "id, owner_id, organization_id, primary_branch_id, name, slug, status, owner_phone, restaurant_type, language, opening_hours, smart_open_enabled, onboarding_status, onboarding_checklist, created_at";

async function loadBrandingForRestaurant(restaurantId: string) {
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("restaurant_branding")
    .select("id, restaurant_id, logo_url, primary_color, secondary_color, button_color, font_family, created_at")
    .eq("restaurant_id", restaurantId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as RestaurantBranding | null) ?? null;
}

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [activeRestaurantId, setActiveRestaurantId] = useState("");
  const [branding, setBranding] = useState<RestaurantBranding | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const tenantLoadRequestId = useRef(0);

  function replaceTenantState(nextRestaurants: Restaurant[], preferredRestaurantId?: string) {
    setRestaurants(nextRestaurants);
    setActiveRestaurantId((current) => {
      const requestedRestaurantId = preferredRestaurantId && nextRestaurants.some((restaurant) => restaurant.id === preferredRestaurantId)
        ? preferredRestaurantId
        : current;
      return nextRestaurants.some((restaurant) => restaurant.id === requestedRestaurantId)
        ? requestedRestaurantId
        : nextRestaurants[0]?.id || "";
    });
  }

  async function loadTenantsForUser(userId: string, requestId = tenantLoadRequestId.current) {
    setLoading(true);
    const { data: memberships, error: membershipError } = await supabase!
      .from("restaurant_members")
      .select("restaurant_id")
      .eq("user_id", userId);

    if (requestId !== tenantLoadRequestId.current) {
      return;
    }

    if (membershipError) {
      console.error("Restaurant-Mitgliedschaften konnten nicht geladen werden.", membershipError);
      setRestaurants([]);
      setActiveRestaurantId("");
      setBranding(null);
      setLoading(false);
      return;
    }

    const memberRestaurantIds = new Set(
      ((memberships ?? []) as RestaurantMembership[]).map((membership) => membership.restaurant_id),
    );
    const [ownedResult, memberResult] = await Promise.all([
      supabase!
        .from("restaurants")
        .select(restaurantSelect)
        .eq("owner_id", userId)
        .order("created_at", { ascending: true }),
      memberRestaurantIds.size
        ? supabase!
            .from("restaurants")
            .select(restaurantSelect)
            .in("id", [...memberRestaurantIds])
            .order("created_at", { ascending: true })
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (ownedResult.error || memberResult.error) {
      if (requestId !== tenantLoadRequestId.current) {
        return;
      }
      console.error("Restaurants konnten nicht geladen werden.", ownedResult.error ?? memberResult.error);
      setRestaurants([]);
      setActiveRestaurantId("");
      setBranding(null);
      setLoading(false);
      return;
    }

    if (requestId !== tenantLoadRequestId.current) {
      return;
    }

    const uniqueRestaurants = new Map<string, Restaurant>();
    [...((ownedResult.data ?? []) as Restaurant[]), ...((memberResult.data ?? []) as Restaurant[])].forEach((restaurant) => {
      if (restaurant.owner_id === userId || memberRestaurantIds.has(restaurant.id)) {
        uniqueRestaurants.set(restaurant.id, restaurant);
      }
    });

    const nextRestaurants = [...uniqueRestaurants.values()].sort((left, right) =>
      new Date(left.created_at).getTime() - new Date(right.created_at).getTime(),
    );
    replaceTenantState(nextRestaurants);
    setLoading(false);
  }

  useEffect(() => {
    if (!supabase || !user) {
      tenantLoadRequestId.current += 1;
      setRestaurants([]);
      setActiveRestaurantId("");
      setBranding(null);
      setLoading(false);
      return;
    }

    const userId = user.id;
    const requestId = tenantLoadRequestId.current + 1;
    tenantLoadRequestId.current = requestId;
    setRestaurants([]);
    setActiveRestaurantId("");
    setBranding(null);
    setLoading(true);

    async function loadTenants() {
      await loadTenantsForUser(userId, requestId);
    }

    loadTenants();
  }, [user]);

  useEffect(() => {
    if (!supabase) {
      return;
    }

    if (!activeRestaurantId) {
      setBranding(null);
      return;
    }

    async function loadBranding() {
      try {
        setBranding(await loadBrandingForRestaurant(activeRestaurantId));
      } catch (error) {
        console.error("Restaurant-Aussehen konnte nicht geladen werden.", error);
        setBranding(null);
      }
    }

    loadBranding();
  }, [activeRestaurantId]);

  const activeRestaurant =
    restaurants.find((restaurant) => restaurant.id === activeRestaurantId) ?? restaurants[0] ?? null;

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--tenant-primary", branding?.primary_color ?? "#0f766e");
    root.style.setProperty("--tenant-secondary", branding?.secondary_color ?? "#f4a261");
    root.style.setProperty("--tenant-button", branding?.button_color ?? "#0f766e");
  }, [branding]);

  const value = useMemo<TenantContextValue>(
    () => ({
      restaurants,
      activeRestaurant,
      branding,
      loading,
      refreshTenants: async () => {
        if (supabase && user) {
          const requestId = tenantLoadRequestId.current + 1;
          tenantLoadRequestId.current = requestId;
          await loadTenantsForUser(user.id, requestId);
          if (activeRestaurant?.id) {
            try {
              setBranding(await loadBrandingForRestaurant(activeRestaurant.id));
            } catch (error) {
              console.error("Restaurant-Aussehen konnte nicht aktualisiert werden.", error);
            }
          }
          return;
        }
        setRestaurants([]);
        setActiveRestaurantId("");
        setBranding(null);
      },
      setActiveRestaurantId: (restaurantId: string) => {
        setActiveRestaurantId((current) =>
          restaurants.some((restaurant) => restaurant.id === restaurantId) ? restaurantId : current,
        );
      },
    }),
    [activeRestaurant, branding, loading, restaurants, user],
  );

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant() {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error("useTenant must be used inside TenantProvider");
  }
  return context;
}
