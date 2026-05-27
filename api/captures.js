const {
  createOrGetCapture,
  createOrGetCaptureWithAsset,
  loadCapture,
  mergeAnalysisPatch,
  readBody,
  readCapturePayload,
  send,
  withCaptureState,
  withCaptureStates,
  withUser
} = require("./_lib/hosted.cjs");
const saveIntents = require("../supabase/functions/_shared/save-intents.json");

const activeSaveIntentKeys = new Set(
  saveIntents.filter((intent) => intent.active).map((intent) => intent.key)
);

function archivedFilter(row, archived) {
  const state = row.capture_state || (row.archived_at || row.analysis?.capture_state === "archived" ? "archived" : "active");
  return archived ? state === "archived" : state !== "archived";
}

function confirmedReminderSuggestions(analysis) {
  const reminders = Array.isArray(analysis.suggested_reminders) ? analysis.suggested_reminders : [];
  return reminders.map((reminder) =>
    reminder && typeof reminder === "object" && !Array.isArray(reminder)
      ? { ...reminder, status: "confirmed" }
      : reminder
  );
}

function dismissReminderSuggestion(analysis, reminderIndex) {
  const index = Number(reminderIndex);
  const reminders = Array.isArray(analysis.suggested_reminders) ? analysis.suggested_reminders : [];
  if (!Number.isInteger(index) || index < 0 || index >= reminders.length) return reminders;
  return reminders.filter((_, itemIndex) => itemIndex !== index);
}

function reviewReminderSuggestions(analysis, decisions) {
  const removeIndices = new Set(
    (Array.isArray(decisions) ? decisions : [])
      .filter((decision) => decision?.action === "remove")
      .map((decision) => Number(decision.index))
      .filter(Number.isInteger)
  );
  const reminders = Array.isArray(analysis.suggested_reminders) ? analysis.suggested_reminders : [];
  return reminders.filter((_, index) => !removeIndices.has(index));
}

function collectionDecisionKey(decision, index) {
  return `${index}:${decision?.type || ""}:${decision?.collectionId || decision?.collection_id || decision?.title || ""}`;
}

function reviewCollectionDecisions(analysis, decisions) {
  const acceptedKeys = new Set(
    (Array.isArray(decisions) ? decisions : [])
      .filter((decision) => decision?.kind === "suggested" && (decision.action === "link" || decision.action === "create"))
      .map((decision) => collectionDecisionKey(decision, Number(decision.index)))
  );
  const current = Array.isArray(analysis.collection_decisions)
    ? analysis.collection_decisions
    : Array.isArray(analysis.suggested_collections)
      ? analysis.suggested_collections
      : [];
  return current.filter((decision, index) => !acceptedKeys.has(collectionDecisionKey(decision, index)));
}

async function linkCaptureToCollection(supabase, userId, collectionId, captureId, fields = {}) {
  const replaced = await supabase
    .from("collection_capture_links")
    .update({ unlinked_at: new Date().toISOString(), unlink_reason: "collection_replaced" })
    .eq("user_id", userId)
    .eq("capture_id", captureId)
    .neq("collection_id", collectionId)
    .is("unlinked_at", null);
  if (replaced.error) throw replaced.error;

  const active = await supabase
    .from("collection_capture_links")
    .select("id")
    .eq("user_id", userId)
    .eq("collection_id", collectionId)
    .eq("capture_id", captureId)
    .is("unlinked_at", null)
    .maybeSingle();
  if (active.error) throw active.error;
  if (active.data) return active.data;
  const { data, error } = await supabase
    .from("collection_capture_links")
    .insert({
      user_id: userId,
      collection_id: collectionId,
      capture_id: captureId,
      created_by: fields.createdBy || "user",
      rationale: fields.rationale || null,
      confidence: fields.confidence ?? null
    })
    .select("id")
    .single();
  if (error) throw error;
  return data;
}

function activeCollectionDecisionRows(analysis) {
  return Array.isArray(analysis.collection_decisions)
    ? analysis.collection_decisions
    : Array.isArray(analysis.suggested_collections)
      ? analysis.suggested_collections
      : [];
}

function collectionChoiceOverrides(analysis) {
  return Array.isArray(analysis.collection_choice_overrides)
    ? analysis.collection_choice_overrides.filter((item) => item && typeof item === "object")
    : [];
}

function choiceRestoredDecisions(override) {
  return Array.isArray(override.restored_decisions)
    ? override.restored_decisions.filter((item) => item && typeof item === "object")
    : [];
}

