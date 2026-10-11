import type { AuthChangeEvent } from "@supabase/supabase-js";

export function shouldPreserveAuthorizedSurface(input: {
  event: AuthChangeEvent;
  currentUserId: string | null | undefined;
  nextUserId: string | null | undefined;
}): boolean;
