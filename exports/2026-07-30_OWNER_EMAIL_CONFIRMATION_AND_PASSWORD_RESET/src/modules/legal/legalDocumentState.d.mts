export type LegalDocumentLike = {
  content?: Record<string, unknown> | null;
} | null;

export type PointsValidityState =
  | { status: "available"; months: number }
  | { status: "missing_document" | "missing_published_content" | "missing_value"; months: null };

export declare function getLegalDocumentContent(document: LegalDocumentLike): Record<string, unknown> | null;
export declare function getPointsValidityState(document: LegalDocumentLike): PointsValidityState;
export declare function ownerLegalLoadErrorMessage(error: unknown): string;
