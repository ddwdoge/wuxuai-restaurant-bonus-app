import type { LegalDocumentView, RestaurantLegalSetup } from "./legalService";

export type OwnerLegalStatus = {
  id: "company" | "documents" | "publication" | "registration" | "program";
  label: string;
  state: "complete" | "warning" | "open" | "blocked";
  value: string;
};

export declare function resolveOwnerLegalReadiness(
  registration: RestaurantLegalSetup["readiness"]["registration"],
  options?: { hasDrafts?: boolean; publicationConfirmed?: boolean },
): {
  companyDataReady: boolean;
  documentsPrepared: boolean;
  documentsPublished: boolean;
  registrationEnabled: boolean;
  programActive: boolean;
  action: { id: string; label: string; kind: "company" | "prepare" | "review" | "publish" | "view" };
  statuses: OwnerLegalStatus[];
};

export declare function validateLegalPublication(
  documents: LegalDocumentView[],
  effectiveDate: string,
  confirmed: boolean,
): string | null;

export declare function legalPublicationErrorMessage(error: unknown): string;
