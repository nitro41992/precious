const LOCAL_PROCESSING_GRACE_MS = 30 * 60 * 1000;
const REVIEW_TARGETS = ["collections", "reminder", "analysis"];
const REVIEW_TARGET_SET = new Set(REVIEW_TARGETS);
const CAPTURE_LINK_PATTERN = /^(?:https?:\/\/)?(?=.{1,2048}$)(?!.*\s)(?!.*@)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}(?::[0-9]{1,5})?(?:[/?#][^\s]*)?$/i;
const CAPTURE_LINK_HOST_PATTERN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

function hostFromUrl(value) {
  if (!value) return "";
  try {
    return new URL(value).host.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function extractHttpUrl(value) {
  const match = String(value || "").match(/https?:\/\/\S+/i);
  if (!match) return "";
  try {
    const url = new URL(match[0].replace(/[),.;\]]+$/g, ""));
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function normalizeCaptureLink(value) {
  const raw = String(value || "").trim();
  if (!raw || !CAPTURE_LINK_PATTERN.test(raw)) return "";
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    if (url.username || url.password) return "";
    if (!CAPTURE_LINK_HOST_PATTERN.test(url.hostname)) return "";
    return url.toString();
  } catch {
    return "";
  }
}

function parseCaptureUrl(url) {
  if (!url) return null;
  const id = url.match(/preciouscaptures:\/\/capture\/([^/?#]+)/)?.[1];
  return id ? decodeURIComponent(id) : null;
}

function normalizeIntent(value, allowedIntents = []) {
  if (!value) return "";
  return allowedIntents.includes(value) ? value : "";
}

function mapsSearchUrls(query) {
  const cleaned = String(query || "").trim();
  if (!cleaned) return { google: "", apple: "" };
  const encoded = encodeURIComponent(cleaned);
  return {
    google: `https://www.google.com/maps/search/?api=1&query=${encoded}`,
    apple: `https://maps.apple.com/?q=${encoded}`
  };
}

function coordinateQuery(location) {
  const latitude = Number(location?.latitude);
  const longitude = Number(location?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return "";
  return `${latitude},${longitude}`;
}

function resolvedPlaceSearchText(place, fallback = "") {
  return String(place?.displayName || place?.formattedAddress || place?.resolvedQuery || fallback || "").trim();
}

function mapSearchCandidatesForResolvedPlace(place, fallbackQuery = "", platform = "") {
  if (!place || place.status !== "resolved") return [];
  const searchText = resolvedPlaceSearchText(place, fallbackQuery);
  const placeId = String(place.placeId || "").trim();
  const coordinates = coordinateQuery(place.location);
  const encodedSearch = encodeURIComponent(searchText || coordinates);
  const encodedPlaceId = encodeURIComponent(placeId);
  const candidates = [];
  if (placeId && encodedSearch) {
    candidates.push({
      provider: "google",
      label: "Google Maps",
      url: `https://www.google.com/maps/search/?api=1&query=${encodedSearch}&query_place_id=${encodedPlaceId}`
    });
  } else if (place.googleMapsUri) {
    candidates.push({
      provider: "google",
      label: "Google Maps",
      url: String(place.googleMapsUri)
    });
  }
  if ((platform === "ios" || platform === "") && (coordinates || searchText)) {
    const appleUrl = coordinates
      ? `maps://?ll=${encodeURIComponent(coordinates)}&q=${encodeURIComponent(searchText || coordinates)}`
      : `maps://?q=${encodeURIComponent(searchText)}`;
    candidates.push({
      provider: "apple",
      label: "Apple Maps",
      url: platform === "" && coordinates
        ? `https://maps.apple.com/?ll=${encodeURIComponent(coordinates)}&q=${encodeURIComponent(searchText || coordinates)}`
        : appleUrl
    });
  }
  if (!candidates.length && searchText) return mapSearchCandidates(searchText, platform);
  return candidates;
}

function mapSearchCandidates(query, platform = "") {
  const cleaned = String(query || "").trim();
  if (!cleaned) return [];
  const encoded = encodeURIComponent(cleaned);
  if (platform === "android") {
    return [
      {
        provider: "google",
        label: "Google Maps",
        url: `geo:0,0?q=${encoded}`
      }
    ];
  }
  if (platform === "ios") {
    return [
      {
        provider: "apple",
        label: "Apple Maps",
        url: `maps://?q=${encoded}`
      },
      {
        provider: "google",
        label: "Google Maps",
        url: `comgooglemaps://?q=${encoded}`
      }
    ];
  }
  const urls = mapsSearchUrls(cleaned);
  return [
    { provider: "google", label: "Google Maps", url: urls.google },
    { provider: "apple", label: "Apple Maps", url: urls.apple }
  ].filter((candidate) => candidate.url);
}

function mapSearchCandidatesForVisitTarget(target, platform = "") {
  const name = String(target?.name || "").trim();
  const query = String(target?.query || "").trim();
  const resolvedCandidates = mapSearchCandidatesForResolvedPlace(
    target?.resolvedPlace,
    name || query,
    platform
  );
  if (resolvedCandidates.length) return resolvedCandidates;
  return mapSearchCandidates(name || query, platform);
}

function isArchived(capture) {
  return Boolean(capture.archivedAt);
}

function isDeleted(capture) {
  return Boolean(capture.deletedAt || capture.archivedAt);
}

function isRejected(capture) {
  return Boolean(capture.rejectedAt || capture.analysisMode === "contextless_rejected");
}

function capturesForListMode(captures, listMode) {
  if (listMode === "archived") return [];
  return (captures || []).filter((capture) =>
    !isRejected(capture) && !isDeleted(capture)
  );
}

function capturesForSearchScope(captures, scope) {
  return capturesForListMode(captures, "active");
}

function statusLabel(status) {
  if (status === "processing") return "Processing";
  if (status === "needs_review") return "Needs review";
  if (status === "failed") return "Failed";
  return "Ready";
}

function hasExtractedData(capture) {
  // A failed run still stamps analysisProvider (e.g. "openai") even when it produced nothing, so
  // the provider is NOT evidence of real output — only actual extracted content is. Without this,
  // a crashed/llm_failed capture with no intent or summary displayed as "ready/Saved link",
  // hiding its recovery UI (the "Try again" button and the "add a photo" prompt).
  return Boolean(capture.defaultIntent || capture.summary);
}

function confidenceRequiresReview(value) {
  return value === "Maybe" || value === "Not sure" || value === "Couldn't tell";
}

function normalizeReviewTargets(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const targets = [];
  for (const item of value) {
    const target = String(item || "").trim();
    if (!REVIEW_TARGET_SET.has(target) || seen.has(target)) continue;
    seen.add(target);
    targets.push(target);
  }
  return targets;
}

function inferredReviewTargets(capture) {
  const targets = [];
  const focus = String(capture.reviewRationale?.focus || "").toLowerCase();
  if (/\b(link|analysis|source|context|details?)\b/.test(focus)) {
    targets.push("analysis");
  }
  if ((capture.needsReview || capture.status === "needs_review") && !targets.length) {
    targets.push("analysis");
  }
  return normalizeReviewTargets(targets);
}

function reviewTargetsForCapture(capture) {
  if (capture.reviewConfirmedAt || capture.status === "processing" || capture.status === "failed") return [];
  if (Array.isArray(capture.reviewTargets)) return normalizeReviewTargets(capture.reviewTargets).filter((target) => target === "analysis");
  return inferredReviewTargets(capture);
}

function sameStringSet(left, right) {
  const leftSet = new Set((left || []).map(String).filter(Boolean));
  const rightSet = new Set((right || []).map(String).filter(Boolean));
  if (leftSet.size !== rightSet.size) return false;
  for (const item of leftSet) {
    if (!rightSet.has(item)) return false;
  }
  return true;
}

function collectionSelectionActionState(capture, selectedCollectionIds, currentCollectionIds) {
  const selectedIds = Array.isArray(selectedCollectionIds) ? selectedCollectionIds : [];
  const currentIds = Array.isArray(currentCollectionIds)
    ? currentCollectionIds
    : (capture.linkedCollections || []).map((collection) => collection.id);
  const selectionChanged = !sameStringSet(selectedIds, currentIds);
  const pendingReview = reviewTargetsForCapture(capture).includes("collections");
  const shouldSave = selectionChanged || pendingReview;
  return {
    pendingReview,
    selectionChanged,
    shouldSave,
    label: selectionChanged
      ? "Save"
      : pendingReview && selectedIds.length === 0
        ? "Confirm no collection"
        : pendingReview
          ? "Confirm collections"
          : "Done"
  };
}

function collectionCollageSlots(previewCaptures, limit = 4) {
  if (!Array.isArray(previewCaptures)) return [];
  const max = Math.max(1, Math.min(Number(limit) || 4, 4));
  const seen = new Set();
  const slots = [];
  for (const capture of previewCaptures) {
    if (!capture || typeof capture !== "object") continue;
    const imageUri = String(
      capture.imageAssetUrl ||
        capture.image_asset_url ||
        capture.sourcePreviewAssetUrl ||
        capture.source_preview_asset_url ||
        capture.thumbnailUrl ||
        capture.thumbnail_url ||
        capture.urlEvidenceImageUrl ||
        capture.url_evidence_image_url ||
        ""
    ).trim();
    if (!imageUri) continue;
    const id = String(capture.id || capture.remoteId || "");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    slots.push(capture);
    if (slots.length >= max) break;
  }
  return slots;
}

function captureFieldState(input = {}) {
  const kind = input.kind;
  const value = String(input.value || "").trim();
  const emptyLabel = String(input.emptyLabel || "");
  const hasValue = Boolean(value);
  return {
    kind,
    value,
    displayValue: hasValue ? value : emptyLabel,
    hasValue,
    isEmpty: !hasValue,
    canEdit: true
  };
}

function sameStringSet(left = [], right = []) {
  const leftSet = new Set(left.filter(Boolean));
  const rightSet = new Set(right.filter(Boolean));
  if (leftSet.size !== rightSet.size) return false;
  for (const value of leftSet) {
    if (!rightSet.has(value)) return false;
  }
  return true;
}

function reminderFieldSelectionMatches(reminder, fieldReminder) {
  if (!reminder || !fieldReminder) return false;
  const checks = [
    [reminder.trigger_value, fieldReminder.triggerValue],
    [reminder.start_date, fieldReminder.startDate],
    [reminder.end_date, fieldReminder.endDate],
    [reminder.start_time, fieldReminder.startTime],
    [reminder.end_time, fieldReminder.endTime]
  ];
  return checks.every(([current, aiValue]) => !aiValue || String(current || "") === String(aiValue || ""));
}

function fieldPurposeSelectionKey(capture) {
  const purpose = capture.fieldRationales?.purpose;
  if (purpose && Object.prototype.hasOwnProperty.call(purpose, "selectionKey")) {
    return purpose.selectionKey || "";
  }
  return capture.aiDefaultIntent || capture.defaultIntent || "";
}

function fieldCollectionIds(capture) {
  return (capture.fieldRationales?.collections || [])
    .map((collection) => collection.collectionId || "")
    .filter(Boolean);
}

function hasNoCollectionFieldRationale(capture) {
  return (capture.fieldRationales?.collections || []).some((collection) =>
    !collection.collectionId && collection.text
  );
}

function fieldReminderHasNoSelection(fieldReminder) {
  if (!fieldReminder?.text) return false;
  return !fieldReminder.startDate &&
    !fieldReminder.endDate &&
    !fieldReminder.startTime &&
    !fieldReminder.endTime;
}

function captureFieldRationaleVisible(capture, field, options = {}) {
  if (!capture) return false;
  if (field === "purpose") {
    const allowedIntents = options.allowedIntents || [];
    const rawCurrentIntent = capture.defaultIntent;
    const rawAiIntent = fieldPurposeSelectionKey(capture);
    const currentIntent = allowedIntents.length
      ? normalizeIntent(rawCurrentIntent, allowedIntents)
      : String(rawCurrentIntent || "");
    const aiIntent = allowedIntents.length
      ? normalizeIntent(rawAiIntent, allowedIntents)
      : String(rawAiIntent || "");
    const hasText = Boolean(capture.fieldRationales?.purpose?.text || capture.intentRationale);
    return Boolean(hasText && currentIntent === aiIntent);
  }
  if (field === "collection") {
    const aiCollectionIds = fieldCollectionIds(capture);
    const fallbackAiCollectionIds = (capture.linkedCollections || [])
      .filter((collection) => collection.createdBy === "analysis")
      .map((collection) => collection.id);
    const expectedIds = aiCollectionIds.length ? aiCollectionIds : fallbackAiCollectionIds;
    const noCollectionRationale = hasNoCollectionFieldRationale(capture);
    const currentIds = options.collectionSelectionIds ||
      (capture.linkedCollections || []).map((collection) => collection.id);
    const hasText = Boolean(
      (capture.fieldRationales?.collections || []).some((collection) => collection.text) ||
        (capture.linkedCollections || []).some((collection) => collection.createdBy === "analysis" && collection.rationale)
    );
    return Boolean(hasText && (expectedIds.length || noCollectionRationale) && sameStringSet(currentIds, expectedIds));
  }
  if (field === "later") {
    const reminder = (capture.suggestedReminders || [])[0];
    const fieldReminder = capture.fieldRationales?.reminder;
    const structuredText = fieldReminder?.text;
    const hasText = Boolean(structuredText || reminder?.rationale);
    if (!hasText || reminder?.source === "manual") return false;
    if (structuredText && fieldReminderHasNoSelection(fieldReminder)) return !reminder;
    if (structuredText) return reminderFieldSelectionMatches(reminder, fieldReminder);
    return true;
  }
  return false;
}

function reviewReasons(capture) {
  return reviewTargetsForCapture(capture);
}

function reviewReasonLabel(reason) {
  if (reason === "collections") return "Collection needs review";
  if (reason === "reminder") return "Reminder needs review";
  return "Analysis needs review";
}

function reviewReasonSummary(reasons) {
  return reasons.map(reviewReasonLabel).join(", ");
}

function displayStatus(capture) {
  if (reviewReasons(capture).length > 0) return "needs_review";
  if (capture.status === "needs_review" && Array.isArray(capture.reviewTargets)) return "ready";
  if (capture.status === "failed" && hasExtractedData(capture)) return "ready";
  return capture.status;
}

// Recency used for ordering AND date-grouping. sortAt is a client-only override (set on
// "Try again") so a re-activated capture floats to the top; everything else uses createdAt.
function captureSortValue(capture) {
  return capture?.sortAt || capture?.createdAt || 0;
}

function sortCaptures(captures) {
  return [...captures].sort((a, b) => captureSortValue(b) - captureSortValue(a));
}

function captureIdentityAliases(capture) {
  return [capture?.id, capture?.remoteId]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}

function capturesShareIdentity(left, right) {
  const leftAliases = new Set(captureIdentityAliases(left));
  if (!leftAliases.size) return false;
  return captureIdentityAliases(right).some((alias) => leftAliases.has(alias));
}

function uniqueCapturesByIdentity(captures) {
  const seen = new Set();
  const unique = [];
  for (const capture of captures) {
    const aliases = captureIdentityAliases(capture);
    if (!aliases.length) continue;
    if (aliases.some((alias) => seen.has(alias))) continue;
    aliases.forEach((alias) => seen.add(alias));
    unique.push(capture);
  }
  return unique;
}

function mergeRemoteCaptures(remoteCaptures, currentCaptures, listMode, now = Date.now()) {
  const rejectedAliases = new Set();
  for (const capture of remoteCaptures || []) {
    if (isRejected(capture)) {
      captureIdentityAliases(capture).forEach((alias) => rejectedAliases.add(alias));
    }
  }
  // A reload replaces capture objects with fresh server rows, which don't carry the client-only
  // sortAt. Carry it forward from the matching current row so a "Try again" bump survives polls.
  const remoteRows = uniqueCapturesByIdentity(capturesForListMode(remoteCaptures, listMode)).map(
    (remote) => {
      const prior = (currentCaptures || []).find(
        (capture) => capture.sortAt && capturesShareIdentity(capture, remote)
      );
      return prior ? { ...remote, sortAt: prior.sortAt } : remote;
    }
  );
  if (listMode === "archived") return sortCaptures(remoteRows);
  const freshLocalProcessing = currentCaptures.filter((capture) => {
    const aliases = captureIdentityAliases(capture);
    return (
      !remoteRows.some((remote) => capturesShareIdentity(remote, capture)) &&
      !aliases.some((alias) => rejectedAliases.has(alias)) &&
      !isDeleted(capture) &&
      displayStatus(capture) === "processing" &&
      now - capture.createdAt < LOCAL_PROCESSING_GRACE_MS
    );
  });
  return sortCaptures(uniqueCapturesByIdentity([...remoteRows, ...freshLocalProcessing]));
}

function normalizedComparableValue(value) {
  if (typeof value === "string" && /^https?:\/\//i.test(value)) {
    // Signed asset URLs rotate their query string on every fetch; only the
    // origin + path identify the underlying resource.
    const queryStart = value.search(/[?#]/);
    return queryStart === -1 ? value : value.slice(0, queryStart);
  }
  return value;
}

function capturesEquivalent(left, right) {
  if (left === right) return true;
  const normalizedLeft = normalizedComparableValue(left);
  const normalizedRight = normalizedComparableValue(right);
  if (normalizedLeft === normalizedRight) return true;
  if (
    typeof normalizedLeft !== "object" || normalizedLeft === null ||
    typeof normalizedRight !== "object" || normalizedRight === null
  ) {
    return false;
  }
  if (Array.isArray(normalizedLeft) !== Array.isArray(normalizedRight)) return false;
  const leftKeys = Object.keys(normalizedLeft);
  const rightKeys = Object.keys(normalizedRight);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key) =>
    Object.prototype.hasOwnProperty.call(normalizedRight, key) &&
    capturesEquivalent(normalizedLeft[key], normalizedRight[key])
  );
}

const CARRIED_IMAGE_FIELDS = [
  ["imageAssetUrl", "imageAssetCacheKey"],
  ["imageAssetFullUrl", "imageAssetFullCacheKey"],
  ["sourcePreviewAssetUrl", "sourcePreviewAssetCacheKey"],
  ["thumbnailUrl", null]
];

// A refreshed row must never blank an image the user is already seeing:
// carry fields forward over transient gaps, and keep the URL the views are
// rendering when only its signature rotated (a source swap restarts the
// native image load).
function withStableImageFields(previous, next) {
  let patch = null;
  for (const [urlField, keyField] of CARRIED_IMAGE_FIELDS) {
    const previousUrl = previous[urlField];
    if (!previousUrl) continue;
    const nextUrl = next[urlField];
    const sameAsset = keyField
      ? Boolean(previous[keyField]) && previous[keyField] === next[keyField]
      : normalizedComparableValue(previousUrl) === normalizedComparableValue(nextUrl);
    if (!nextUrl || (sameAsset && nextUrl !== previousUrl)) {
      patch = patch || {};
      patch[urlField] = previousUrl;
      if (keyField && !next[keyField]) patch[keyField] = previous[keyField];
    }
  }
  return patch ? { ...next, ...patch } : next;
}

function preserveCaptureRowIdentities(previousCaptures, nextCaptures, shouldPreferNext) {
  const previousById = new Map();
  for (const capture of previousCaptures || []) {
    if (capture?.id) previousById.set(capture.id, capture);
  }
  let allSamePosition = previousCaptures.length === nextCaptures.length;
  const merged = nextCaptures.map((capture, index) => {
    const previous = capture?.id ? previousById.get(capture.id) : undefined;
    const preferNext = Boolean(previous && shouldPreferNext && shouldPreferNext(previous));
    const keepPrevious = previous && !preferNext && capturesEquivalent(previous, capture);
    const row = keepPrevious
      ? previous
      : previous && !preferNext
        ? withStableImageFields(previous, capture)
        : capture;
    if (allSamePosition && row !== previousCaptures[index]) allSamePosition = false;
    return row;
  });
  // When nothing actually changed, hand back the previous array so React
  // state updates bail out entirely (poll cycles become render no-ops).
  return allSamePosition ? previousCaptures : merged;
}

function normalizeSearchQuery(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function searchCacheKey(scope, query) {
  const normalizedQuery = normalizeSearchQuery(query);
  return normalizedQuery ? `active:${normalizedQuery}` : "";
}

function mergeSearchResults(immediateResults, rankedResults) {
  const seen = new Set();
  const merged = [];
  for (const capture of [...immediateResults, ...rankedResults]) {
    const aliases = captureIdentityAliases(capture);
    if (!aliases.length || aliases.some((alias) => seen.has(alias))) continue;
    aliases.forEach((alias) => seen.add(alias));
    merged.push(capture);
  }
  return merged;
}

module.exports = {
  LOCAL_PROCESSING_GRACE_MS,
  REVIEW_TARGETS,
  captureIdentityAliases,
  captureFieldRationaleVisible,
  capturesForListMode,
  capturesForSearchScope,
  capturesShareIdentity,
  collectionSelectionActionState,
  collectionCollageSlots,
  displayStatus,
  extractHttpUrl,
  normalizeCaptureLink,
  confidenceRequiresReview,
  hasExtractedData,
  hostFromUrl,
  captureFieldState,
  isArchived,
  isDeleted,
  isRejected,
  mapSearchCandidates,
  mapSearchCandidatesForResolvedPlace,
  mapSearchCandidatesForVisitTarget,
  mapsSearchUrls,
  mergeRemoteCaptures,
  mergeSearchResults,
  normalizeIntent,
  normalizeSearchQuery,
  normalizeReviewTargets,
  parseCaptureUrl,
  preserveCaptureRowIdentities,
  reviewReasonLabel,
  reviewReasonSummary,
  reviewReasons,
  reviewTargetsForCapture,
  searchCacheKey,
  captureSortValue,
  sortCaptures,
  statusLabel,
  uniqueCapturesByIdentity
};
