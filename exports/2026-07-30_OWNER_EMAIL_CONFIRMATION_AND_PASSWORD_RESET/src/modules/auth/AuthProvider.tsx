import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import { useLocation } from "react-router-dom";
import { liveDataUnavailableMessage, supabase } from "../../shared/lib/supabase";
import type { PlatformRole, RestaurantUserRole, UserRole } from "../../shared/types/domain";
import { requiresAuthenticatedSession } from "./authRoutePolicy.mjs";
import { classifyOwnerAuthError, isOwnerEmailConfirmed, ownerAuthErrorMessage } from "./ownerAuthFlow.mjs";

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  role: UserRole | null;
  restaurantRole: RestaurantUserRole | null;
  platformRole: PlatformRole | null;
  loading: boolean;
  lastAuthEvent: AuthChangeEvent | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const platformRoles: PlatformRole[] = [
  "platform_owner",
  "platform_admin",
  "app_admin",
  "super_admin",
  "wuxuai_admin",
  "support",
  "billing_admin",
  "security_admin",
  "viewer",
];
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
    return "customer";
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
    return null;
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
  const location = useLocation();
  const authSessionRequired = requiresAuthenticatedSession(location.pathname);
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(Boolean(supabase && authSessionRequired));
  const [roleLoading, setRoleLoading] = useState(Boolean(supabase && authSessionRequired));
  const [restaurantRole, setRestaurantRole] = useState<RestaurantUserRole | null>(null);
  const [platformRole, setPlatformRole] = useState<PlatformRole | null>(null);
  const [lastAuthEvent, setLastAuthEvent] = useState<AuthChangeEvent | null>(null);

  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false);
      setRoleLoading(false);
      return;
    }

    const authClient = supabase.auth;
    let cancelled = false;

    if (!authSessionRequired) {
      authClient.stopAutoRefresh();
      setAuthLoading(false);
      setRoleLoading(false);
    } else {
      setAuthLoading(true);
      authClient.startAutoRefresh();
      authClient.getSession()
        .then(({ data, error }) => {
          if (cancelled) return;
          if (error) {
            setSession(null);
            setUser(null);
            setRestaurantRole(null);
            setPlatformRole(null);
            setRoleLoading(false);
            return;
          }
          const nextUser = data.session?.user ?? null;
          setRoleLoading(Boolean(nextUser));
          setSession(data.session);
          setUser(nextUser);
        })
        .catch(() => {
          if (cancelled) return;
          setSession(null);
          setUser(null);
          setRestaurantRole(null);
          setPlatformRole(null);
          setRoleLoading(false);
        })
        .finally(() => {
          if (!cancelled) setAuthLoading(false);
        });
    }

    const {
      data: { subscription },
    } = authClient.onAuthStateChange((event, nextSession) => {
      if (!authSessionRequired && event !== "SIGNED_IN" && event !== "SIGNED_OUT") return;
      const nextUser = nextSession?.user ?? null;
      setRoleLoading(Boolean(nextUser));
      setSession(nextSession);
      setUser(nextUser);
      setLastAuthEvent(event);
      setAuthLoading(false);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      if (authSessionRequired) authClient.stopAutoRefresh();
    };
  }, [authSessionRequired]);

  useEffect(() => {
    let cancelled = false;

    async function resolveRole() {
      if (!user) {
        setRestaurantRole(null);
        setPlatformRole(null);
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
      lastAuthEvent,
      role: restaurantRole,
      restaurantRole,
      platformRole,
      loading: authLoading || roleLoading,
      async signIn(email: string, password: string) {
        if (!supabase) {
          throw new Error(liveDataUnavailableMessage);
        }
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          const mappedError = new Error(ownerAuthErrorMessage(error));
          mappedError.name = classifyOwnerAuthError(error) === "email_unconfirmed"
            ? "EmailConfirmationRequiredError"
            : "OwnerSignInError";
          throw mappedError;
        }
        if (!isOwnerEmailConfirmed(data.user)) {
          await supabase.auth.signOut({ scope: "local" });
          const confirmationError = new Error("Bitte bestätige zuerst deine E-Mail-Adresse.");
          confirmationError.name = "EmailConfirmationRequiredError";
          throw confirmationError;
        }
      },
      async signOut() {
        let logoutFailed = false;

        try {
          if (supabase) {
            const { error } = await supabase.auth.signOut();
            const sessionAlreadyMissing = error?.name === "AuthSessionMissingError";
            logoutFailed = Boolean(error && !sessionAlreadyMissing);
            if (error) {
              await supabase.auth.signOut({ scope: "local" });
            }
          }
        } catch {
          logoutFailed = true;
        } finally {
          setSession(null);
          setUser(null);
          setRestaurantRole(null);
          setPlatformRole(null);
          setLastAuthEvent("SIGNED_OUT");
          setAuthLoading(false);
          setRoleLoading(false);
        }

        if (logoutFailed) {
          throw new Error("Die Online-Abmeldung konnte gerade nicht vollständig bestätigt werden.");
        }
      },
    }),
    [authLoading, lastAuthEvent, platformRole, restaurantRole, roleLoading, session, user],
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
