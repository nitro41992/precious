import { adminClient } from "./supabase.ts";
import {
  CAPTURE_GATE_PROMPT_VERSION,
  CONTEXTLESS_LINK_REJECTED_MESSAGE,
  PREFLIGHT_PROMPT_VERSION,
  PROMPT_VERSION,
  SCHEMA_VERSION,
} from "./config.ts";
import { cleanedString, errorMessage, normalizeUrl } from "./common.ts";
import {
  ensureCaptureBucket,
  extractUrl,
  inferCaptureType,
  inferSourceApp,
  safeFilename,
  titleFallback,
} from "./capture-records.ts";
import {
  assertFetchableUrl,
  buildUrlEvidence,
  clientResolutionInput,
  logUrlIngest,
  productEvidenceStatus,
} from "./url-evidence.ts";
import {
  analysisRequiresReview,
  applyPreflightPolicy,
  captureGateMetadata,
  captureGateNeedsReviewAnalysis,
  contentEvidenceProfile,
  firstCaptureAsset,
  normalizedReviewAnalysis,
  normalizedUrlEvidenceForCapture,
  rejectedAnalysis,
  runCaptureGate,
  runOpenAi,
  runPreflight,
  sanitizeAnalysisRationales,
  shouldAnalyzeAfterCaptureGate,
  shouldAttachUrlEvidence,
  shouldRunCaptureGate,
  shouldRunPreflight,
  shouldRejectContextlessLinkCapture,
} from "./analysis.ts";
import {
  autoLinkCollectionDecisions,
  refreshCaptureEmbedding,
  retrieveCollectionsForCapture,
} from "./collections.ts";
import type {
  AnalysisOutput,
  CapturePayload,
  CaptureRow,
  UrlEvidence,
} from "./types.ts";

export async function persistDeterministicAnalysis(
  supabase: ReturnType<typeof adminClient>,
  userId: string,
  capture: CaptureRow,
  analysis: AnalysisOutput,
  mode: string,
) {
  const normalizedAnalysis = normalizedReviewAnalysis(analysis);
  const { error: runError } = await supabase.from("analysis_runs").insert({
    user_id: userId,
    capture_id: capture.id,
    provider: "system",
    model: "url-evidence-policy",
    status: "succeeded",
    prompt_version: "url-evidence-policy-v1",
    schema_version: "url-evidence-policy-v1",
    raw_output: normalizedAnalysis,
    raw_model_output: JSON.stringify({
      url_evidence: normalizedAnalysis.url_evidence,
    }),
  });
  await supabase
    .from("captures")
    .update({
      analysis_state: "needs_review",
      analysis_error: typeof normalizedAnalysis.summary === "string"
        ? normalizedAnalysis.summary
        : null,
      analysis: normalizedAnalysis,
      analysis_provider: "system",
      analysis_model: "url-evidence-policy",
      analysis_mode: mode,
      display_title: normalizedAnalysis.display_title,
      title: capture.title || normalizedAnalysis.display_title,
      default_intent: normalizedAnalysis.default_intent.category,
      default_intent_confidence: normalizedAnalysis.default_intent.confidence,
      current_save_intent: normalizedAnalysis.default_intent.category,
      intent_rationale: normalizedAnalysis.default_intent.rationale,
      processed_at: new Date().toISOString(),
    })
    .eq("id", capture.id)
    .eq("user_id", userId);
  await refreshCaptureEmbedding(supabase, userId, capture.id).catch(
    (error) => {
      console.warn("Capture embedding refresh failed", errorMessage(error));
    },
  );
}

