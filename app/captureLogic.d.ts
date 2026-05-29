export type CaptureStatus = "processing" | "ready" | "needs_review" | "failed";
export type ReviewReason = "intent" | "collection" | "analysis";
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
  collectionDecisions?: unknown[];
  reviewConfirmedAt?: number | null;
};

type StatusCapture = ReviewableCapture & {
  defaultIntent?: string;
  summary?: string;
  analysisProvider?: string;
};

type SortableCapture = StatusCapture & {
  id: string;
  createdAt: number;
  archivedAt?: number | null;
};

export const LOCAL_PROCESSING_GRACE_MS: number;
export function confidenceRequiresReview(value?: string): boolean;
export function displayStatus(capture: StatusCapture): CaptureStatus;
export function extractHttpUrl(value?: string | null): string;
export function hasExtractedData(capture: StatusCapture): boolean;
export function hostFromUrl(value?: string | null): string;
export function isArchived(capture: { archivedAt?: number | null }): boolean;
export function mapSearchCandidates(query?: string | null, platform?: string): MapSearchCandidate[];
export function mapsSearchUrls(query?: string | null): { google: string; apple: string };
export function mergeRemoteCaptures<T extends SortableCapture>(
  remoteCaptures: T[],
  currentCaptures: T[],
  listMode: "active" | "archived",
  now?: number
): T[];
export function normalizeIntent(value: string | undefined, allowedIntents?: string[]): string;
export function parseCaptureUrl(url?: string | null): string | null;
export function reviewReasonLabel(reason: ReviewReason): string;
export function reviewReasonSummary(reasons: ReviewReason[]): string;
export function reviewReasons(capture: ReviewableCapture): ReviewReason[];
export function sortCaptures<T extends { createdAt: number }>(captures: T[]): T[];
export function statusLabel(status: CaptureStatus): string;
