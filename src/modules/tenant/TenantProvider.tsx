import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { demoBranding, demoRestaurant } from "../../shared/lib/demoData";
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

function readDemoRestaurant() {
  const rawState = window.localStorage.getItem("wuxuai-demo-state");
  if (!rawState) {
    return demoRestaurant;
  }

  try {
    const parsed = JSON.parse(rawState) as { restaurant?: Restaurant };
    return parsed.restaurant ? { ...demoRestaurant, ...parsed.restaurant } : demoRestaurant;
  } catch {
    return demoRestaurant;
  }
}

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [restaurants, setRestaurants] = useState<Restaurant[]>(supabase ? [] : [readDemoRestaurant()]);
  const [activeRestaurantId, setActiveRestaurantId] = useState(supabase ? "" : demoRestaurant.id);
  const [branding, setBranding] = useState<RestaurantBranding | null>(supabase ? null : demoBranding);
  const [loading, setLoading] = useState(Boolean(supabase));

  async function loadTenantsForUser(userId: string) {
    setLoading(true);
    const [{ data: memberships, error: membershipError }, { data, error }] = await Promise.all([
      supabase!
        .from("restaurant_members")
        .select("restaurant_id")
        .eq("user_id", userId),
      supabase!
        .from("restaurants")
        .select(
          "id, owner_id, organization_id, primary_branch_id, name, slug, status, owner_phone, restaurant_type, language, opening_hours, smart_open_enabled, onboarding_status, onboarding_checklist, created_at",
        )
        .order("created_at", { ascending: true }),
    ]);

    if (error || membershipError || !data) {
      console.error("Restaurants konnten nicht geladen werden.", error ?? membershipError);
      setRestaurants([]);
      setActiveRestaurantId("");
      setBranding(null);
      setLoading(false);
      return;
    }

    const memberRestaurantIds = new Set(
      ((memberships ?? []) as RestaurantMembership[]).map((membership) => membership.restaurant_id),
    );
    const nextRestaurants = (data as Restaurant[]).filter(
      (restaurant) => restaurant.owner_id === userId || memberRestaurantIds.has(restaurant.id),
    );
    setRestaurants(nextRestaurants);
    setActiveRestaurantId((current) =>
      nextRestaurants.some((restaurant) => restaurant.id === current) ? current : nextRestaurants[0]?.id || "",
    );
    setLoading(false);
  }

  useEffect(() => {
    if (!supabase || !user) {
      if (supabase) {
        setRestaurants([]);
        setActiveRestaurantId("");
        setBranding(null);
        setLoading(false);
      }
      return;
    }

    const userId = user.id;

    async function loadTenants() {
      await loadTenantsForUser(userId);
    }

    loadTenants();
  }, [user]);

  useEffect(() => {
    if (supabase) {
      return;
    }

    function refreshDemoTenant() {
      setRestaurants([readDemoRestaurant()]);
      setActiveRestaurantId(demoRestaurant.id);
    }

    window.addEventListener("wuxuai-demo-state-changed", refreshDemoTenant);
    return () => window.removeEventListener("wuxuai-demo-state-changed", refreshDemoTenant);
  }, []);

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
          await loadTenantsForUser(user.id);
          if (activeRestaurant?.id) {
            try {
              setBranding(await loadBrandingForRestaurant(activeRestaurant.id));
            } catch (error) {
              console.error("Restaurant-Aussehen konnte nicht aktualisiert werden.", error);
            }
          }
          return;
        }
        setRestaurants([readDemoRestaurant()]);
        setActiveRestaurantId(demoRestaurant.id);
      },
      setActiveRestaurantId,
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
