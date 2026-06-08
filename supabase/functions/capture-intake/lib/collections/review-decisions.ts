import { adminClient } from "../supabase.ts";
import {
  COLLECTION_AUTO_LINK_CONFIDENCE,
  COLLECTION_AUTO_LINK_LIMIT,
  COLLECTION_SUGGESTION_DEDUP_SIMILARITY,
  COLLECTION_SUGGESTION_MIN_CONFIDENCE,
} from "../config.ts";
import { errorMessage, finiteNumber, stringValue } from "../common.ts";
import {
  analysisRequiresReview,
  normalizedReviewAnalysis,
  resolveReviewTargets,
} from "../analysis/review-normalization.ts";
import { rationaleForAnalysis } from "../analysis/rationales.ts";
import type { AnalysisOutput, RetrievedCollection } from "../types.ts";
import {
  collectionEmbeddingContent,
  createEmbedding,
  embeddingLiteral,
  scheduleCaptureEmbeddingRefresh,
  upsertCollectionEmbedding,
} from "./embeddings.ts";
import {
  activeCollectionDecisionRows,
  collectionDecisionKey,
  linkCaptureToCollection,
  normalizeCollectionDecision,
  refreshCollectionPreviewAfterCaptureRemoval,
  sameCollectionDecision,
} from "./links.ts";

const reminderDurationUnits = new Set(["minutes", "hours", "days", "weeks"]);
const reminderDatePrecisions = new Set([
  "exact",
  "day",
  "date_range",
  "week",
  "month_window",
  "month",
  "unknown",
]);
const reminderTimePrecisions = new Set(["exact", "time_range", "unknown"]);

function validReminderDate(value: string | null) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
}

function validReminderTime(value: string | null) {
  const match = /^(\d{2}):(\d{2})$/.exec(value || "");
  if (!match) return false;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

function dateTimeMs(date: string, time = "00:00") {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(time);
  if (!dateMatch || !timeMatch) return NaN;
  return Date.UTC(
    Number(dateMatch[1]),
    Number(dateMatch[2]) - 1,
    Number(dateMatch[3]),
    Number(timeMatch[1]),
    Number(timeMatch[2]),
  );
}

function addDays(dateText: string, days: number) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText);
  if (!match || !Number.isFinite(days)) return "";
  const date = new Date(Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  ));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function addMinutes(timeText: string, minutes: number) {
  const match = /^(\d{2}):(\d{2})$/.exec(timeText);
  if (!match || !Number.isFinite(minutes) || minutes <= 0) return "";
  const start = Number(match[1]) * 60 + Number(match[2]);
  const next = start + minutes;
  if (next >= 24 * 60) return "";
  return `${String(Math.floor(next / 60)).padStart(2, "0")}:${
    String(next % 60).padStart(2, "0")
  }`;
}

function collectionFieldRationale(
  analysis: Record<string, unknown>,
  collectionId: string,
) {
  const fieldRationales = analysis.field_rationales &&
      typeof analysis.field_rationales === "object" &&
      !Array.isArray(analysis.field_rationales)
    ? analysis.field_rationales as Record<string, unknown>
    : {};
  const records = Array.isArray(fieldRationales.collections)
    ? fieldRationales.collections
    : [];
  for (const item of records) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    if (stringValue(record.collection_id) !== collectionId) continue;
    const rationale = rationaleForAnalysis(analysis, record.text);
    if (rationale) return rationale;
  }
  return "";
}

function intervalDuration(
  startDate: string,
  endDate: string,
  startTime: string | null,
  endTime: string | null,
) {
  if (startTime && endTime) {
    const minutes = Math.max(
      1,
      Math.round(
        (dateTimeMs(endDate, endTime) - dateTimeMs(startDate, startTime)) /
          (60 * 1000),
      ),
    );
    if (minutes % (7 * 24 * 60) === 0) {
      return { duration: minutes / (7 * 24 * 60), duration_unit: "weeks" };
    }
    if (minutes % (24 * 60) === 0) {
      return { duration: minutes / (24 * 60), duration_unit: "days" };
    }
    if (minutes % 60 === 0) {
      return { duration: minutes / 60, duration_unit: "hours" };
    }
    return { duration: minutes, duration_unit: "minutes" };
  }
  const days = Math.max(
    1,
    Math.round(
      (dateTimeMs(endDate) - dateTimeMs(startDate)) / (24 * 60 * 60 * 1000),
    ) + 1,
  );
  if (days % 7 === 0) return { duration: days / 7, duration_unit: "weeks" };
  return { duration: days, duration_unit: "days" };
}

