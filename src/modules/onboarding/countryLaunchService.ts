import { supabase } from "../../shared/lib/supabase";

export type LaunchCountry = { code: string; enabled: boolean };
export async function loadRegistrationCountries(): Promise<LaunchCountry[]> {
  if (!supabase) throw new Error("Länderfreigabe derzeit nicht verfügbar.");
  const { data, error } = await supabase.rpc("get_registration_countries");
  if (error || !Array.isArray(data) || !data.every((row) =>
    typeof row?.code === "string" && /^[A-Z]{2}$/.test(row.code) && typeof row.enabled === "boolean")) {
    throw new Error("Länderfreigabe derzeit nicht verfügbar.");
  }
  return data;
}

export async function requireRegistrationCountry(country: string) {
  const countries = await loadRegistrationCountries();
  if (!countries.some((entry) => entry.code === country && entry.enabled)) {
    throw new Error("Für dieses Betriebsland ist die Registrierung noch nicht freigegeben.");
  }
}
