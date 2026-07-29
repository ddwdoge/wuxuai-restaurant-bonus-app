export type LegalReadinessDocument = {
  document_type: string;
  version?: string | null;
  status?: string | null;
  effective_date?: string | null;
};

export function requiredLegalDocumentStatus(
  documents: LegalReadinessDocument[],
  todayIso: string,
): Array<{
  documentType: string;
  document: LegalReadinessDocument | null;
  exists: boolean;
  published: boolean;
  effective: boolean;
  ready: boolean;
}>;

export function isLegalBundleReady(
  documents: LegalReadinessDocument[],
  todayIso: string,
): boolean;