function collectionChoiceOverrideId(decision, index) {
  const collectionId = typeof decision?.collection_id === "string" && decision.collection_id.trim()
    ? decision.collection_id.trim()
    : typeof decision?.collectionId === "string" && decision.collectionId.trim()
      ? decision.collectionId.trim()
      : "";
  return collectionId || `suggestion:${collectionDecisionKey(decision, index)}`;
}

function sameCollectionDecision(decision, accepted) {
  const collectionId = decision?.collectionId || decision?.collection_id;
  if (accepted.collectionId && collectionId === accepted.collectionId) return true;
  return (
    decision?.type === accepted.type &&
    String(decision?.title || "").trim().toLowerCase() === String(accepted.title || "").trim().toLowerCase()
  );
}

async function attachLinkedCollections(supabase, userId, rows) {
  const captureIds = rows.map((row) => String(row.id)).filter(Boolean);
  if (!captureIds.length) return rows;
  const { data, error } = await supabase
    .from("collection_capture_links")
    .select("capture_id, collection_id, created_by, rationale, confidence, linked_at, collections(id,title,description,status)")
    .eq("user_id", userId)
    .in("capture_id", captureIds)
    .is("unlinked_at", null);
  if (error) return rows;
  const byCapture = new Map();
  for (const link of data ?? []) {
    const collection = link.collections;
    if (!collection || collection.status === "archived") continue;
    const captureId = String(link.capture_id);
    const item = {
      id: String(collection.id),
      title: String(collection.title || ""),
      description: String(collection.description || ""),
      created_by: String(link.created_by || "user"),
      rationale: link.rationale || null,
      confidence: link.confidence ?? null,
      linked_at: link.linked_at || null
    };
    byCapture.set(captureId, [...(byCapture.get(captureId) || []), item]);
  }
  return rows.map((row) => ({ ...row, linked_collections: byCapture.get(String(row.id)) || [] }));
}

async function captureResponse(supabase, userId, captureId) {
  const { data, error } = await supabase
    .from("captures")
    .select("*, analysis_runs(*), capture_assets(*)")
    .eq("user_id", userId)
    .eq("id", captureId)
    .single();
  if (error) throw error;
  const rows = await attachLinkedCollections(supabase, userId, [data]);
  return withCaptureState(rows[0] || data);
}

async function applyCollectionChoice(supabase, userId, capture, body) {
  const choice = body.choice && typeof body.choice === "object" ? body.choice : {};
  const analysis = capture.analysis && typeof capture.analysis === "object" ? capture.analysis : {};
  const currentDecisions = activeCollectionDecisionRows(analysis);
  const suggestionIndex = Number(body.suggestionIndex);
  const source = body.source === "analysis" ? "analysis" : "manual";
  const dismissedDecisions = body.dismissCurrentCollectionSuggestions
    ? currentDecisions
    : Number.isInteger(suggestionIndex) && suggestionIndex >= 0 && suggestionIndex < currentDecisions.length
      ? [currentDecisions[suggestionIndex]]
      : [];
  const rationale = typeof body.rationale === "string"
    ? body.rationale
    : typeof dismissedDecisions[0]?.rationale === "string"
      ? dismissedDecisions[0].rationale
      : null;
  const confidence = Number.isFinite(Number(body.confidence))
    ? Number(body.confidence)
    : Number.isFinite(Number(dismissedDecisions[0]?.confidence))
      ? Number(dismissedDecisions[0]?.confidence)
      : null;

  let collectionId = typeof choice.collectionId === "string" ? choice.collectionId : "";
  if (choice.type === "new") {
    const title = String(choice.title || "").trim();
    const description = String(choice.description || "").trim();
    if (!title || !description) return { status: 400, body: { error: "title and description are required" } };
    const created = await supabase
      .from("collections")
      .insert({ user_id: userId, title, description, created_by: source === "analysis" ? "analysis" : "user" })
      .select("*")
      .single();
    if (created.error) throw created.error;
    collectionId = String(created.data.id);
  } else if (choice.type === "existing") {
    if (!collectionId) return { status: 400, body: { error: "collectionId is required" } };
    const collection = await supabase
      .from("collections")
      .select("id,status")
      .eq("user_id", userId)
      .eq("id", collectionId)
      .maybeSingle();
    if (collection.error) throw collection.error;
    if (!collection.data) return { status: 404, body: { error: "Collection not found" } };
    if (collection.data.status === "archived") return { status: 400, body: { error: "Archived collections cannot be linked" } };
  } else {
    return { status: 400, body: { error: "choice.type must be existing or new" } };
  }

  await linkCaptureToCollection(supabase, userId, collectionId, capture.id, {
    createdBy: source === "analysis" ? "analysis" : "user",
    rationale,
    confidence
  });
  const dismissedKeys = new Set(dismissedDecisions.map((decision) => collectionDecisionKey(decision, currentDecisions.indexOf(decision))));
  const nextDecisions = currentDecisions.filter((decision, index) => !dismissedKeys.has(collectionDecisionKey(decision, index)));
  const overrides = collectionChoiceOverrides(analysis).filter((override) => String(override.collection_id || "") !== collectionId);
  if (source !== "analysis" && dismissedDecisions.length) {
    overrides.push({
      collection_id: collectionId,
      source,
      restored_decisions: dismissedDecisions,
      applied_at: new Date().toISOString()
    });
  }
  const nextAnalysis = {
    ...analysis,
    needs_review: false,
    collection_decisions: nextDecisions,
    suggested_collections: [],
    collection_choice_overrides: overrides
  };
  nextAnalysis.needs_review = analysisRequiresReview(nextAnalysis, capture.review_confirmed_at);
  const update = await supabase
    .from("captures")
    .update({
      analysis: nextAnalysis,
      analysis_state: nextAnalysis.needs_review ? "needs_review" : "ready"
    })
    .eq("user_id", userId)
    .eq("id", capture.id);
  if (update.error) throw update.error;
  return { status: 200, body: { capture: await captureResponse(supabase, userId, capture.id) } };
}

