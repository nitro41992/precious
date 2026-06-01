import {
  BookOpen,
  CalendarDays,
  Image as ImageIcon,
  Link2,
  MapPin,
  ShoppingBag,
  StickyNote
} from "lucide-react-native";

import saveIntents from "../supabase/functions/_shared/save-intents.json";
import type {
  AuthCallbackPayload,
  Capture,
  CaptureReviewDraft,
  Collection,
  CollectionDecision,
  HomeListRow,
  LinkedCollection,
  LucideIconComponent,
  ReminderSuggestion,
  ReviewChecklistTask,
  ReviewInsight,
  ReviewRationale,
  ReviewTarget,
  UrlEvidence
} from "./types";
import {
  confidenceRequiresReview,
  displayStatus,
  extractHttpUrl,
  hostFromUrl,
  isArchived,
  normalizeIntent as normalizeKnownIntent,
  reviewTargetsForCapture,
  statusLabel,
  uniqueCapturesByIdentity
} from "./captureLogic";

type SaveIntentConfig = {
  key: string;
  label: string;
  llm_description: string;
  active: boolean;
};

export const INTENT_CONFIG = (saveIntents as SaveIntentConfig[]).filter((intent) => intent.active);
export const INTENT_OPTIONS = INTENT_CONFIG.map((intent) => intent.key);
export const INTENT_LABELS = new Map(INTENT_CONFIG.map((intent) => [intent.key, intent.label]));
export const ADD_INTENT_LABEL = "Add intent";

export const AUTH_CALLBACK_URL = "preciouscaptures://auth/callback";

export const SEARCH_PROMPTS = [
  { label: "Places", query: "places", Icon: MapPin },
  { label: "Links from yesterday", query: "links from yesterday", Icon: Link2 },
  { label: "Things to read", query: "things to read", Icon: BookOpen },
  { label: "Products", query: "products", Icon: ShoppingBag },
  { label: "Travel ideas", query: "travel ideas", Icon: CalendarDays }
];

