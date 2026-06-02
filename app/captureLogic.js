const LOCAL_PROCESSING_GRACE_MS = 30 * 60 * 1000;
const REVIEW_TARGETS = ["intent", "collections", "reminder", "analysis"];
const REVIEW_TARGET_SET = new Set(REVIEW_TARGETS);

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
  return Boolean(
    capture.defaultIntent ||
      capture.summary ||
      (capture.analysisProvider && capture.analysisProvider !== "none")
  );
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
  if (!capture.defaultIntent || confidenceRequiresReview(capture.confidenceLabel)) {
    targets.push("intent");
  }
  if (/\b(collection|collections)\b/.test(focus)) {
    targets.push("collections");
  }
  if (/\b(reminder|remind)\b/.test(focus)) {
    targets.push("reminder");
  }
  if ((capture.needsReview || capture.status === "needs_review") && !targets.length) {
    targets.push("analysis");
  }
  return normalizeReviewTargets(targets);
}

function reviewTargetsForCapture(capture) {
  if (capture.reviewConfirmedAt || capture.status === "processing" || capture.status === "failed") return [];
  if (Array.isArray(capture.reviewTargets)) return normalizeReviewTargets(capture.reviewTargets);
  return inferredReviewTargets(capture);
}

function reviewReasons(capture) {
  return reviewTargetsForCapture(capture);
}

function reviewReasonLabel(reason) {
  if (reason === "intent") return "Intent uncertain";
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

function sortCaptures(captures) {
  return [...captures].sort((a, b) => b.createdAt - a.createdAt);
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
  const remoteRows = uniqueCapturesByIdentity(capturesForListMode(remoteCaptures, listMode));
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
  capturesForListMode,
  capturesForSearchScope,
  capturesShareIdentity,
  displayStatus,
  extractHttpUrl,
  confidenceRequiresReview,
  hasExtractedData,
  hostFromUrl,
  isArchived,
  isDeleted,
  isRejected,
  mapSearchCandidates,
  mapSearchCandidatesForVisitTarget,
  mapsSearchUrls,
  mergeRemoteCaptures,
  mergeSearchResults,
  normalizeIntent,
  normalizeSearchQuery,
  normalizeReviewTargets,
  parseCaptureUrl,
  reviewReasonLabel,
  reviewReasonSummary,
  reviewReasons,
  reviewTargetsForCapture,
  searchCacheKey,
  sortCaptures,
  statusLabel,
  uniqueCapturesByIdentity
};