export async function persistCaptureGateNeedsReview(
  supabase: ReturnType<typeof adminClient>,
  userId: string,
  capture: CaptureRow,
  urlEvidence: UrlEvidence | null,
  result: Awaited<ReturnType<typeof runCaptureGate>>,
) {
  const analysis = captureGateNeedsReviewAnalysis(
    capture,
    result.gate,
    urlEvidence,
  );
  const normalizedAnalysis = normalizedReviewAnalysis(analysis);
  const { error: runError } = await supabase.from("analysis_runs").insert({
    user_id: userId,
    capture_id: capture.id,
    provider: "openai",
    model: result.model,
    status: "succeeded",
    prompt_version: CAPTURE_GATE_PROMPT_VERSION,
    schema_version: CAPTURE_GATE_PROMPT_VERSION,
    latency_ms: result.latencyMs,
    usage: result.usage,
    raw_output: normalizedAnalysis,
    raw_model_output: JSON.stringify({
      capture_gate_request: result.requestBody,
      capture_gate_response: result.raw,
      url_evidence: urlEvidence,
    }),
  });
  await supabase
    .from("captures")
    .update({
      analysis_state: "needs_review",
      analysis_error: null,
      analysis: normalizedAnalysis,
      analysis_provider: "openai",
      analysis_model: result.model,
      analysis_mode: "capture_gate_needs_review",
      display_title: normalizedAnalysis.display_title,
      title: capture.title || normalizedAnalysis.display_title,
      default_intent: normalizedAnalysis.default_intent.category,
      default_intent_confidence: normalizedAnalysis.default_intent.confidence,
      current_save_intent: normalizedAnalysis.default_intent.category,
      intent_rationale: normalizedAnalysis.default_intent.rationale,
      processed_at: new Date().toISOString(),
    })
    .eq("id", capture.id)
    .eq("user_id", userId);
  await refreshCaptureEmbedding(supabase, userId, capture.id).catch(
    (error) => {
      console.warn("Capture embedding refresh failed", errorMessage(error));
    },
  );
}

export async function rejectCapturePreflight(
  supabase: ReturnType<typeof adminClient>,
  userId: string,
  capture: CaptureRow,
  urlEvidence: UrlEvidence | null,
  result: Awaited<ReturnType<typeof runPreflight>>,
) {
  const analysis = rejectedAnalysis(capture, result.preflight, urlEvidence);
  const normalizedAnalysis = normalizedReviewAnalysis(analysis);
  await supabase.from("analysis_runs").insert({
    user_id: userId,
    capture_id: capture.id,
    provider: "openai",
    model: result.model,
    status: "failed",
    prompt_version: PREFLIGHT_PROMPT_VERSION,
    schema_version: PREFLIGHT_PROMPT_VERSION,
    latency_ms: result.latencyMs,
    usage: result.usage,
    raw_output: result.preflight,
    raw_model_output: JSON.stringify({
      preflight_request: result.requestBody,
      preflight_response: result.raw,
      url_evidence: urlEvidence,
    }),
    error_message: result.preflight.user_message,
  });
  await supabase
    .from("captures")
    .update({
      analysis_state: "failed",
      analysis_error: result.preflight.user_message,
      analysis: normalizedAnalysis,
      analysis_provider: "openai",
      analysis_model: result.model,
      analysis_mode: "preflight_rejected",
      display_title: normalizedAnalysis.display_title,
      title: capture.title || normalizedAnalysis.display_title,
      processed_at: new Date().toISOString(),
    })
    .eq("id", capture.id)
    .eq("user_id", userId);
  await refreshCaptureEmbedding(supabase, userId, capture.id).catch(
    (error) => {
      console.warn("Capture embedding refresh failed", errorMessage(error));
    },
  );
}