function reminderString(
  record: Record<string, unknown>,
  snakeKey: string,
  camelKey: string,
) {
  return stringValue(record[snakeKey]) || stringValue(record[camelKey]);
}

export function confirmedReminderFromInput(
  input: unknown,
  fallback: Record<string, unknown> = {},
) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }
  const record = input as Record<string, unknown>;
  const startDate = reminderString(record, "start_date", "startDate") ||
    reminderString(record, "trigger_date", "triggerDate") ||
    reminderString(record, "date_window_start", "dateWindowStart") ||
    stringValue(fallback.trigger_date);
  let endDate = reminderString(record, "end_date", "endDate") ||
    reminderString(record, "date_window_end", "dateWindowEnd") ||
    stringValue(fallback.end_date) ||
    stringValue(fallback.date_window_end) ||
    startDate;
  let startTime = reminderString(record, "start_time", "startTime") ||
    reminderString(record, "trigger_time", "triggerTime") ||
    stringValue(fallback.start_time) ||
    stringValue(fallback.trigger_time) ||
    null;
  let endTime = reminderString(record, "end_time", "endTime") ||
    stringValue(fallback.end_time) ||
    null;
  const timezone = reminderString(record, "timezone", "timeZone") ||
    stringValue(fallback.timezone) || "UTC";
  const inputDuration = Math.floor(
    finiteNumber(
      record.duration ?? record.duration_value ?? record.durationValue ??
        fallback.duration,
      0,
    ),
  );
  const inputDurationUnit =
    reminderString(record, "duration_unit", "durationUnit") ||
    stringValue(fallback.duration_unit);
  if (!endDate && startDate && inputDuration > 0) {
    if (inputDurationUnit === "days") {
      endDate = addDays(startDate, inputDuration - 1);
    }
    if (inputDurationUnit === "weeks") {
      endDate = addDays(startDate, inputDuration * 7 - 1);
    }
  }
  if (!endDate) endDate = startDate;
  if (!endTime && startTime && inputDuration > 0) {
    if (inputDurationUnit === "minutes") {
      endTime = addMinutes(startTime, inputDuration);
    }
    if (inputDurationUnit === "hours") {
      endTime = addMinutes(startTime, inputDuration * 60);
    }
  }
  if (
    inputDuration > 0 && inputDurationUnit &&
    !reminderDurationUnits.has(inputDurationUnit)
  ) {
    return null;
  }
  const hasStartTime = Boolean(startTime);
  const hasEndTime = Boolean(endTime);
  if (
    !startDate ||
    !endDate ||
    !validReminderDate(startDate) ||
    !validReminderDate(endDate)
  ) {
    return null;
  }
  const safeStartDate = startDate;
  const safeEndDate = endDate;
  if (
    dateTimeMs(safeEndDate) < dateTimeMs(safeStartDate) ||
    (hasStartTime && !validReminderTime(startTime)) ||
    (hasEndTime && !validReminderTime(endTime)) ||
    (!hasStartTime && hasEndTime) ||
    (hasStartTime && hasEndTime &&
      dateTimeMs(safeEndDate, endTime as string) <=
        dateTimeMs(safeStartDate, startTime as string))
  ) {
    return null;
  }
  const derived = intervalDuration(
    safeStartDate,
    safeEndDate,
    startTime,
    endTime,
  );
  const duration = inputDuration > 0 &&
      inputDurationUnit &&
      reminderDurationUnits.has(inputDurationUnit)
    ? inputDuration
    : derived.duration;
  const durationUnit = inputDuration > 0 &&
      inputDurationUnit &&
      reminderDurationUnits.has(inputDurationUnit)
    ? inputDurationUnit
    : derived.duration_unit;
  const triggerValue =
    reminderString(record, "trigger_value", "triggerValue") ||
    [
      safeStartDate === safeEndDate
        ? safeStartDate
        : `${safeStartDate}-${safeEndDate}`,
      startTime && endTime ? `${startTime}-${endTime}` : startTime,
    ].filter(Boolean).join(" ");
  const triggerText = reminderString(record, "trigger_text", "triggerText") ||
    stringValue(fallback.trigger_text) ||
    stringValue(fallback.trigger_value);
  const dateWindowStart =
    reminderString(record, "date_window_start", "dateWindowStart") ||
    stringValue(fallback.date_window_start) ||
    safeStartDate;
  const dateWindowEnd =
    reminderString(record, "date_window_end", "dateWindowEnd") ||
    stringValue(fallback.date_window_end) ||
    safeEndDate;
  let datePrecision =
    reminderString(record, "date_precision", "datePrecision") ||
    stringValue(fallback.date_precision) ||
    (safeStartDate === safeEndDate ? "exact" : "date_range");
  if (!reminderDatePrecisions.has(datePrecision)) datePrecision = "unknown";
  let timePrecision =
    reminderString(record, "time_precision", "timePrecision") ||
    stringValue(fallback.time_precision) ||
    (startTime && endTime ? "time_range" : startTime ? "exact" : "unknown");
  if (!reminderTimePrecisions.has(timePrecision)) timePrecision = "unknown";
  const rationale = stringValue(record.rationale) ||
    stringValue(fallback.rationale) ||
    "User added this reminder.";
  const source = stringValue(record.source) ||
    stringValue(fallback.source) ||
    "manual";
  return {
    ...fallback,
    trigger_type: "time",
    trigger_value: triggerValue,
    trigger_text: triggerText,
    start_date: safeStartDate,
    end_date: safeEndDate,
    start_time: startTime,
    end_time: endTime,
    trigger_date: safeStartDate,
    date_window_start: dateWindowStart,
    date_window_end: dateWindowEnd,
    date_precision: datePrecision,
    trigger_time: startTime,
    time_precision: timePrecision,
    timezone,
    duration,
    duration_unit: durationUnit,
    rationale,
    confidence: finiteNumber(record.confidence ?? fallback.confidence, 1),
    source,
    status: "confirmed",
  };
}

