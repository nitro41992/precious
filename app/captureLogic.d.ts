export type CaptureStatus = "processing" | "ready" | "needs_review" | "failed";
export type ReviewReason = "intent" | "collections" | "reminder" | "analysis";
export type MapProvider = "google" | "apple";
export type MapSearchCandidate = {
  provider: MapProvider;
  label: string;
  url: string;
};
export type MapSearchVisitTarget = {
  name?: string | null;
  query?: string | null;
  resolvedPlace?: MapResolvedPlace | null;
};
export type MapResolvedPlace = {
  status?: string | null;
  placeId?: string | null;
  displayName?: string | null;
  formattedAddress?: string | null;
  resolvedQuery?: string | null;
  googleMapsUri?: string | null;
  location?: { latitude?: number | null; longitude?: number | null } | null;
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
  linkedCollections?: Array<{ id: string }>;
};

export type CollectionSelectionActionState = {
  pendingReview: boolean;
  selectionChanged: boolean;
  shouldSave: boolean;
  label: string;
};

export type CaptureFieldStateInput = {
  kind: "purpose" | "collection" | "later" | string;
  value?: string | null;
  emptyLabel: string;
};

export type CaptureFieldState = {
  kind: string;
  value: string;
  displayValue: string;
  hasValue: boolean;
  isEmpty: boolean;
  canEdit: boolean;
};

export type CaptureFieldRationaleVisibilityInput = ReviewableCapture & {
  aiDefaultIntent?: string;
  intentRationale?: string;
  fieldRationales?: {
    purpose?: {
      selectionKey?: string | null;
      selectionLabel?: string | null;
      text?: string | null;
    };
    collections?: Array<{
      collectionId?: string | null;
      selectionLabel?: string | null;
      text?: string | null;
    }>;
    reminder?: {
      triggerValue?: string | null;
      startDate?: string | null;
      endDate?: string | null;
      startTime?: string | null;
      endTime?: string | null;
      text?: string | null;
    };
  };
  linkedCollections?: Array<{
    id: string;
    createdBy?: string;
    rationale?: string | null;
  }>;
  suggestedReminders?: Array<{
    trigger_value?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    start_time?: string | null;
    end_time?: string | null;
    rationale?: string | null;
    source?: string | null;
  }>;
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
export function captureIntentPatchBody(
  captureId: string,
  currentSaveIntent: string | null | undefined
): {
  captureId: string;
  currentSaveIntent: string | null;
};
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
export function collectionSelectionActionState(
  capture: ReviewableCapture,
  selectedCollectionIds?: string[],
  currentCollectionIds?: string[]
): CollectionSelectionActionState;
export function collectionCollageSlots<T extends {
  id?: string;
  remoteId?: string;
  imageAssetUrl?: string;
  image_asset_url?: string;
  thumbnailUrl?: string;
  thumbnail_url?: string;
  urlEvidenceImageUrl?: string;
  url_evidence_image_url?: string;
}>(
  previewCaptures?: T[] | null,
  limit?: number
): T[];
export function confidenceRequiresReview(value?: string): boolean;
export function displayStatus(capture: StatusCapture): CaptureStatus;
export function extractHttpUrl(value?: string | null): string;
export function normalizeCaptureLink(value?: string | null): string;
export function hasExtractedData(capture: StatusCapture): boolean;
export function hostFromUrl(value?: string | null): string;
export function captureFieldState(input?: CaptureFieldStateInput): CaptureFieldState;
export function captureFieldRationaleVisible(
  capture: CaptureFieldRationaleVisibilityInput,
  field: "purpose" | "collection" | "later" | string,
  options?: { allowedIntents?: string[]; collectionSelectionIds?: string[] }
): boolean;
export function isArchived(capture: { archivedAt?: number | null }): boolean;
export function isDeleted(capture: { archivedAt?: number | null; deletedAt?: number | null }): boolean;
export function isRejected(capture: { rejectedAt?: number | null; analysisMode?: string }): boolean;
export function mapSearchCandidates(query?: string | null, platform?: string): MapSearchCandidate[];
export function mapSearchCandidatesForResolvedPlace(place?: MapResolvedPlace | null, fallbackQuery?: string | null, platform?: string): MapSearchCandidate[];
export function mapSearchCandidatesForVisitTarget(target?: MapSearchVisitTarget | null, platform?: string): MapSearchCandidate[];
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