export async function rejectContextlessLinkCapture(
  supabase: ReturnType<typeof adminClient>,
  userId: string,
  capture: CaptureRow,
  urlEvidence: UrlEvidence | null,
  reason: string,
  runDetails: Record<string, unknown> = {},
) {
  const now = new Date().toISOString();
  const analysis = normalizedReviewAnalysis({
    display_title: titleFallback(capture.source_text, capture.source_url),
    summary: CONTEXTLESS_LINK_REJECTED_MESSAGE,
    default_intent: {
      category: null,
      confidence: 0,
      rationale: "The saved link did not provide enough context.",
    },
    entities: [],
    visit_target_name: null,
    visit_target_query: null,
    visit_target_confidence: "none",
    visit_target_evidence: [],
    verified_place: false,
    suggested_reminders: [],
    collection_decisions: [],
    search_phrases: [],
    confidence_label: "Couldn't tell",
    review_targets: ["analysis", "intent"],
    needs_review: true,
    content_evidence_profile: contentEvidenceProfile(capture, urlEvidence),
    url_evidence: normalizedUrlEvidenceForCapture(capture, urlEvidence),
    capture_state: "rejected",
    rejection_reason: reason,
  });

  const { error: runError } = await supabase.from("analysis_runs").insert({
    user_id: userId,
    capture_id: capture.id,
    provider: "system",
    model: "deterministic",
    status: "failed",
    prompt_version: "contextless_link_rejection",
    schema_version: SCHEMA_VERSION,
    latency_ms: 0,
    usage: {},
    raw_output: { reason, ...runDetails },
    raw_model_output: JSON.stringify({
      reason,
      url_evidence: urlEvidence,
      ...runDetails,
    }),
    error_message: CONTEXTLESS_LINK_REJECTED_MESSAGE,
  });
  if (runError) throw runError;

  const { error: updateError } = await supabase
    .from("captures")
    .update({
      analysis_state: "failed",
      analysis_error: CONTEXTLESS_LINK_REJECTED_MESSAGE,
      analysis,
      analysis_provider: "system",
      analysis_model: "deterministic",
      analysis_mode: "contextless_rejected",
      rejected_at: now,
      processed_at: now,
    })
    .eq("id", capture.id)
    .eq("user_id", userId);
  if (updateError) throw updateError;
}

