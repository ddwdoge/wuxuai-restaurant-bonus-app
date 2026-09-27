import { supabase } from "../../shared/lib/supabase";

export type KybIntakeProfileInput = {
  countryCode: string;
  gisaNumber: string;
  ownerIsAuthorizedRepresentative: boolean;
  authorizedRepresentativeName: string;
  authorizedRepresentativeRole: string;
  commercialRegisterApplicable: boolean;
  commercialRegisterNumber: string;
};

export type KybIntakeSummary = KybIntakeProfileInput & {
  companyName: string;
  legalForm: string;
  street: string;
  postalCode: string;
  city: string;
  status: "COMPLETE" | "INCOMPLETE";
  missingFields: string[];
};

const AUSTRIAN_REGISTERED_FORMS = /(^|\s)(gmbh|ag|og|kg|flexco|flexible kapitalgesellschaft)(\s|$)/i;

export function legalFormRequiresCommercialRegister(legalForm: string, country: string) {
  return country.trim().toUpperCase() === "AT" || country.trim().toLowerCase() === "österreich"
    ? AUSTRIAN_REGISTERED_FORMS.test(legalForm.trim())
    : false;
}

export function validateKybIntakeProfile(input: KybIntakeProfileInput) {
  const missing: string[] = [];
  if (input.countryCode.trim().toUpperCase() === "AT") {
    if (input.gisaNumber.trim().length < 2) missing.push("GISA-Zahl");
    if (input.authorizedRepresentativeName.trim().length < 2) missing.push("vertretungsberechtigte Person");
    if (input.authorizedRepresentativeRole.trim().length < 2) missing.push("Funktion der vertretungsberechtigten Person");
    if (input.commercialRegisterApplicable && input.commercialRegisterNumber.trim().length < 2) {
      missing.push("Firmenbuchnummer");
    }
  }
  return missing;
}

export async function saveOwnerKybIntakeProfile(restaurantId: string, input: KybIntakeProfileInput) {
  if (!supabase) throw new Error("KYB-Daten konnten nicht gespeichert werden.");
  const { data, error } = await supabase.rpc("save_owner_kyb_intake_profile", {
    input_restaurant_id: restaurantId,
    input_profile: {
      country_code: input.countryCode.trim().toUpperCase(),
      gisa_number: input.gisaNumber.trim(),
      owner_is_authorized_representative: input.ownerIsAuthorizedRepresentative,
      authorized_representative_name: input.authorizedRepresentativeName.trim(),
      authorized_representative_role: input.authorizedRepresentativeRole.trim(),
      commercial_register_applicable: input.commercialRegisterApplicable,
      commercial_register_number: input.commercialRegisterApplicable
        ? input.commercialRegisterNumber.trim()
        : null,
    },
  });
  if (error) throw error;
  return data as KybIntakeSummary;
}

export async function readOwnerKybIntakeSummary(restaurantId: string) {
  if (!supabase) throw new Error("KYB-Daten konnten nicht geladen werden.");
  const { data, error } = await supabase.rpc("get_owner_kyb_intake_summary", {
    input_restaurant_id: restaurantId,
  });
  if (error || !data || typeof data !== "object") throw error ?? new Error("KYB-Daten fehlen.");
  const value = data as Record<string, unknown>;
  return {
    companyName: String(value.company_name ?? ""),
    legalForm: String(value.legal_form ?? ""),
    countryCode: String(value.country_code ?? ""),
    street: String(value.street ?? ""),
    postalCode: String(value.postal_code ?? ""),
    city: String(value.city ?? ""),
    gisaNumber: String(value.gisa_number ?? ""),
    ownerIsAuthorizedRepresentative: value.owner_is_authorized_representative === true,
    authorizedRepresentativeName: String(value.authorized_representative_name ?? ""),
    authorizedRepresentativeRole: String(value.authorized_representative_role ?? ""),
    commercialRegisterApplicable: value.commercial_register_applicable === true,
    commercialRegisterNumber: String(value.commercial_register_number ?? ""),
    status: value.status === "COMPLETE" ? "COMPLETE" : "INCOMPLETE",
    missingFields: Array.isArray(value.missing_fields) ? value.missing_fields.map(String) : [],
  } satisfies KybIntakeSummary;
}
