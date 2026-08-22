import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "../../shared/lib/supabase";
import { classifyCustomerSignUpResult, type CustomerSignUpState } from "./customerAuthFlow.mjs";

type RegisterCustomerAuthInput = {
  birthday: string | null;
  email: string;
  firstName: string;
  origin: string;
  password: string;
  phone: string;
  returnTo: string;
};

function requireCustomerAuthClient(client: SupabaseClient | null): SupabaseClient {
  if (!client) throw new Error("customer_auth_unavailable");
  return client;
}

export async function registerCustomerAuthAccount(
  input: RegisterCustomerAuthInput,
  client: SupabaseClient | null = supabase,
): Promise<CustomerSignUpState> {
  const authClient = requireCustomerAuthClient(client);
  const callbackUrl = new URL("/customer/auth/callback", input.origin);
  const { data, error } = await authClient.auth.signUp({
    email: input.email.trim().toLowerCase(),
    password: input.password,
    options: {
      emailRedirectTo: callbackUrl.toString(),
      data: {
        customer_first_name: input.firstName.trim(),
        customer_phone: input.phone,
        customer_birthday: input.birthday || null,
        customer_return_to: input.returnTo,
      },
    },
  });
  if (error) throw error;
  return classifyCustomerSignUpResult(data);
}

export async function resendCustomerConfirmation(
  email: string,
  origin: string,
  client: SupabaseClient | null = supabase,
) {
  const authClient = requireCustomerAuthClient(client);
  const callbackUrl = new URL("/customer/auth/callback", origin);
  const { error } = await authClient.auth.resend({
    type: "signup",
    email: email.trim().toLowerCase(),
    options: { emailRedirectTo: callbackUrl.toString() },
  });
  if (error) throw error;
}
