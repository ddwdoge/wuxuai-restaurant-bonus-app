import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "../../shared/lib/supabase";
import type { PlatformRole, RestaurantUserRole, UserRole } from "../../shared/types/domain";

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  role: UserRole | null;
  restaurantRole: RestaurantUserRole | null;
  platformRole: PlatformRole | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const demoUser = {
  id: "demo-user",
  email: "demo@example.test",
  app_metadata: { role: "owner" },
  aud: "authenticated",
  created_at: new Date().toISOString(),
  user_metadata: {},
} as User;

const platformRoles: PlatformRole[] = ["platform_owner", "platform_admin", "support", "billing_admin", "security_admin", "viewer"];
const restaurantRoles: RestaurantUserRole[] = ["owner", "admin", "manager", "staff", "supervisor", "customer"];
const restaurantRolePriority: RestaurantUserRole[] = ["owner", "admin", "manager"];

function readAppMetadataRestaurantRole(user: User | null): RestaurantUserRole {
  const metadataRole = user?.app_metadata?.role;
  return typeof metadataRole === "string" && restaurantRoles.includes(metadataRole as RestaurantUserRole)
    ? (metadataRole as RestaurantUserRole)
    : "customer";
}

function readAppMetadataPlatformRole(user: User | null): PlatformRole | null {
  const metadataRole = user?.app_metadata?.role;
  return typeof metadataRole === "string" && platformRoles.includes(metadataRole as PlatformRole)
    ? (metadataRole as PlatformRole)
    : null;
}

async function readVerifiedRestaurantRole(user: User): Promise<RestaurantUserRole> {
  if (!supabase) {
    return readAppMetadataRestaurantRole(user);
  }

  const { data, error } = await supabase
    .from("restaurant_members")
    .select("role")
    .eq("user_id", user.id);

  if (!error && data?.length) {
    const roles = data.map((membership) => membership.role as RestaurantUserRole);
    return restaurantRolePriority.find((role) => roles.includes(role)) ?? "customer";
  }

  return readAppMetadataRestaurantRole(user);
}

async function readVerifiedPlatformRole(user: User): Promise<PlatformRole | null> {
  if (!supabase) {
    return readAppMetadataPlatformRole(user);
  }

  const metadataRole = readAppMetadataPlatformRole(user);
  if (metadataRole) {
    return metadataRole;
  }

  const { data, error } = await supabase.rpc("get_current_platform_role");
  if (error) {
    console.warn("Plattformrolle konnte nicht geprüft werden.", error);
    return null;
  }

  return typeof data === "string" && platformRoles.includes(data as PlatformRole) ? (data as PlatformRole) : null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(isSupabaseConfigured ? null : demoUser);
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured);
  const [roleLoading, setRoleLoading] = useState(isSupabaseConfigured);
  const [restaurantRole, setRestaurantRole] = useState<RestaurantUserRole | null>(isSupabaseConfigured ? null : "owner");
  const [platformRole, setPlatformRole] = useState<PlatformRole | null>(null);

  useEffect(() => {
    if (!supabase) {
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      const nextUser = data.session?.user ?? null;
      setRoleLoading(Boolean(nextUser));
      setSession(data.session);
      setUser(nextUser);
      setAuthLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      const nextUser = nextSession?.user ?? null;
      setRoleLoading(Boolean(nextUser));
      setSession(nextSession);
      setUser(nextUser);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function resolveRole() {
      if (!user) {
        setRestaurantRole(null);
        setPlatformRole(null);
        setRoleLoading(false);
        return;
      }

      if (!supabase) {
        setRestaurantRole(readAppMetadataRestaurantRole(user));
        setPlatformRole(readAppMetadataPlatformRole(user));
        setRoleLoading(false);
        return;
      }

      setRoleLoading(true);
      try {
        const [nextRestaurantRole, nextPlatformRole] = await Promise.all([
          readVerifiedRestaurantRole(user),
          readVerifiedPlatformRole(user),
        ]);
        if (!cancelled) {
          setRestaurantRole(nextRestaurantRole);
          setPlatformRole(nextPlatformRole);
        }
      } catch {
        if (!cancelled) {
          setRestaurantRole("customer");
          setPlatformRole(null);
        }
      } finally {
        if (!cancelled) {
          setRoleLoading(false);
        }
      }
    }

    resolveRole();

    return () => {
      cancelled = true;
    };
  }, [user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      role: restaurantRole,
      restaurantRole,
      platformRole,
      loading: authLoading || roleLoading,
      async signIn(email: string, password: string) {
        if (!supabase) {
          setUser({ ...demoUser, email });
          return;
        }
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      },
      async signOut() {
        if (!supabase) {
          setUser(null);
          return;
        }
        await supabase.auth.signOut();
      },
    }),
    [authLoading, platformRole, restaurantRole, roleLoading, session, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}