export {
  activeCollectionDecisionRows,
  choiceRestoredDecisions,
  collectionChoiceOverrideId,
  collectionChoiceOverrides,
  collectionDecisionKey,
  normalizeCollectionDecision,
  sameCollectionDecision,
} from "./links.ts";

export async function autoLinkCollectionDecisions(
  supabase: ReturnType<typeof adminClient>,
  userId: string,
  captureId: string,
  analysis: AnalysisOutput,
  retrievedCollections: RetrievedCollection[],
): Promise<AnalysisOutput> {
  const retrievedById = new Map(
    retrievedCollections.map((collection) => [collection.id, collection]),
  );
  const decisions = Array.isArray(analysis.collection_decisions)
    ? analysis.collection_decisions.map((item) =>
      normalizeCollectionDecision(item as Record<string, unknown>)
    )
    : [];
  const linkableDecisions = decisions
    .map((decision, index) => ({ decision, index }))
    .filter(({ decision }) =>
      decision.type === "existing" &&
      decision.collection_id &&
      retrievedById.has(decision.collection_id) &&
      decision.confidence >= COLLECTION_AUTO_LINK_CONFIDENCE
    )
    .sort((left, right) =>
      right.decision.confidence - left.decision.confidence ||
      left.index - right.index
    );
  const decisionsToLink = linkableDecisions.slice(
    0,
    COLLECTION_AUTO_LINK_LIMIT,
  );
  const capBlocked = linkableDecisions.slice(COLLECTION_AUTO_LINK_LIMIT)
    .map(({ decision }) => decision);
  const linked: Array<Record<string, unknown>> = [];
  for (const { decision } of decisionsToLink) {
    const collection = retrievedById.get(decision.collection_id!)!;
    const rationale = collectionFieldRationale(
      analysis,
      decision.collection_id!,
    ) || rationaleForAnalysis(analysis, decision.rationale);
    await linkCaptureToCollection(
      supabase,
      userId,
      decision.collection_id!,
      captureId,
      {
        createdBy: "analysis",
        rationale,
        confidence: decision.confidence,
      },
    );
    linked.push({
      ...decision,
      title: collection.title,
      description: collection.description,
      rationale,
    });
  }
  const diagnostics = analysis.collection_recall_diagnostics &&
      typeof analysis.collection_recall_diagnostics === "object" &&
      !Array.isArray(analysis.collection_recall_diagnostics)
    ? analysis.collection_recall_diagnostics as Record<string, unknown>
    : {};
  return {
    ...analysis,
    collection_decisions: [],
    linked_collections: linked,
    collection_recall_diagnostics: {
      ...diagnostics,
      auto_link_limit: COLLECTION_AUTO_LINK_LIMIT,
      auto_linked_collection_ids: linked.map((decision) =>
        decision.collection_id
      ),
      auto_link_cap_blocked_decisions: capBlocked,
    },
  };
}