async function clearCollectionSuggestion(supabase, userId, capture, body) {
  const analysis = capture.analysis && typeof capture.analysis === "object" ? capture.analysis : {};
  const currentDecisions = activeCollectionDecisionRows(analysis);
  const suggestionIndex = Number(body.suggestionIndex);
  const dismissedEntries = Number.isInteger(suggestionIndex) && suggestionIndex >= 0 && suggestionIndex < currentDecisions.length
    ? [{ decision: currentDecisions[suggestionIndex], index: suggestionIndex }]
    : currentDecisions.map((decision, index) => ({ decision, index }));
  if (!dismissedEntries.length) {
    return { status: 200, body: { capture: await captureResponse(supabase, userId, capture.id) } };
  }
  const dismissedKeys = new Set(dismissedEntries.map(({ decision, index }) => collectionDecisionKey(decision, index)));
  const dismissedOverrideIds = new Set(dismissedEntries.map(({ decision, index }) => collectionChoiceOverrideId(decision, index)));
  const overrides = collectionChoiceOverrides(analysis)
    .filter((override) => !dismissedOverrideIds.has(String(override.collection_id || "")));
  for (const { decision, index } of dismissedEntries) {
    overrides.push({
      collection_id: collectionChoiceOverrideId(decision, index),
      source: "clear",
      restored_decisions: [decision],
      applied_at: new Date().toISOString()
    });
  }
  const nextDecisions = currentDecisions.filter((decision, index) => !dismissedKeys.has(collectionDecisionKey(decision, index)));
  const nextAnalysis = {
    ...analysis,
    needs_review: false,
    collection_decisions: nextDecisions,
    suggested_collections: [],
    collection_choice_overrides: overrides
  };
  nextAnalysis.needs_review = analysisRequiresReview(nextAnalysis, capture.review_confirmed_at);
  const update = await supabase
    .from("captures")
    .update({
      analysis: nextAnalysis,
      analysis_state: nextAnalysis.needs_review ? "needs_review" : "ready"
    })
    .eq("user_id", userId)
    .eq("id", capture.id);
  if (update.error) throw update.error;
  return { status: 200, body: { capture: await captureResponse(supabase, userId, capture.id) } };
}