export async function processCapture(captureId: string, userId: string) {
  const supabase = adminClient();
  const { data: capture, error: captureError } = await supabase
    .from("captures")
    .select("*, capture_assets(*)")
    .eq("id", captureId)
    .eq("user_id", userId)
    .single();
  if (captureError || !capture) return;

  await supabase
    .from("captures")
    .update({ analysis_state: "processing", analysis_error: null })
    .eq("id", captureId)
    .eq("user_id", userId);

  try {
    const asset = firstCaptureAsset(capture);
    const signedAsset =
      asset?.storage_path && String(asset.mime_type || "").startsWith("image/")
        ? await supabase.storage.from("captures").createSignedUrl(
          asset.storage_path,
          60 * 10,
        )
        : null;
    const captureForAnalysis = signedAsset?.data?.signedUrl
      ? {
        ...capture,
        asset_url: signedAsset.data.signedUrl,
        asset_mime_type: asset?.mime_type || null,
      }
      : capture;
    const urlEvidence = capture.source_url
      ? await buildUrlEvidence(capture.source_url, supabase, {
        originalUrl: capture.original_url || capture.source_url,
        clientResolvedUrl: capture.client_resolved_url || null,
        clientResolutionSource: capture.client_resolution_source || null,
        clientResolutionTimestamp: capture.client_resolution_timestamp || null,
        clientResolutionAttemptCount:
          typeof capture.client_resolution_attempt_count === "number"
            ? capture.client_resolution_attempt_count
            : null,
      })
      : null;
    const urlEvidenceStatus = productEvidenceStatus(urlEvidence);
    let captureGateResult: Awaited<ReturnType<typeof runCaptureGate>> | null =
      null;
    if (shouldRunCaptureGate(capture, asset)) {
      captureGateResult = await runCaptureGate(captureForAnalysis);
      if (!shouldAnalyzeAfterCaptureGate(captureGateResult.gate)) {
        await persistCaptureGateNeedsReview(
          supabase,
          userId,
          captureForAnalysis,
          urlEvidence,
          captureGateResult,
        );
        return;
      }
    }
    if (
      !captureGateResult &&
      shouldRejectContextlessLinkCapture(capture, asset, urlEvidence)
    ) {
      logUrlIngest(urlEvidence, 0);
      await rejectContextlessLinkCapture(
        supabase,
        userId,
        capture,
        urlEvidence,
        "contextless_link_evidence",
        { url_evidence_status: urlEvidenceStatus },
      );
      return;
    }
    let preflightResult: Awaited<ReturnType<typeof runPreflight>> | null = null;
    if (shouldRunPreflight(capture, asset)) {
      preflightResult = await runPreflight(capture, urlEvidence);
      preflightResult.preflight = applyPreflightPolicy(
        capture,
        preflightResult.preflight,
        urlEvidence,
      );
      if (preflightResult.preflight.decision === "invalid") {
        logUrlIngest(urlEvidence, 0);
        if (shouldRejectContextlessLinkCapture(capture, asset, urlEvidence)) {
          await rejectContextlessLinkCapture(
            supabase,
            userId,
            capture,
            urlEvidence,
            preflightResult.preflight.rationale_code ||
              "preflight_invalid_contextless_link",
            {
              preflight: preflightResult.preflight,
              model: preflightResult.model,
            },
          );
        } else {
          await rejectCapturePreflight(
            supabase,
            userId,
            capture,
            urlEvidence,
            preflightResult,
          );
        }
        return;
      }
    }
    const retrievedCollections = await retrieveCollectionsForCapture(
      supabase,
      userId,
      captureForAnalysis,
      urlEvidence,
    )
      .catch(() => []);
    const result = await runOpenAi(
      captureForAnalysis,
      urlEvidence,
      retrievedCollections,
    );
    const analysisInput: AnalysisOutput = {
      ...result.analysis,
      content_evidence_profile: contentEvidenceProfile(
        captureForAnalysis,
        urlEvidence,
      ),
    };
    const normalizedEvidence = normalizedUrlEvidenceForCapture(
      capture,
      urlEvidence,
    );
    if (normalizedEvidence) analysisInput.url_evidence = normalizedEvidence;
    if (captureGateResult) {
      analysisInput.capture_gate = captureGateMetadata(captureGateResult.gate);
    }
    const analysis = normalizedReviewAnalysis(
      await autoLinkCollectionDecisions(
        supabase,
        userId,
        captureId,
        sanitizeAnalysisRationales(analysisInput),
        retrievedCollections,
      ),
    );
    const { data: run, error: runError } = await supabase
      .from("analysis_runs")
      .insert({
        user_id: userId,
        capture_id: captureId,
        provider: "openai",
        model: result.model,
        status: "succeeded",
        prompt_version: PROMPT_VERSION,
        schema_version: SCHEMA_VERSION,
        latency_ms: result.latencyMs,
        usage: result.usage,
        raw_output: analysis,
        raw_model_output: JSON.stringify({
          capture_gate: captureGateResult?.gate || null,
          capture_gate_request: captureGateResult?.requestBody || null,
          capture_gate_response: captureGateResult?.raw || null,
          preflight: preflightResult?.preflight || null,
          preflight_request: preflightResult?.requestBody || null,
          preflight_response: preflightResult?.raw || null,
          extraction_request: result.requestBody,
          response: result.raw,
          url_evidence: result.urlEvidence,
          retrieved_collections: result.retrievedCollections,
        }),
      })
      .select("id")
      .single();
    if (runError) throw runError;
    if (shouldAttachUrlEvidence(capture, urlEvidence)) {
      logUrlIngest(urlEvidence, analysis.default_intent?.confidence ?? null);
    }

    await supabase
      .from("captures")
      .update({
        analysis_state: analysisRequiresReview(analysis)
          ? "needs_review"
          : "ready",
        analysis_error: null,
        analysis,
        analysis_provider: "openai",
        analysis_model: result.model,
        analysis_mode: "llm",
        display_title: analysis.display_title,
        title: capture.title || analysis.display_title,
        default_intent: analysis.default_intent.category,
        default_intent_confidence: analysis.default_intent.confidence,
        current_save_intent: analysis.default_intent.category,
        intent_rationale: analysis.default_intent.rationale,
        processed_at: new Date().toISOString(),
      })
      .eq("id", captureId)
      .eq("user_id", userId);
    await refreshCaptureEmbedding(supabase, userId, captureId).catch(
      (error) => {
        console.warn("Capture embedding refresh failed", errorMessage(error));
      },
    );
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : "Capture analysis failed";
    await supabase.from("analysis_runs").insert({
      user_id: userId,
      capture_id: captureId,
      provider: "openai",
      model: Deno.env.get("OPENAI_MODEL") || "gpt-5-mini",
      status: "failed",
      prompt_version: PROMPT_VERSION,
      schema_version: SCHEMA_VERSION,
      raw_output: {},
      error_message: message,
    });
    await supabase
      .from("captures")
      .update({
        analysis_state: "failed",
        analysis_error: message,
        analysis_mode: "llm_failed",
        analysis_provider: "openai",
        analysis_model: Deno.env.get("OPENAI_MODEL") || "gpt-5-mini",
        processed_at: new Date().toISOString(),
      })
      .eq("id", captureId)
      .eq("user_id", userId);
  }
}