// Returns the single most-confident AI-proposed *new* Collection decision that clears the
// suggestion bar, or null. Shared so the pipeline can cheaply decide whether a capture has a
// suggestion to resolve (and surface a "pending" state) without duplicating the filter logic.
export function qualifyingNewCollectionDecision(
  analysis: AnalysisOutput,
): ReturnType<typeof normalizeCollectionDecision> | null {
  const rawDecisions = Array.isArray(analysis.collection_decisions)
    ? analysis.collection_decisions as Array<Record<string, unknown>>
    : [];
  const newDecisions = rawDecisions
    .map((decision) => normalizeCollectionDecision(decision))
    .filter((decision) =>
      decision.type === "new" &&
      Boolean(decision.title) &&
      Boolean(decision.description) &&
      decision.confidence >= COLLECTION_SUGGESTION_MIN_CONFIDENCE
    );
  // The prompt allows at most one new Collection; keep the most confident if more slip through.
  return newDecisions.sort((left, right) => right.confidence - left.confidence)[0] ??
    null;
}

// Materializes an AI-proposed new Collection as a persistent status='suggested' row,
// deduplicated across captures so several captures that fit the same idea accrue under
// one suggestion. Writes a `pending_collection_suggestion` block onto the analysis for the
// UI to bind to. Runs in the background after the capture is marked ready (its embedding +
// dedup + DB round-trips are the slowest tail of the pipeline), so the caller consumes only
// the returned `pending_collection_suggestion`.
export async function resolveNewCollectionSuggestions(
  supabase: ReturnType<typeof adminClient>,
  userId: string,
  captureId: string,
  analysis: AnalysisOutput,
): Promise<AnalysisOutput> {
  const rawDecisions = Array.isArray(analysis.collection_decisions)
    ? analysis.collection_decisions as Array<Record<string, unknown>>
    : [];
  const decision = qualifyingNewCollectionDecision(analysis);
  // Strip any new-type decisions from collection_decisions; existing ones flow to auto-link.
  const remainingDecisions = rawDecisions.filter((raw) =>
    normalizeCollectionDecision(raw).type !== "new"
  );
  if (!decision) {
    return rawDecisions.length === remainingDecisions.length
      ? analysis
      : { ...analysis, collection_decisions: remainingDecisions };
  }

  const description = decision.description || "";
  const normalizedTitle = decision.title.toLowerCase();
  const content = collectionEmbeddingContent(decision.title, description);
  let embedding: number[] | null = null;
  try {
    embedding = await createEmbedding(content);
  } catch (error) {
    console.warn("Suggestion embedding failed", errorMessage(error));
  }

  let suggestionId = "";
  let suggestionTitle = decision.title;
  let suggestionDescription = description;

  // 1. Exact normalized-title match against existing pending suggestions.
  const byTitle = await supabase
    .from("collections")
    .select("id,title,description")
    .eq("user_id", userId)
    .eq("status", "suggested")
    .is("deleted_at", null)
    .eq("normalized_title", normalizedTitle)
    .maybeSingle();
  if (!byTitle.error && byTitle.data) {
    suggestionId = String(byTitle.data.id);
    suggestionTitle = String(byTitle.data.title || suggestionTitle);
    suggestionDescription = String(byTitle.data.description || suggestionDescription);
  }

  // 2. Semantic dedup against existing pending suggestions.
  if (!suggestionId && embedding) {
    const matches = await supabase.rpc(
      "match_collection_suggestions_for_capture",
      {
        p_user_id: userId,
        p_query_text: content,
        p_query_embedding: embeddingLiteral(embedding),
        p_match_count: 3,
      },
    );
    if (!matches.error) {
      const best = ((matches.data ?? []) as Array<Record<string, unknown>>)
        .find((row) =>
          Number(row.semantic_score) >= COLLECTION_SUGGESTION_DEDUP_SIMILARITY
        );
      if (best) {
        suggestionId = String(best.id);
        suggestionTitle = String(best.title || suggestionTitle);
        suggestionDescription = String(best.description || suggestionDescription);
      }
    }
  }

  // 3. No dedup match — create a new suggested row. Handle the unique(normalized_title)
  //    race by re-fetching the row another concurrent capture just created.
  if (!suggestionId) {
    const insert = await supabase
      .from("collections")
      .insert({
        user_id: userId,
        title: decision.title,
        description,
        status: "suggested",
        created_by: "analysis",
      })
      .select("id")
      .single();
    if (insert.error) {
      const retry = await supabase
        .from("collections")
        .select("id,title,description,status")
        .eq("user_id", userId)
        .eq("normalized_title", normalizedTitle)
        .is("deleted_at", null)
        .maybeSingle();
      if (retry.error || !retry.data) throw insert.error;
      // The proposed title collides with a real (active/archived) Collection — the model
      // should have linked it instead. Drop the suggestion rather than mislabel a real
      // Collection as pending.
      if (retry.data.status !== "suggested") {
        return { ...analysis, collection_decisions: remainingDecisions };
      }
      suggestionId = String(retry.data.id);
      suggestionTitle = String(retry.data.title || suggestionTitle);
      suggestionDescription = String(retry.data.description || suggestionDescription);
    } else {
      suggestionId = String(insert.data.id);
      if (embedding) {
        const { error } = await supabase.from("collection_embeddings").upsert({
          user_id: userId,
          collection_id: suggestionId,
          content,
          embedding: embeddingLiteral(embedding),
        }, { onConflict: "collection_id" });
        if (error) console.warn("Suggestion embedding upsert failed", error.message);
      } else {
        await upsertCollectionEmbedding(
          supabase,
          userId,
          suggestionId,
          decision.title,
          description,
        ).catch((error) =>
          console.warn("Suggestion embedding upsert failed", errorMessage(error))
        );
      }
    }
  }

  // 4. Respect dismissals — never re-suggest a capture the user already removed from this group.
  const dismissed = await supabase
    .from("collection_suggestion_dismissals")
    .select("id")
    .eq("user_id", userId)
    .eq("collection_id", suggestionId)
    .eq("capture_id", captureId)
    .maybeSingle();
  if (!dismissed.error && dismissed.data) {
    return { ...analysis, collection_decisions: remainingDecisions };
  }

  // 5. Link the capture into the suggestion and surface a pending_collection_suggestion block.
  await linkCaptureToCollection(supabase, userId, suggestionId, captureId, {
    createdBy: "analysis",
    rationale: decision.rationale || null,
    confidence: decision.confidence,
  });

  return {
    ...analysis,
    collection_decisions: remainingDecisions,
    pending_collection_suggestion: {
      collection_id: suggestionId,
      title: suggestionTitle,
      description: suggestionDescription,
      rationale: decision.rationale || "",
      confidence: decision.confidence,
    },
  };
}