async function undoCollectionChoice(supabase, userId, capture, body) {
  const collectionId = typeof body.collectionId === "string" ? body.collectionId : "";
  if (!collectionId) return { status: 400, body: { error: "collectionId is required" } };
  const analysis = capture.analysis && typeof capture.analysis === "object" ? capture.analysis : {};
  const overrides = collectionChoiceOverrides(analysis);
  const override = overrides.find((item) => String(item.collection_id || "") === collectionId);
  const restoredDecisions = override ? choiceRestoredDecisions(override) : [];
  const unlinkAt = new Date().toISOString();
  const unlinkQuery = supabase
    .from("collection_capture_links")
    .update({
      unlinked_at: unlinkAt,
      unlink_reason: restoredDecisions.length ? "user_restore_ai" : "user_undo"
    })
    .eq("user_id", userId)
    .eq("capture_id", capture.id)
    .is("unlinked_at", null);
  const unlink = restoredDecisions.length
    ? await unlinkQuery
    : await unlinkQuery.eq("collection_id", collectionId);
  if (unlink.error) throw unlink.error;
  const nextDecisions = [...activeCollectionDecisionRows(analysis)];
  for (const restored of restoredDecisions) {
    if (!nextDecisions.some((decision) => sameCollectionDecision(decision, restored))) nextDecisions.push(restored);
  }
  const nextAnalysis = {
    ...analysis,
    needs_review: false,
    collection_decisions: nextDecisions,
    suggested_collections: [],
    collection_choice_overrides: overrides.filter((item) => String(item.collection_id || "") !== collectionId)
  };
  nextAnalysis.needs_review = analysisRequiresReview(nextAnalysis, capture.review_confirmed_at);
  const update = await supabase
    .from("captures")
    .update({
      analysis: nextAnalysis,
      analysis_state: nextAnalysis.needs_review ? "needs_review" : "ready"
    })
    .eq("user_id", userId)
    .eq("id", capture.id);
  if (update.error) throw update.error;
  return { status: 200, body: { capture: await captureResponse(supabase, userId, capture.id) } };
}

async function applyCollectionReviewDecisions(supabase, userId, captureId, decisions) {
  for (const decision of Array.isArray(decisions) ? decisions : []) {
    if (decision?.kind === "linked" && decision.action === "remove" && decision.collectionId) {
      const { error } = await supabase
        .from("collection_capture_links")
        .update({ unlinked_at: new Date().toISOString(), unlink_reason: "user_removed" })
        .eq("user_id", userId)
        .eq("collection_id", decision.collectionId)
        .eq("capture_id", captureId)
        .is("unlinked_at", null);
      if (error) throw error;
      continue;
    }

    if (decision?.kind !== "suggested" || (decision.action !== "link" && decision.action !== "create")) continue;
    let collectionId = typeof decision.collectionId === "string" ? decision.collectionId : "";
    if (!collectionId && decision.action === "create" && decision.title && decision.description) {
      const existing = await supabase
        .from("collections")
        .select("id,status")
        .eq("user_id", userId)
        .eq("title", decision.title)
        .maybeSingle();
      if (existing.error) throw existing.error;
      if (existing.data?.status === "archived") continue;
      collectionId = existing.data?.id || "";
      if (!collectionId) {
        const created = await supabase
          .from("collections")
          .insert({
            user_id: userId,
            title: decision.title,
            description: decision.description,
            created_by: "analysis"
          })
          .select("id")
          .single();
        if (created.error) throw created.error;
        collectionId = created.data.id;
      }
    }
    if (!collectionId) continue;
    await linkCaptureToCollection(supabase, userId, collectionId, captureId, {
      createdBy: "analysis",
      rationale: decision.rationale,
      confidence: decision.confidence
    });
  }
}

