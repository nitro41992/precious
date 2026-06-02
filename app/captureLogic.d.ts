export type CaptureStatus = "processing" | "ready" | "needs_review" | "failed";
export type ReviewReason = "intent" | "collections" | "reminder" | "analysis";
export type MapProvider = "google" | "apple";
export type MapSearchCandidate = {
  provider: MapProvider;
  label: string;
  url: string;
};

type ReviewableCapture = {
  status: CaptureStatus;
  needsReview?: boolean;
  confidenceLabel?: string;
  reviewConfirmedAt?: number | null;
  reviewTargets?: ReviewReason[];
  reviewRationale?: {
    focus?: string;
  };
  defaultIntent?: string;
};

type StatusCapture = ReviewableCapture & {
  defaultIntent?: string;
  summary?: string;
  analysisProvider?: string;
};

type SortableCapture = StatusCapture & {
  id: string;
  remoteId?: string;
  createdAt: number;
  archivedAt?: number | null;
  deletedAt?: number | null;
  rejectedAt?: number | null;
  analysisMode?: string;
};

export const LOCAL_PROCESSING_GRACE_MS: number;
export const REVIEW_TARGETS: ReviewReason[];
export function captureIdentityAliases(capture?: { id?: string; remoteId?: string } | null): string[];
export function capturesForListMode<T extends { archivedAt?: number | null; deletedAt?: number | null; rejectedAt?: number | null; analysisMode?: string }>(
  captures: T[] | null | undefined,
  listMode: "active" | "archived"
): T[];
export function capturesForSearchScope<T extends { archivedAt?: number | null; deletedAt?: number | null; rejectedAt?: number | null; analysisMode?: string }>(
  captures: T[] | null | undefined,
  scope: "active" | "archived" | "all" | string
): T[];
export function capturesShareIdentity(
  left?: { id?: string; remoteId?: string } | null,
  right?: { id?: string; remoteId?: string } | null
): boolean;
export function confidenceRequiresReview(value?: string): boolean;
export function displayStatus(capture: StatusCapture): CaptureStatus;
export function extractHttpUrl(value?: string | null): string;
export function hasExtractedData(capture: StatusCapture): boolean;
export function hostFromUrl(value?: string | null): string;
export function isArchived(capture: { archivedAt?: number | null }): boolean;
export function isDeleted(capture: { archivedAt?: number | null; deletedAt?: number | null }): boolean;
export function isRejected(capture: { rejectedAt?: number | null; analysisMode?: string }): boolean;
export function mapSearchCandidates(query?: string | null, platform?: string): MapSearchCandidate[];
export function mapsSearchUrls(query?: string | null): { google: string; apple: string };
export function mergeRemoteCaptures<T extends SortableCapture>(
  remoteCaptures: T[],
  currentCaptures: T[],
  listMode: "active" | "archived",
  now?: number
): T[];
export function mergeSearchResults<T extends { id?: string; remoteId?: string }>(
  immediateResults: T[],
  rankedResults: T[]
): T[];
export function normalizeIntent(value: string | undefined, allowedIntents?: string[]): string;
export function normalizeReviewTargets(value?: unknown): ReviewReason[];
export function normalizeSearchQuery(value?: string | null): string;
export function parseCaptureUrl(url?: string | null): string | null;
export function reviewReasonLabel(reason: ReviewReason): string;
export function reviewReasonSummary(reasons: ReviewReason[]): string;
export function reviewReasons(capture: ReviewableCapture): ReviewReason[];
export function reviewTargetsForCapture(capture: ReviewableCapture): ReviewReason[];
export function searchCacheKey(scope: "active" | "archived" | "all" | string, query?: string | null): string;
export function sortCaptures<T extends { createdAt: number }>(captures: T[]): T[];
export function statusLabel(status: CaptureStatus): string;
export function uniqueCapturesByIdentity<T extends { id?: string; remoteId?: string }>(captures: T[]): T[];