export async function markCollectionDecisionAccepted(
  supabase: ReturnType<typeof adminClient>,
  userId: string,
  captureId: string,
  accepted: Record<string, unknown>,
) {
  const { data, error } = await supabase
    .from("captures")
    .select("id, analysis, review_confirmed_at")
    .eq("user_id", userId)
    .or(`id.eq.${captureId},client_capture_key.eq.${captureId}`)
    .maybeSingle();
  if (error || !data) return;
  const analysis = data.analysis && typeof data.analysis === "object"
    ? data.analysis as Record<string, unknown>
    : {};
  const decisions = Array.isArray(analysis.collection_decisions)
    ? analysis.collection_decisions
    : [];
  const nextDecisions = decisions.filter(
    (decision) =>
      !sameCollectionDecision(decision as Record<string, unknown>, accepted),
  );
  const nextAnalysis = normalizedReviewAnalysis(
    {
      ...resolveReviewTargets(
        analysis,
        ["collections", "analysis"],
        data.review_confirmed_at,
      ),
      collection_decisions: nextDecisions,
    },
    data.review_confirmed_at,
  );
  await supabase
    .from("captures")
    .update({
      analysis: nextAnalysis,
      analysis_state:
        analysisRequiresReview(nextAnalysis, data.review_confirmed_at)
          ? "needs_review"
          : "ready",
    })
    .eq("user_id", userId)
    .eq("id", data.id);
  scheduleCaptureEmbeddingRefresh(supabase, userId, String(data.id));
}