export async function createOrGetCaptureFromFields(
  supabase: ReturnType<typeof adminClient>,
  userId: string,
  fields: Record<string, unknown>,
) {
  const sourceText = typeof fields.sourceText === "string"
    ? fields.sourceText.trim()
    : "";
  const clientResolution = clientResolutionInput(fields);
  const explicitSourceUrl = cleanedString(
    fields.sourceUrl || fields.source_url,
  );
  if (explicitSourceUrl && !normalizeUrl(explicitSourceUrl)) {
    throw new Error("sourceUrl must be a valid http/https URL");
  }
  const sourceUrl = explicitSourceUrl
    ? normalizeUrl(explicitSourceUrl)
    : clientResolution.originalUrl
    ? clientResolution.originalUrl
    : extractUrl(sourceText);
  if (
    (fields.client_resolved_url || fields.clientResolvedUrl) &&
    !clientResolution.clientResolvedUrl
  ) {
    throw new Error("client_resolved_url must be a valid http/https URL");
  }
  if (
    (fields.original_url || fields.originalUrl) && !clientResolution.originalUrl
  ) {
    throw new Error("original_url must be a valid http/https URL");
  }
  if (sourceUrl) await assertFetchableUrl(sourceUrl);
  if (clientResolution.clientResolvedUrl) {
    await assertFetchableUrl(clientResolution.clientResolvedUrl);
  }
  if (!sourceText && !sourceUrl) {
    throw new Error("sourceText or sourceUrl is required");
  }

  const clientCaptureKey = typeof fields.clientCaptureKey === "string" &&
      fields.clientCaptureKey.trim()
    ? fields.clientCaptureKey.trim()
    : crypto.randomUUID();

  const existing = await supabase
    .from("captures")
    .select("*")
    .eq("user_id", userId)
    .eq("client_capture_key", clientCaptureKey)
    .maybeSingle();
  if (existing.data) {
    if (clientResolution.clientResolvedUrl) {
      const update: Record<string, unknown> = {
        original_url: clientResolution.originalUrl ||
          existing.data.original_url || existing.data.source_url || sourceUrl,
        client_resolved_url: clientResolution.clientResolvedUrl,
        client_resolution_source: clientResolution.clientResolutionSource,
        client_resolution_timestamp:
          clientResolution.clientResolutionTimestamp ||
          new Date().toISOString(),
        client_resolution_attempt_count:
          clientResolution.clientResolutionAttemptCount ??
            Math.min(
              Number(existing.data.client_resolution_attempt_count || 0) + 1,
              10,
            ),
        analysis_state: "queued",
        analysis_error: null,
        analysis: null,
        analysis_mode: null,
        analysis_provider: null,
        analysis_model: null,
        processed_at: null,
      };
      const { data, error } = await supabase
        .from("captures")
        .update(update)
        .eq("user_id", userId)
        .eq("id", existing.data.id)
        .select("*")
        .single();
      if (error) throw error;
      return data;
    }
    return existing.data;
  }
  if (existing.error) throw existing.error;

  const { data, error } = await supabase
    .from("captures")
    .insert({
      user_id: userId,
      client_capture_key: clientCaptureKey,
      capture_type: inferCaptureType(sourceUrl, sourceText),
      source_url: sourceUrl,
      original_url: clientResolution.originalUrl || sourceUrl,
      client_resolved_url: clientResolution.clientResolvedUrl,
      client_resolution_source: clientResolution.clientResolutionSource,
      client_resolution_timestamp: clientResolution.clientResolutionTimestamp,
      client_resolution_attempt_count:
        clientResolution.clientResolutionAttemptCount || 0,
      source_text: sourceText,
      source_app:
        typeof fields.sourceApp === "string" && fields.sourceApp.trim()
          ? fields.sourceApp
          : inferSourceApp(sourceUrl) || "Android Share",
      display_title: titleFallback(sourceText, sourceUrl),
      analysis_state: "queued",
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function createOrGetCaptureWithAsset(
  supabase: ReturnType<typeof adminClient>,
  userId: string,
  fields: Record<string, unknown>,
  asset: CapturePayload["asset"],
) {
  const sourceText =
    typeof fields.sourceText === "string" && fields.sourceText.trim()
      ? fields.sourceText.trim()
      : asset
      ? `Shared ${asset.contentType.split("/")[0] || "file"}: ${
        asset.filename || "attachment"
      }`
      : "";
  const capture = await createOrGetCaptureFromFields(supabase, userId, {
    ...fields,
    sourceText,
    sourceUrl: typeof fields.sourceUrl === "string" && fields.sourceUrl.trim()
      ? fields.sourceUrl
      : extractUrl(sourceText),
    sourceApp: typeof fields.sourceApp === "string"
      ? fields.sourceApp
      : "Android Share",
  });
  if (!asset || !asset.size) return capture;

  const existing = await supabase
    .from("capture_assets")
    .select("id")
    .eq("user_id", userId)
    .eq("capture_id", capture.id)
    .maybeSingle();
  if (existing.error && existing.error.code !== "PGRST116") {
    throw existing.error;
  }
  if (existing?.data) return capture;

  const extension = safeFilename(asset.filename).split(".").pop() || "bin";
  const storagePath =
    `${userId}/${capture.id}/${crypto.randomUUID()}.${extension}`;
  await ensureCaptureBucket(supabase);
  const upload = await supabase.storage.from("captures").upload(
    storagePath,
    asset.bytes,
    {
      contentType: asset.contentType || "application/octet-stream",
      cacheControl: "31536000",
      upsert: false,
    },
  );
  if (upload.error) throw upload.error;

  const { error: assetError } = await supabase.from("capture_assets").insert({
    user_id: userId,
    capture_id: capture.id,
    storage_path: storagePath,
    public_url: null,
    mime_type: asset.contentType || "application/octet-stream",
    byte_size: asset.size,
  });
  if (assetError) throw assetError;

  const { data: updated, error: updateError } = await supabase
    .from("captures")
    .update({
      capture_type: asset.contentType.startsWith("image/")
        ? "image"
        : capture.capture_type,
    })
    .eq("id", capture.id)
    .eq("user_id", userId)
    .select("*")
    .single();
  if (updateError) throw updateError;
  return updated;
}