module.exports = async function captures(req, res) {
  return withUser(req, res, async ({ user, supabase }) => {
    if (req.method === "GET") {
      const url = new URL(req.url, "https://precious.local");
      const view = url.searchParams.get("view");
      const captureId = url.searchParams.get("captureId");
      const limit = Math.min(Number(url.searchParams.get("limit") || 50), 100);
      const archived = url.searchParams.get("archived") === "true";

      if (view === "detail") {
        if (!captureId) return send(res, 400, { error: "captureId is required" });
        const capture = await loadCapture(supabase, user.id, captureId);
        if (!capture) return send(res, 404, { error: "Capture not found" });
        return send(res, 200, { capture: withCaptureState(capture) });
      }

      const { data, error } = await supabase
        .from("captures")
        .select("*, analysis_runs(*), capture_assets(*)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(Number.isFinite(limit) ? limit : 50);
      if (error) throw error;
      return send(res, 200, { captures: withCaptureStates(data).filter((row) => archivedFilter(row, archived)) });
    }

    if (req.method === "POST") {
      const payload = await readCapturePayload(req);
      const capture = payload.asset
        ? await createOrGetCaptureWithAsset(supabase, user.id, payload.fields, payload.asset)
        : await createOrGetCapture(supabase, user.id, payload.fields);
      return send(res, 200, { capture });
    }

    if (req.method === "PATCH") {
      const body = await readBody(req);
      if (!body.captureId) return send(res, 400, { error: "captureId is required" });

      if (body.action === "cancel_analysis") {
        const { data, error } = await supabase
          .from("captures")
          .update({
            analysis_cancel_requested_at: new Date().toISOString(),
            analysis_cancel_reason: "user_cancelled",
            analysis_error: "AI processing was cancelled."
          })
          .eq("user_id", user.id)
          .or(`id.eq.${body.captureId},client_capture_key.eq.${body.captureId}`)
          .select("*")
          .single();
        if (error) throw error;
        return send(res, 200, { capture: withCaptureState(data) });
      }

      if (
        body.action === "apply_collection_choice" ||
        body.action === "clear_collection_suggestion" ||
        body.action === "undo_collection_choice"
      ) {
        const existing = await loadCapture(supabase, user.id, body.captureId);
        if (!existing) return send(res, 404, { error: "Capture not found" });
        const result = body.action === "apply_collection_choice"
          ? await applyCollectionChoice(supabase, user.id, existing, body)
          : body.action === "clear_collection_suggestion"
            ? await clearCollectionSuggestion(supabase, user.id, existing, body)
            : await undoCollectionChoice(supabase, user.id, existing, body);
        return send(res, result.status, result.body);
      }

      if (body.action === "archive" || body.action === "restore") {
        const existing = await loadCapture(supabase, user.id, body.captureId);
        if (!existing) return send(res, 404, { error: "Capture not found" });
        const archivedAt = body.action === "archive" ? new Date().toISOString() : null;
        const update = {
          analysis: mergeAnalysisPatch(existing, {
            capture_state: body.action === "archive" ? "archived" : "active",
            archived_at: archivedAt
          })
        };
        const withColumn = { ...update, archived_at: archivedAt };
        let result = await supabase
          .from("captures")
          .update(withColumn)
          .eq("user_id", user.id)
          .or(`id.eq.${body.captureId},client_capture_key.eq.${body.captureId}`)
          .select("*")
          .single();
        if (result.error && /archived_at|schema cache|column/i.test(String(result.error.message || result.error.details || ""))) {
          result = await supabase
            .from("captures")
            .update(update)
            .eq("user_id", user.id)
            .or(`id.eq.${body.captureId},client_capture_key.eq.${body.captureId}`)
            .select("*")
            .single();
        }
        if (result.error) throw result.error;
        return send(res, 200, { capture: withCaptureState(result.data) });
      }

      if (body.action === "confirm_review") {
        const existing = await loadCapture(supabase, user.id, body.captureId);
        if (!existing) return send(res, 404, { error: "Capture not found" });
        const analysis = existing.analysis && typeof existing.analysis === "object" ? existing.analysis : {};
        const confirmedAt = new Date().toISOString();
        const update = {
          analysis: {
            ...analysis,
            needs_review: false,
            collection_decisions: [],
            suggested_collections: [],
            suggested_reminders: confirmedReminderSuggestions(analysis)
          },
          analysis_state: "ready",
          review_confirmed_at: confirmedAt
        };
        if (typeof body.title === "string") {
          const title = body.title.trim() || null;
          update.title = title;
          update.display_title = title;
        }
        if (typeof body.note === "string") update.context_note = body.note.trim() || null;
        if (typeof body.currentSaveIntent === "string") {
          if (!activeSaveIntentKeys.has(body.currentSaveIntent)) {
            return send(res, 400, { error: "currentSaveIntent is not an active save intent" });
          }
          update.current_save_intent = body.currentSaveIntent;
          update.intent_corrected_at = confirmedAt;
        }
        let result = await supabase
          .from("captures")
          .update(update)
          .eq("user_id", user.id)
          .or(`id.eq.${body.captureId},client_capture_key.eq.${body.captureId}`)
          .select("*")
          .single();
        if (result.error && /review_confirmed_at|intent_corrected_at|schema cache|column/i.test(String(result.error.message || result.error.details || ""))) {
          const fallbackUpdate = { ...update };
          delete fallbackUpdate.review_confirmed_at;
          if (/intent_corrected_at/i.test(String(result.error.message || result.error.details || ""))) {
            delete fallbackUpdate.intent_corrected_at;
          }
          result = await supabase
            .from("captures")
            .update(fallbackUpdate)
            .eq("user_id", user.id)
            .or(`id.eq.${body.captureId},client_capture_key.eq.${body.captureId}`)
            .select("*")
            .single();
        }
        if (result.error) throw result.error;
        return send(res, 200, { capture: withCaptureState(result.data) });
      }

      if (body.action === "save_review_decisions") {
        const existing = await loadCapture(supabase, user.id, body.captureId);
        if (!existing) return send(res, 404, { error: "Capture not found" });
        const analysis = existing.analysis && typeof existing.analysis === "object" ? existing.analysis : {};
        await applyCollectionReviewDecisions(supabase, user.id, existing.id, body.collectionDecisions);
        const nextAnalysis = {
          ...analysis,
          needs_review: false,
          collection_decisions: reviewCollectionDecisions(analysis, body.collectionDecisions),
          suggested_collections: [],
          suggested_reminders: reviewReminderSuggestions(analysis, body.reminderDecisions)
        };
        nextAnalysis.needs_review = analysisRequiresReview(nextAnalysis, existing.review_confirmed_at);
        const update = {
          analysis: nextAnalysis,
          analysis_state: nextAnalysis.needs_review ? "needs_review" : "ready"
        };
        if (typeof body.title === "string") {
          const title = body.title.trim() || null;
          update.title = title;
          update.display_title = title;
        }
        if (typeof body.note === "string") update.context_note = body.note.trim() || null;
        if (typeof body.currentSaveIntent === "string") {
          if (!activeSaveIntentKeys.has(body.currentSaveIntent)) {
            return send(res, 400, { error: "currentSaveIntent is not an active save intent" });
          }
          update.current_save_intent = body.currentSaveIntent;
          update.intent_corrected_at = new Date().toISOString();
        }
        let result = await supabase
          .from("captures")
          .update(update)
          .eq("user_id", user.id)
          .eq("id", existing.id)
          .select("*")
          .single();
        if (result.error && update.intent_corrected_at && /intent_corrected_at|schema cache|column/i.test(String(result.error.message || result.error.details || ""))) {
          delete update.intent_corrected_at;
          result = await supabase
            .from("captures")
            .update(update)
            .eq("user_id", user.id)
            .eq("id", existing.id)
            .select("*")
            .single();
        }
        if (result.error) throw result.error;
        return send(res, 200, { capture: withCaptureState(result.data) });
      }

      if (body.action === "dismiss_reminder") {
        const existing = await loadCapture(supabase, user.id, body.captureId);
        if (!existing) return send(res, 404, { error: "Capture not found" });
        const analysis = existing.analysis && typeof existing.analysis === "object" ? existing.analysis : {};
        const nextAnalysis = {
          ...analysis,
          suggested_reminders: dismissReminderSuggestion(analysis, body.reminderIndex)
        };
        const result = await supabase
          .from("captures")
          .update({ analysis: nextAnalysis })
          .eq("user_id", user.id)
          .or(`id.eq.${body.captureId},client_capture_key.eq.${body.captureId}`)
          .select("*")
          .single();
        if (result.error) throw result.error;
        return send(res, 200, { capture: withCaptureState(result.data) });
      }

      const update = {};
      if (typeof body.title === "string") {
        const title = body.title.trim() || null;
        update.title = title;
        update.display_title = title;
      }
      if (typeof body.note === "string") update.context_note = body.note.trim() || null;
      if (typeof body.currentSaveIntent === "string") {
        if (!activeSaveIntentKeys.has(body.currentSaveIntent)) {
          return send(res, 400, { error: "currentSaveIntent is not an active save intent" });
        }
        update.current_save_intent = body.currentSaveIntent;
        update.intent_corrected_at = new Date().toISOString();
      }
      if (!Object.keys(update).length) {
        const capture = await loadCapture(supabase, user.id, body.captureId);
        if (!capture) return send(res, 404, { error: "Capture not found" });
        return send(res, 200, { capture: withCaptureState(capture) });
      }
      let result = await supabase
        .from("captures")
        .update(update)
        .eq("user_id", user.id)
        .or(`id.eq.${body.captureId},client_capture_key.eq.${body.captureId}`)
        .select("*")
        .single();
      if (result.error && update.intent_corrected_at && /intent_corrected_at|schema cache|column/i.test(String(result.error.message || result.error.details || ""))) {
        delete update.intent_corrected_at;
        result = await supabase
          .from("captures")
          .update(update)
          .eq("user_id", user.id)
          .or(`id.eq.${body.captureId},client_capture_key.eq.${body.captureId}`)
          .select("*")
          .single();
      }
      if (result.error) throw result.error;
      return send(res, 200, { capture: withCaptureState(result.data) });
    }

    return send(res, 405, { error: "Method not allowed" });
  });
};