export function confirmedReminderSuggestions(
  analysis: Record<string, unknown>,
) {
  const reminders = Array.isArray(analysis.suggested_reminders)
    ? analysis.suggested_reminders
    : [];
  return reminders.map((reminder) => {
    if (!reminder || typeof reminder !== "object" || Array.isArray(reminder)) {
      return reminder;
    }
    return { ...(reminder as Record<string, unknown>), status: "confirmed" };
  });
}

export function dismissReminderSuggestion(
  analysis: Record<string, unknown>,
  reminderIndex: unknown,
) {
  const index = Number(reminderIndex);
  const reminders = Array.isArray(analysis.suggested_reminders)
    ? analysis.suggested_reminders
    : [];
  if (!Number.isInteger(index) || index < 0 || index >= reminders.length) {
    return reminders;
  }
  return reminders.filter((_, itemIndex) => itemIndex !== index);
}

export function saveConfirmedReminderSuggestion(
  analysis: Record<string, unknown>,
  input: unknown,
  reminderIndex: unknown,
) {
  const reminders = Array.isArray(analysis.suggested_reminders)
    ? [...analysis.suggested_reminders]
    : [];
  const index = Number(reminderIndex);
  const hasExisting = Number.isInteger(index) && index >= 0 &&
    index < reminders.length;
  const fallback = hasExisting && reminders[index] &&
      typeof reminders[index] === "object" && !Array.isArray(reminders[index])
    ? reminders[index] as Record<string, unknown>
    : {};
  const reminder = confirmedReminderFromInput(input, fallback);
  if (!reminder) return null;
  if (hasExisting) {
    reminders[index] = reminder;
    return reminders;
  }
  return [reminder, ...reminders];
}

export async function applyCollectionReviewDecisions(
  supabase: ReturnType<typeof adminClient>,
  userId: string,
  captureId: string,
  decisions: unknown,
) {
  for (const item of Array.isArray(decisions) ? decisions : []) {
    if (!item || typeof item !== "object") continue;
    const decision = item as Record<string, unknown>;
    if (
      decision.kind === "linked" && decision.action === "remove" &&
      typeof decision.collectionId === "string"
    ) {
      const { error } = await supabase
        .from("collection_capture_links")
        .update({
          unlinked_at: new Date().toISOString(),
          unlink_reason: "user_removed",
        })
        .eq("user_id", userId)
        .eq("collection_id", decision.collectionId)
        .eq("capture_id", captureId)
        .is("unlinked_at", null);
      if (error) throw error;
      await refreshCollectionPreviewAfterCaptureRemoval(
        supabase,
        userId,
        decision.collectionId,
        [captureId],
      );
      continue;
    }

    if (decision.kind !== "suggested" || decision.action !== "link") continue;
    const collectionId = typeof decision.collectionId === "string"
      ? decision.collectionId
      : "";
    const rationale = typeof decision.rationale === "string"
      ? decision.rationale
      : null;
    const confidence = Number(decision.confidence);
    if (!collectionId) continue;
    const collection = await supabase
      .from("collections")
      .select("id,status,deleted_at")
      .eq("user_id", userId)
      .eq("id", collectionId)
      .maybeSingle();
    if (collection.error) throw collection.error;
    if (
      !collection.data || collection.data.status === "archived" ||
      collection.data.deleted_at
    ) continue;
    await linkCaptureToCollection(supabase, userId, collectionId, captureId, {
      createdBy: "analysis",
      rationale,
      confidence: Number.isFinite(confidence) ? confidence : null,
    });
  }
}

export async function acceptPendingCollectionDecisions(
  supabase: ReturnType<typeof adminClient>,
  userId: string,
  captureId: string,
  analysis: Record<string, unknown>,
) {
  const decisions = activeCollectionDecisionRows(analysis)
    .map((decision, index) => {
      const normalized = normalizeCollectionDecision(decision);
      return {
        kind: "suggested",
        index,
        type: normalized.type,
        collectionId: normalized.collection_id,
        title: normalized.title,
        description: normalized.description,
        rationale: normalized.rationale,
        confidence: normalized.confidence,
        action: "link",
      };
    })
    .filter((decision) =>
      decision.type === "existing" && Boolean(decision.collectionId)
    );
  if (!decisions.length) return;
  await applyCollectionReviewDecisions(
    supabase,
    userId,
    captureId,
    decisions,
  );
}