export function formatDateTime(value: number) {
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

export function isoDateText(value: number | null | undefined) {
  if (!value) return "";
  try {
    return new Date(value).toISOString();
  } catch {
    return "";
  }
}

export function humanize(value: string | undefined) {
  if (!value) return "";
  const intentLabel = INTENT_LABELS.get(value);
  if (intentLabel) return intentLabel;
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function normalizeIntent(value: string | undefined) {
  return normalizeKnownIntent(value, INTENT_OPTIONS);
}

export function activeIntentLabel(value: string | undefined) {
  return value ? INTENT_LABELS.get(value) || "" : "";
}

export function reminderLabel(reminder: ReminderSuggestion | undefined) {
  if (!reminder) return "";
  return reminder.trigger_value || humanize(reminder.trigger_type);
}

export function captureSourceLabel(capture: Capture) {
  return capture.siteName || hostFromUrl(capture.sourceUrl) || conciseText(capture.sourceText, 56) || "Shared text";
}

export function captureSourceHost(capture: Capture) {
  return hostFromUrl(capture.sourceUrl) || capture.siteName || "";
}

export function sourceFaviconUrl(host: string) {
  const cleaned = host.replace(/^www\./i, "").trim();
  if (!cleaned || !cleaned.includes(".") || /[\s/]/.test(cleaned)) return "";
  return `https://${cleaned}/favicon.ico`;
}

export function remoteImageAsset(row: Record<string, any>) {
  const assets = Array.isArray(row.capture_assets) ? row.capture_assets : [];
  return assets.find((asset) => {
    const mimeType = String(asset?.mime_type || asset?.mimeType || "");
    const url = asset?.signed_url || asset?.signedUrl || asset?.public_url || asset?.publicUrl;
    const storagePath = asset?.storage_path || asset?.storagePath;
    return mimeType.startsWith("image/") && Boolean((typeof url === "string" && url.trim()) || storagePath);
  });
}

export function captureImageUrl(capture: Capture) {
  return (
    capture.imageAssetUrl ||
    capture.thumbnailUrl ||
    capture.urlEvidence?.image_url ||
    ""
  );
}

export function captureImageLoadKey(capture: Capture) {
  const imageUri = captureImageUrl(capture);
  return imageUri ? capture.imageAssetCacheKey || imageUri : "";
}

export function captureRowRevealKey(capture: Capture) {
  return capture.id;
}

export function isImageCapture(capture: Capture) {
  const captureType = String(capture.captureType || "").toLowerCase();
  const mimeType = String(capture.imageAssetMimeType || "").toLowerCase();
  const sourceText = String(capture.sourceText || "").trim();
  return (
    captureType === "image" ||
    captureType === "screenshot" ||
    (captureType === "mixed" && mimeType.startsWith("image/")) ||
    mimeType.startsWith("image/") ||
    /^(selected|shared)\s+(image|screenshot):/i.test(sourceText)
  );
}

export function shouldGhostSourceMark(capture: Capture) {
  if (captureImageUrl(capture)) return false;
  if (isImageCapture(capture) && displayStatus(capture) !== "failed") return true;
  return displayStatus(capture) === "processing";
}

export function captureOpenUrl(capture: Capture) {
  return capture.sourceUrl || extractHttpUrl(capture.sourceText) || "";
}

export function isMapSource(capture: Capture) {
  const host = captureSourceHost(capture).toLowerCase();
  const url = String(capture.sourceUrl || "").toLowerCase();
  const intent = capture.defaultIntent || "";
  return (
    host.includes("maps") ||
    host === "goo.gl" ||
    host.endsWith(".goo.gl") ||
    url.includes("/maps") ||
    url.includes("maps.app.goo.gl") ||
    url.includes("goo.gl/maps") ||
    intent.includes("place") ||
    intent.includes("trip")
  );
}

export function sourceIconForCapture(capture: Capture): LucideIconComponent {
  const host = captureSourceHost(capture).toLowerCase();
  const intent = capture.defaultIntent || "";
  if (isMapSource(capture)) {
    return MapPin;
  }
  if (intent.includes("buy") || intent.includes("product") || host.includes("amazon") || host.includes("etsy")) {
    return ShoppingBag;
  }
  if (intent.includes("read") || host.includes("medium") || host.includes("substack")) {
    return BookOpen;
  }
  if (host.includes("youtube") || host.includes("instagram") || host.includes("tiktok") || host.includes("photos")) {
    return ImageIcon;
  }
  if (intent.includes("event") || intent.includes("reminder")) return CalendarDays;
  if (capture.sourceUrl) return Link2;
  return StickyNote;
}

export function captureStatusLabel(capture: Capture) {
  if (isArchived(capture)) return "Archived";
  const status = displayStatus(capture);
  if (status === "processing") return "Analyzing";
  if (status === "failed") return "Could not analyze";
  if (status === "needs_review") return "Needs a quick look";
  return statusLabel(status);
}

export function captureIntentLabel(capture: Capture) {
  return activeIntentLabel(capture.defaultIntent);
}

export function auditLikeText(value: string | null | undefined) {
  return /url returned|saved url failed|saved link:|failed to fetch metadata|could not fetch metadata|metadata fetch|metadata|no readable title|readable title|readable description|path suggests|generic evidence|insufficient url|link saved from android share|android share|untitled capture|extraction|analysis|confidence|model|provider/i.test(
    String(value || "")
  );
}

export function consumerSummary(capture: Capture) {
  const cleaned = (capture.summary || "")
    .replace(/\s*[—-]\s*likely\b.*$/i, "")
    .replace(/\.\s*likely\b.*$/i, ".")
    .replace(/\s*[—-]\s*the user\b.*$/i, "")
    .replace(/\.\s*the user\b.*$/i, ".");
  const summary = conciseText(cleaned, 128);
  if (!summary) return "";
  if (auditLikeText(summary)) {
    return "";
  }
  return summary;
}

export function rawTitleLikeSource(capture: Capture) {
  const title = cleanSentence(capture.title).toLowerCase();
  if (!title) return true;
  if (auditLikeText(title)) return true;
  if (/^https?:\/\//i.test(title)) return true;
  const host = captureSourceHost(capture).toLowerCase();
  const source = captureSourceLabel(capture).toLowerCase();
  if (/^[a-z0-9.-]+\/\S+/i.test(title)) return true;
  if (host && title.startsWith(`${host}/`)) return true;
  if (host && (title === host || title === host.replace(/^www\./, ""))) return true;
  if (source && title === source) return true;
  return !title.includes(" ") && /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(title);
}

export function captureDisplayTitle(capture: Capture) {
  const title = cleanSentence(capture.title);
  if (title && !rawTitleLikeSource(capture)) return title;
  const summary = consumerSummary(capture);
  if (summary) return conciseText(summary, 72);
  const source = captureSourceLabel(capture);
  if (source && source !== "Shared text") return `Saved from ${source}`;
  return capture.sourceUrl ? "Saved link" : "Saved note";
}

export function captureSupportLine(capture: Capture, visibleSummary: string) {
  if (visibleSummary) return "";
  const status = displayStatus(capture);
  if (status === "processing") return "Saved. Checking the source now.";
  if (status === "failed") return "Saved. Open it to review or try again.";
  if (status === "needs_review") return reviewInsightForCapture(capture).focus;
  const evidence = urlEvidenceMessage(capture.urlEvidence);
  if (evidence) return evidence;
  return "";
}

export function reviewStatusCue(capture: Capture, hasReviewReasons: boolean) {
  if (displayStatus(capture) === "processing") return "Checking source";
  if (displayStatus(capture) === "failed") return "Needs a quick look";
  if (hasReviewReasons) return "Needs a quick look";
  return "Ready";
}

export function recencyGroupLabel(value: number, now = Date.now()) {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const captured = new Date(value);
  captured.setHours(0, 0, 0, 0);
  const diff = today.getTime() - captured.getTime();
  if (diff <= 0) return "Today";
  if (diff <= 24 * 60 * 60 * 1000) return "Yesterday";
  if (diff <= 7 * 24 * 60 * 60 * 1000) return "This week";
  return "Earlier";
}

export function groupedCaptureRows(captures: Capture[]) {
  const rows: HomeListRow[] = [];
  const seenGroups = new Set<string>();
  for (const capture of captures) {
    const group = recencyGroupLabel(capture.createdAt);
    if (!seenGroups.has(group)) {
      rows.push({ type: "section", id: `section:${group}`, title: group });
      seenGroups.add(group);
    }
    rows.push({ type: "capture", id: capture.id, capture });
  }
  return rows;
}

export function uniqueCaptures(captures: Capture[]) {
  return uniqueCapturesByIdentity(captures);
}

export function uniqueCollections(collections: Collection[]) {
  const seen = new Set<string>();
  return collections.filter((collection) => {
    if (!collection.id || seen.has(collection.id)) return false;
    seen.add(collection.id);
    return true;
  });
}

export function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

export function captureSearchParts(capture: Capture) {
  return [
    capture.title,
    capture.summary,
    capture.note,
    capture.sourceText,
    capture.sourceUrl,
    capture.siteName,
    capture.defaultIntent,
    humanize(capture.defaultIntent),
    capture.intentRationale,
    capture.visitTarget?.name,
    capture.visitTarget?.query,
    capture.visitTarget?.confidence,
    ...(capture.visitTarget?.evidence || []),
    capture.confidenceLabel,
    captureStatusLabel(capture),
    formatDateTime(capture.createdAt),
    isoDateText(capture.createdAt),
    isoDateText(capture.updatedAt),
    isoDateText(capture.processedAt),
    ...(capture.searchPhrases || []),
    ...(capture.entities || []).flatMap((entity) => [entity.type, entity.name, entity.evidence]),
    ...(capture.linkedCollections || []).flatMap((collection) => [
      collection.title,
      collection.description,
      collection.rationale
    ]),
    ...(capture.suggestedReminders || []).flatMap((reminder) => [
      reminder.trigger_type,
      reminder.trigger_value,
      reminder.rationale,
      reminder.status
    ])
  ].filter(Boolean).map(String);
}

export function searchableCaptureText(capture: Capture) {
  return captureSearchParts(capture).join(" ").toLowerCase();
}

export function matchReasonForCapture(capture: Capture, term: string) {
  const query = term.trim().toLowerCase();
  if (!query) return isArchived(capture) ? "Archived capture" : "Recent capture";
  const matches = (values: Array<string | null | undefined>) =>
    values.filter(Boolean).some((value) => String(value).toLowerCase().includes(query));
  if (matches([capture.title])) return "Matched title";
  if (matches([capture.summary])) return "Matched summary";
  if (matches([capture.note])) return "Matched note";
  if (matches([capture.sourceText, capture.sourceUrl, capture.siteName])) return "Matched source";
  if (matches([capture.defaultIntent, humanize(capture.defaultIntent)])) return "Matched save intent";
  if (matches([
    capture.visitTarget?.name,
    capture.visitTarget?.query,
    ...(capture.visitTarget?.evidence || [])
  ])) {
    return "Matched visit target";
  }
  if (matches((capture.linkedCollections || []).flatMap((collection) => [collection.title, collection.description]))) {
    return "Matched collection";
  }
  if (matches((capture.entities || []).flatMap((entity) => [entity.type, entity.name, entity.evidence]))) {
    return "Matched saved detail";
  }
  if (matches((capture.suggestedReminders || []).flatMap((reminder) => [
    reminder.trigger_type,
    reminder.trigger_value,
    reminder.rationale
  ]))) {
    return "Matched reminder idea";
  }
  if (matches([formatDateTime(capture.createdAt), isoDateText(capture.createdAt)])) return "Matched time saved";
  return "Matched saved detail";
}

export function reminderDraftKey(reminder: ReminderSuggestion, index: number) {
  return `${index}:${reminder.trigger_type || ""}:${reminder.trigger_value || ""}`;
}

export function linkedCollectionDraftKey(collectionId: string) {
  return `linked:${collectionId}`;
}

export function suggestedCollectionDraftKey(collection: CollectionDecision, index: number) {
  return `suggested:${index}:${collection.type}:${collection.collectionId || collection.title}`;
}

export function collectionChoiceFromDecision(decision: CollectionDecision) {
  if (decision.type === "existing" && decision.collectionId) {
    return { type: "existing" as const, collectionId: decision.collectionId };
  }
  if (decision.type === "new" && decision.title.trim() && decision.description?.trim()) {
    return {
      type: "new" as const,
      title: decision.title.trim(),
      description: decision.description.trim()
    };
  }
  return null;
}

export function collectionConfidenceLabel(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Selected";
  if (value >= 0.72) return "Looks right";
  if (value >= 0.5) return "Maybe";
  return "Not sure";
}

export function linkedCollectionsLabel(collections: LinkedCollection[]) {
  if (!collections.length) return "Add collections";
  if (collections.length === 1) return collections[0].title;
  return `${collections[0].title} +${collections.length - 1}`;
}

export function reviewRationaleFromRemote(value: unknown): ReviewRationale | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const next: ReviewRationale = {};
  for (const key of ["focus", "summary", "intent", "collections", "reminder"] as const) {
    const text = cleanSentence(typeof record[key] === "string" ? record[key] : "");
    if (text && !auditLikeText(text)) next[key] = text;
  }
  return Object.keys(next).length ? next : undefined;
}

export function rationaleLine(value: string | null | undefined) {
  const text = cleanSentence(value);
  if (!text || auditLikeText(text)) return "";
  return text;
}

export function reviewFocusForCapture(capture: Capture, intentText: string) {
  const rationale = capture.reviewRationale || {};
  const providedFocus = rationaleLine(rationale.focus);
  if (providedFocus) return conciseText(providedFocus, 88);
  if (displayStatus(capture) === "failed") return "Review source details";
  const reviewTargets = reviewTargetsForCapture(capture);
  if (reviewTargets.includes("collections")) {
    const collectionsLabel = linkedCollectionsLabel(capture.linkedCollections || []);
    return collectionsLabel === "Add collections"
      ? "Check Collections"
      : `Check Collections: ${collectionsLabel}`;
  }
  if (reviewTargets.includes("reminder")) return "Confirm Reminder idea";
  if (confidenceRequiresReview(capture.confidenceLabel)) {
    const intentLabel = activeIntentLabel(capture.defaultIntent);
    return intentLabel ? `Confirm Save Intent: ${intentLabel}` : "Choose a Save Intent";
  }
  if (capture.needsReview) return "Review the suggested fields";
  return conciseText(intentText, 88) || "Review the suggested fields";
}

const REVIEW_CHECKLIST_ORDER: ReviewTarget[] = ["intent", "collections", "reminder", "analysis"];

export function reviewChecklistCta(tasks: ReviewChecklistTask[]) {
  if (!tasks.length) return "Review insight";
  return tasks.length === 1 ? "Review 1 item" : `Review ${tasks.length} items`;
}

export function reviewChecklistTasksForCapture(capture: Capture): ReviewChecklistTask[] {
  const targets = new Set(reviewTargetsForCapture(capture));
  if (!targets.size) return [];
  const rationale = capture.reviewRationale || {};
  const primaryReminder = (capture.suggestedReminders || [])[0];
  const collectionsLabel = linkedCollectionsLabel(capture.linkedCollections || []);
  const intentValue = activeIntentLabel(capture.defaultIntent);
  const intentTask: ReviewChecklistTask = {
    target: "intent",
    title: "Save Intent",
    value: intentValue || "No intent",
    rationale:
      rationaleLine(rationale.intent) ||
      rationaleLine(capture.intentRationale) ||
      (intentValue
        ? `Confirm ${intentValue} is the right action for this capture.`
        : "Choose an action only if the saved content clearly supports one."),
    confirmLabel: intentValue ? `Keep ${intentValue}` : "Keep no intent",
    editLabel: intentValue ? "Change Save Intent" : "Choose Save Intent"
  };
  const collectionsTask: ReviewChecklistTask = {
    target: "collections",
    title: "Collections",
    value: collectionsLabel === "Add collections" ? "No collection" : collectionsLabel,
    rationale:
      rationaleLine(rationale.collections) ||
      (capture.linkedCollections || [])
        .map((collection) => rationaleLine(collection.rationale))
        .find(Boolean) ||
      "Keep it unfiled unless one of your existing Collections fits.",
    confirmLabel: collectionsLabel === "Add collections" ? "Keep no collection" : `Keep ${collectionsLabel}`,
    editLabel: "Change Collections"
  };
  const reminderTask: ReviewChecklistTask = {
    target: "reminder",
    title: "Reminder idea",
    value: primaryReminder ? reminderLabel(primaryReminder) : "No reminder",
    rationale:
      rationaleLine(rationale.reminder) ||
      rationaleLine(primaryReminder?.rationale) ||
      "Confirm this only if the idea should stay with the capture.",
    confirmLabel: primaryReminder ? `Keep ${reminderLabel(primaryReminder)}` : "Keep no reminder",
    editLabel: primaryReminder ? "Remove Reminder idea" : undefined
  };
  const analysisTask: ReviewChecklistTask = {
    target: "analysis",
    title: "Analysis",
    value: "Source details",
    rationale:
      rationaleLine(rationale.summary) ||
      "Confirm the extracted details look usable, or edit the title and note before saving.",
    confirmLabel: "Mark analysis reviewed"
  };
  const byTarget: Record<ReviewTarget, ReviewChecklistTask> = {
    intent: intentTask,
    collections: collectionsTask,
    reminder: reminderTask,
    analysis: analysisTask
  };
  return REVIEW_CHECKLIST_ORDER
    .filter((target) => targets.has(target))
    .map((target) => byTarget[target]);
}

export function reviewInsightForCapture(capture: Capture): ReviewInsight {
  const rationale = capture.reviewRationale || {};
  const collectionRationale = (capture.linkedCollections || [])
    .map((collection) => rationaleLine(collection.rationale))
    .find(Boolean) || "";
  const reminderRationale = (capture.suggestedReminders || [])
    .map((reminder) => rationaleLine(reminder.rationale))
    .find(Boolean) || "";
  const intentText =
    rationaleLine(rationale.intent) ||
    rationaleLine(capture.intentRationale);
  const collectionsText =
    rationaleLine(rationale.collections) ||
    collectionRationale;
  const reminderText =
    rationaleLine(rationale.reminder) ||
    reminderRationale;
  const summary =
    rationaleLine(rationale.summary) ||
    conciseText([intentText, collectionsText, reminderText].filter(Boolean).join(" "), 140);
  const focus = reviewFocusForCapture(capture, intentText);
  return {
    focus,
    summary,
    sections: [
      { label: "Save Intent", text: intentText },
      { label: "Collections", text: collectionsText },
      { label: "Reminder idea", text: reminderText }
    ].filter((section) => Boolean(section.text))
  };
}

export function collectionCountLabel(count: number) {
  return `${count} ${count === 1 ? "capture" : "captures"}`;
}

export function captureDraftKey(capture: Pick<Capture, "id" | "remoteId">) {
  return capture.remoteId || capture.id;
}

export function cleanedReviewDraft(draft: CaptureReviewDraft): CaptureReviewDraft | null {
  const next: CaptureReviewDraft = { updatedAt: draft.updatedAt };
  if (draft.titleDirty && typeof draft.title === "string") {
    next.title = draft.title;
    next.titleDirty = true;
  }
  if (draft.noteDirty && typeof draft.note === "string") {
    next.note = draft.note;
    next.noteDirty = true;
  }
  if (draft.intentDirty) {
    next.intent = typeof draft.intent === "string" ? draft.intent : "";
    next.intentDirty = true;
  }
  if (draft.reminders && Object.keys(draft.reminders).length) {
    next.reminders = draft.reminders;
  }
  const hasChanges = Boolean(
    next.titleDirty ||
      next.noteDirty ||
      next.intentDirty ||
      next.reminders
  );
  return hasChanges ? next : null;
}

export function cleanSentence(value: string | null | undefined) {
  return String(value || "").trim().replace(/\s+/g, " ").replace(/[.!?]+$/, "");
}

export function conciseText(value: string | null | undefined, maxLength = 110) {
  const text = cleanSentence(value);
  if (text.length <= maxLength) return text;
  const clipped = text.slice(0, maxLength);
  const breakIndex = Math.max(clipped.lastIndexOf(","), clipped.lastIndexOf(";"), clipped.lastIndexOf(" "));
  return `${clipped.slice(0, breakIndex > 60 ? breakIndex : maxLength).trim()}...`;
}

export function urlEvidenceMessage(evidence?: UrlEvidence | null) {
  if (!evidence) return "";
  const suppliedMessage = evidence.user_facing_message && !auditLikeText(evidence.user_facing_message)
    ? evidence.user_facing_message
    : "";
  if (evidence.status === "needs_client_resolution") {
    return suppliedMessage || "Saved. Open the link once if you want richer details.";
  }
  if (evidence.status === "insufficient_url_evidence") {
    return suppliedMessage || "Saved with limited public details.";
  }
  if (evidence.status === "partial_evidence" || evidence.evidence_quality === "low") {
    return suppliedMessage || "Saved with partial source details.";
  }
  return "";
}

export function friendlyError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : String(error || "");
  if (/anonymous sign-ins are disabled/i.test(message)) {
    return "Choose Google or email link to sign in.";
  }
  if (/signup|signups|registration/i.test(message) && /disabled|not allowed/i.test(message)) {
    return "Account creation is not enabled yet. Turn on email signups in Supabase Auth.";
  }
  if (/email/i.test(message) && /provider/i.test(message) && /disabled/i.test(message)) {
    return "Email sign-in is not enabled yet in Supabase Auth.";
  }
  if (/redirect|uri|url/i.test(message) && /not allowed|not supported|invalid/i.test(message)) {
    return `The confirmation link is not allowed yet. Add ${AUTH_CALLBACK_URL} in Supabase Auth URL settings.`;
  }
  if (/rate limit|too many requests|over_email_send_rate_limit/i.test(message)) {
    return "A confirmation email was already sent. Wait a minute before trying again.";
  }
  if (
    /UnknownHostException|Unable to resolve host|No address associated|fetch failed|SocketException|Software caused connection abort|Connection reset|unexpected end of stream|native_request_failed/i.test(
      message
    )
  ) {
    return "Network connection dropped. Try again in a moment.";
  }
  if (/unauthorized|session expired/i.test(message)) {
    return "Your session expired. Sign in again.";
  }
  if (auditLikeText(message) || /stack trace|edge function|supabase|native bridge|request failed/i.test(message)) {
    return fallback;
  }
  return message || fallback;
}

export function emailInputError(email: string) {
  if (!email) {
    return "Enter your email address.";
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return "Enter a valid email address.";
  }
  return "";
}

export function authCallbackPayload(url: string | null | undefined): AuthCallbackPayload | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const route = `${parsed.host}${parsed.pathname}`.replace(/^\/+/, "");
  if (parsed.protocol !== "preciouscaptures:" || route !== "auth/callback") return null;

  const params = new URLSearchParams(parsed.search);
  if (parsed.hash.startsWith("#")) {
    new URLSearchParams(parsed.hash.slice(1)).forEach((value, key) => params.set(key, value));
  }
  const error = params.get("error_description") || params.get("error");
  if (error) {
    return { kind: "error", message: error.replace(/\+/g, " ") };
  }

  const accessToken = params.get("access_token") || "";
  const refreshToken = params.get("refresh_token") || "";
  const expiresAt = Number(params.get("expires_at")) ||
    Math.floor(Date.now() / 1000) + Number(params.get("expires_in") || 3600);
  if (!accessToken || !refreshToken) {
    return { kind: "error", message: "This confirmation link is incomplete. Send yourself a new link." };
  }
  return { kind: "session", accessToken, refreshToken, expiresAt };
}

export function isCaptureImageCancel(error: unknown) {
  if (!error) return true;
  const message = error instanceof Error ? error.message : String(error || "");
  const code =
    typeof error === "object" && error && "code" in error
      ? String((error as { code?: unknown }).code || "")
      : "";
  return /capture_image_missing|No image was selected/i.test(`${code} ${message}`);
}
