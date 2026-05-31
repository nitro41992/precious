const LOCAL_PROCESSING_GRACE_MS = 30 * 60 * 1000;

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

function isArchived(capture) {
  return Boolean(capture.archivedAt);
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

function reviewReasons(capture) {
  if (capture.reviewConfirmedAt || capture.status === "processing" || capture.status === "failed") return [];
  const reasons = [];
  if (confidenceRequiresReview(capture.confidenceLabel)) reasons.push("intent");
  if ((capture.needsReview || capture.status === "needs_review") && !reasons.length) reasons.push("analysis");
  return reasons;
}

function reviewReasonLabel(reason) {
  if (reason === "intent") return "Intent uncertain";
  return "Analysis needs review";
}

function reviewReasonSummary(reasons) {
  return reasons.map(reviewReasonLabel).join(", ");
}

function displayStatus(capture) {
  if (reviewReasons(capture).length > 0) return "needs_review";
  if (capture.status === "failed" && hasExtractedData(capture)) return "ready";
  return capture.status;
}

function sortCaptures(captures) {
  return [...captures].sort((a, b) => b.createdAt - a.createdAt);
}

function mergeRemoteCaptures(remoteCaptures, currentCaptures, listMode, now = Date.now()) {
  if (listMode === "archived") return sortCaptures(remoteCaptures);
  const remoteIds = new Set(remoteCaptures.map((capture) => capture.id));
  const freshLocalProcessing = currentCaptures.filter((capture) => {
    return (
      !remoteIds.has(capture.id) &&
      !isArchived(capture) &&
      displayStatus(capture) === "processing" &&
      now - capture.createdAt < LOCAL_PROCESSING_GRACE_MS
    );
  });
  return sortCaptures([...remoteCaptures, ...freshLocalProcessing]);
}

function normalizeSearchQuery(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function searchCacheKey(scope, query) {
  const safeScope = scope === "archived" || scope === "all" ? scope : "active";
  const normalizedQuery = normalizeSearchQuery(query);
  return normalizedQuery ? `${safeScope}:${normalizedQuery}` : "";
}

function mergeSearchResults(immediateResults, rankedResults) {
  const seen = new Set();
  const merged = [];
  for (const capture of [...rankedResults, ...immediateResults]) {
    if (!capture?.id || seen.has(capture.id)) continue;
    seen.add(capture.id);
    merged.push(capture);
  }
  return merged;
}

module.exports = {
  LOCAL_PROCESSING_GRACE_MS,
  displayStatus,
  extractHttpUrl,
  confidenceRequiresReview,
  hasExtractedData,
  hostFromUrl,
  isArchived,
  mapSearchCandidates,
  mapsSearchUrls,
  mergeRemoteCaptures,
  mergeSearchResults,
  normalizeIntent,
  normalizeSearchQuery,
  parseCaptureUrl,
  reviewReasonLabel,
  reviewReasonSummary,
  reviewReasons,
  searchCacheKey,
  sortCaptures,
  statusLabel
};
