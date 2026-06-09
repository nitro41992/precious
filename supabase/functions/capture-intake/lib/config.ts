import saveIntents from "../../_shared/save-intents.json" with { type: "json" };
import type { RetrievedCollection } from "./types.ts";

export const CAPTURE_ASSET_SELECT =
  "id,user_id,capture_id,storage_path,public_url,mime_type,byte_size,asset_role,source_url,created_at";
export const CAPTURE_LIST_SELECT =
  "id,user_id,client_capture_key,source_url,source_text,source_app,display_title,title,context_note,analysis_state,analysis_error,analysis,analysis_provider,analysis_mode,default_intent,current_save_intent,intent_rationale,thumbnail_url,capture_type,created_at,updated_at,processed_at,archived_at,deleted_at,delete_purge_after,rejected_at," +
  `capture_assets(${CAPTURE_ASSET_SELECT})`;
export const CAPTURE_DETAIL_SELECT = "*,capture_assets(*)";
export const COLLECTION_LIST_SELECT =
  "id,user_id,title,description,status,created_by,collection_preview_captures,collection_preview_updated_at,archived_at,deleted_at,delete_purge_after,created_at,updated_at";
export const STARTER_COLLECTION_CREATED_BY = "starter";
export const STARTER_COLLECTIONS = [
  {
    title: "Recipes",
    description:
      "Dishes, cooking ideas, restaurant-inspired meals, grocery notes, and kitchen tips you may want to find again.",
  },
  {
    title: "Movies & Shows",
    description:
      "Films, series, trailers, reviews, and recommendations about movies, shows, performers, and media titles.",
  },
  {
    title: "Restaurants & Cafes",
    description:
      "Places to eat or drink, menus, reviews, neighborhood lists, and food spots worth remembering.",
  },
  {
    title: "Products",
    description:
      "Clothing, gifts, gear, home items, tools, and comparisons you are considering or want to revisit.",
  },
  {
    title: "Articles & Guides",
    description:
      "Long reads, how-tos, explainers, reference pages, and practical guides saved for later use.",
  },
] as const;

export const PROMPT_VERSION = "precious-capture-analysis-v16";
export const SCHEMA_VERSION = "precious-capture-analysis-v13";
export const PREFLIGHT_PROMPT_VERSION = "precious-capture-preflight-v1";
export const CAPTURE_GATE_PROMPT_VERSION = "precious-capture-gate-v1";
export const CLIENT_EVENT_RETENTION_DAYS = 90;
export const clientEventTypes = new Set(["hosted_capture_waiting"]);
export const clientEventPhases = new Set([
  "enqueue_capture",
  "enqueue_capture_multipart",
  "poll_capture",
  "trigger_analyze",
  "refresh_auth_session",
  "unknown",
]);
export const clientEventReasonCodes = new Set([
  "dns_resolution_failed",
  "request_timeout",
  "connection_refused",
  "no_route_to_host",
  "connection_reset",
  "connection_aborted",
  "unexpected_end_of_stream",
  "unknown_network_error",
]);
export const clientDiagnosticStringFields = new Set([
  "exception_class",
  "exception_message",
  "request_method",
  "request_host",
  "request_path",
  "api_host",
  "remote_capture_id",
  "app_version",
]);
export const clientDiagnosticNumberFields = new Set([
  "connect_timeout_ms",
  "read_timeout_ms",
  "elapsed_ms",
  "app_version_code",
]);
// Default model for the main extraction call, and the OPENAI_MODEL fallback for any stage that
// doesn't set its own model override. gpt-5.4-mini is ~4x faster than gpt-5-mini at low effort
// (far fewer reasoning tokens) with equal-or-better extraction quality; overridable via the
// OPENAI_MODEL secret. Classification/ranking stages override to a cheaper tier via their own
// OPENAI_*_MODEL secrets.
export const OPENAI_MODEL = Deno.env.get("OPENAI_MODEL") || "gpt-5.4-mini";
export const COLLECTION_AUTO_LINK_CONFIDENCE = Number(
  Deno.env.get("COLLECTION_AUTO_LINK_CONFIDENCE") || "0.82",
);
export const COLLECTION_AUTO_LINK_LIMIT = 2;
// Reasoning effort per LLM stage. The auxiliary classification/ranking calls default to
// "minimal" (they don't need deep reasoning and it's the dominant latency cost on the
// reasoning-heavy rerank + collection-context passes); the main extraction keeps "low".
// Env-overridable per stage so effort can be tuned without a deploy.
export const PREFLIGHT_REASONING_EFFORT =
  Deno.env.get("OPENAI_PREFLIGHT_REASONING_EFFORT") || "minimal";
export const CAPTURE_GATE_REASONING_EFFORT =
  Deno.env.get("OPENAI_CAPTURE_GATE_REASONING_EFFORT") || "minimal";
export const COLLECTION_CONTEXT_REASONING_EFFORT =
  Deno.env.get("OPENAI_COLLECTION_CONTEXT_REASONING_EFFORT") || "minimal";
export const COLLECTION_RERANK_REASONING_EFFORT =
  Deno.env.get("OPENAI_COLLECTION_RERANK_REASONING_EFFORT") || "minimal";
export const ANALYSIS_REASONING_EFFORT =
  Deno.env.get("OPENAI_ANALYSIS_REASONING_EFFORT") || "low";
// AI-suggested new collections. Lean conservative: only materialize a suggestion when
// the model is reasonably confident, and treat a near-duplicate of an existing pending
// suggestion (cosine similarity at/above this threshold) as the same group.
export const COLLECTION_SUGGESTION_MIN_CONFIDENCE = Number(
  Deno.env.get("COLLECTION_SUGGESTION_MIN_CONFIDENCE") || "0.6",
);
export const COLLECTION_SUGGESTION_DEDUP_SIMILARITY = Number(
  Deno.env.get("COLLECTION_SUGGESTION_DEDUP_SIMILARITY") || "0.85",
);
// Topical (subject×content-type) suggestions only surface once this many captures share the
// same theme — a single capture shouldn't mint a reading-pile collection, but a repeated
// pattern should. Intrinsic value themes (recipes, places, products) ignore this and surface
// on the first capture. Frequency gate applies only to basis="topical" decisions.
export const COLLECTION_SUGGESTION_MIN_CAPTURES = Number(
  Deno.env.get("COLLECTION_SUGGESTION_MIN_CAPTURES") || "2",
);
// Title/description limits mirror the manual composer (CollectionComposerSheet.tsx).
// Single source of truth: stated to the model in the prompt and clamped in normalization.
export const COLLECTION_TITLE_MAX_LENGTH = 50;
export const COLLECTION_DESCRIPTION_MAX_LENGTH = 160;
export const USER_AGENT =
  "Mozilla/5.0 (compatible; PreciousCaptures/0.1; +https://sharebook.local)";
export const METADATA_TIMEOUT_MS = 8000;
export const METADATA_MAX_BYTES = 700_000;
export const CACHE_STRONG_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const CACHE_WEAK_TTL_MS = 6 * 60 * 60 * 1000;
export const CACHE_ERROR_TTL_MS = 60 * 60 * 1000;
export const CLIENT_RESOLUTION_MESSAGE =
  "We couldn't access the exact content from this shared link. Open it once so we can categorize it accurately.";
export const INSUFFICIENT_URL_MESSAGE =
  "We couldn't verify enough public information to categorize this exact link.";
export const CONTEXTLESS_LINK_REJECTED_MESSAGE =
  "Could not save this capture. The link did not provide enough context. Add a screenshot or note and try again.";
export const activeSaveIntents = (saveIntents as Array<{
  key: string;
  label: string;
  llm_description: string;
  active: boolean;
}>).filter((intent) => intent.active);
export const activeSaveIntentKeys = activeSaveIntents.map((intent) =>
  intent.key
);
export const activeSaveIntentKeySet = new Set(activeSaveIntentKeys);
export const saveIntentPrompt = activeSaveIntents
  .map((intent) =>
    `- ${intent.key} (${intent.label}): ${intent.llm_description}`
  )
  .join("\n");
export const NO_CLEAR_INTENT_RATIONALE =
  "No clear action intent was inferable from the capture evidence.";
export const dbCaptureTypes = new Set([
  "link",
  "social_post",
  "screenshot",
  "image",
  "text_note",
  "mixed",
  "unknown",
  "voice_note",
]);

export const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type",
  "access-control-allow-methods": "GET, POST, PATCH, OPTIONS",
};

export const analysisSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "display_title",
    "summary",
    "default_intent",
    "entities",
    "location_context",
    "visit_target_name",
    "visit_target_query",
    "visit_target_confidence",
    "visit_target_evidence",
    "verified_place",
    "suggested_reminders",
    "collection_decisions",
    "field_rationales",
    "search_phrases",
    "confidence_label",
    "needs_review",
  ],
  properties: {
    display_title: {
      type: "string",
      description:
        "Concise title for the saved content. Must not be a source app, host/domain, URL, media format, or 'Saved from [source]' label.",
    },
    summary: { type: "string" },
    default_intent: {
      type: "object",
      additionalProperties: false,
      required: ["category", "confidence", "rationale"],
      properties: {
        category: {
          type: "string",
          enum: [...activeSaveIntentKeys],
        },
        confidence: { type: "number" },
        rationale: { type: "string" },
      },
    },
    entities: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "name", "evidence", "confidence"],
        properties: {
          type: { type: "string" },
          name: { type: "string" },
          evidence: { type: "string" },
          confidence: { type: "number" },
        },
      },
    },
    location_context: {
      type: "object",
      additionalProperties: false,
      required: [
        "place_name",
        "address",
        "city",
        "region",
        "country",
        "coordinates",
        "source_destination",
        "is_destination_away_from_user",
        "travel_context_reason",
      ],
      properties: {
        place_name: { type: ["string", "null"] },
        address: { type: ["string", "null"] },
        city: { type: ["string", "null"] },
        region: { type: ["string", "null"] },
        country: { type: ["string", "null"] },
        coordinates: {
          type: ["object", "null"],
          additionalProperties: false,
          required: ["latitude", "longitude"],
          properties: {
            latitude: { type: "number" },
            longitude: { type: "number" },
          },
        },
        source_destination: { type: ["string", "null"] },
        is_destination_away_from_user: { type: ["boolean", "null"] },
        travel_context_reason: { type: "string" },
      },
    },
    visit_target_name: { type: ["string", "null"] },
    visit_target_query: { type: ["string", "null"] },
    visit_target_confidence: {
      type: "string",
      enum: ["high", "medium", "low", "none"],
    },
    visit_target_evidence: { type: "array", items: { type: "string" } },
    verified_place: { type: "boolean" },
    suggested_reminders: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "trigger_type",
          "trigger_value",
          "trigger_text",
          "start_date",
          "end_date",
          "start_time",
          "end_time",
          "trigger_date",
          "date_window_start",
          "date_window_end",
          "date_precision",
          "trigger_time",
          "time_precision",
          "timezone",
          "duration",
          "duration_unit",
          "rationale",
          "confidence",
        ],
        properties: {
          trigger_type: {
            type: "string",
            enum: ["time"],
          },
          trigger_value: { type: "string" },
          trigger_text: { type: ["string", "null"] },
          start_date: { type: ["string", "null"] },
          end_date: { type: ["string", "null"] },
          start_time: { type: ["string", "null"] },
          end_time: { type: ["string", "null"] },
          trigger_date: { type: ["string", "null"] },
          date_window_start: { type: ["string", "null"] },
          date_window_end: { type: ["string", "null"] },
          date_precision: {
            type: "string",
            enum: [
              "exact",
              "day",
              "date_range",
              "week",
              "month_window",
              "month",
              "unknown",
            ],
          },
          trigger_time: { type: ["string", "null"] },
          time_precision: {
            type: "string",
            enum: ["exact", "time_range", "unknown"],
          },
          timezone: { type: ["string", "null"] },
          duration: { type: ["number", "null"] },
          duration_unit: {
            type: ["string", "null"],
            enum: ["minutes", "hours", "days", "weeks", null],
          },
          rationale: { type: "string" },
          confidence: { type: "number" },
        },
      },
    },
    collection_decisions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "type",
          "basis",
          "collection_id",
          "title",
          "description",
          "rationale",
          "confidence",
        ],
        properties: {
          type: { type: "string", enum: ["existing", "new"] },
          basis: {
            type: "string",
            enum: ["intrinsic", "topical"],
            description:
              "For type new only. intrinsic = a durable value/utility theme (recipe, place, product, inspiration) worth suggesting on the first capture. topical = a subject + content-type reading/reference grouping (e.g. Soccer articles) only worth surfacing once several captures share it. For type existing, use intrinsic.",
          },
          collection_id: { type: ["string", "null"] },
          title: {
            type: "string",
            description:
              "For type new, a concise mid-level Collection name future captures could also join, at most 50 characters. For type existing, the exact retrieved Collection title.",
          },
          description: {
            type: ["string", "null"],
            description:
              "For type new, a one-sentence description of what belongs in the Collection, at most 160 characters. Required and non-empty when type is new.",
          },
          rationale: { type: "string" },
          confidence: { type: "number" },
        },
      },
    },
    field_rationales: {
      type: "object",
      additionalProperties: false,
      required: ["purpose", "collections", "reminder"],
      properties: {
        purpose: {
          type: "object",
          additionalProperties: false,
          required: ["selection_key", "selection_label", "text"],
          properties: {
            selection_key: {
              type: "string",
              enum: [...activeSaveIntentKeys],
            },
            selection_label: {
              type: ["string", "null"],
              description:
                "Short header text for the selected Purpose, at most 36 characters.",
            },
            text: {
              type: "string",
              description:
                "At most 12 words in plain human language, written as one complete sentence with no trailing ellipsis or dangling punctuation, phrased like: I chose [Intent label] because [plain evidence]. Never use internal terms such as saved value, durable value, rerank, taxonomy, schema, or field rationale.",
            },
          },
        },
        collections: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["collection_id", "selection_label", "text"],
            properties: {
              collection_id: { type: ["string", "null"] },
              selection_label: {
                type: ["string", "null"],
                description:
                  "Short header text for this Collection selection, or No collection when no Collection was chosen, at most 36 characters.",
              },
              text: {
                type: "string",
                description:
                  "At most 12 words in plain human language, written as one complete sentence with no trailing ellipsis or dangling punctuation, phrased like: I picked [Collection title] because [plain evidence], or No collection because [plain reason it does not clearly fit existing collections]. Never use internal terms such as saved value, durable value, rerank, taxonomy, schema, or field rationale.",
              },
            },
          },
        },
        reminder: {
          type: "object",
          additionalProperties: false,
          required: [
            "trigger_value",
            "start_date",
            "end_date",
            "start_time",
            "end_time",
            "text",
          ],
          properties: {
            trigger_value: {
              type: ["string", "null"],
              description:
                "Short header text for the Later selection, or No Reminder idea when no Reminder was chosen, at most 36 characters.",
            },
            start_date: { type: ["string", "null"] },
            end_date: { type: ["string", "null"] },
            start_time: { type: ["string", "null"] },
            end_time: { type: ["string", "null"] },
            text: {
              type: "string",
              description:
                "At most 12 words in plain human language, written as one complete sentence with no trailing ellipsis or dangling punctuation, phrased like: I suggested [Later value] because [plain evidence], or No Reminder idea because [plain reason no future date or deadline is clear]. Never use internal terms such as saved value, durable value, rerank, taxonomy, schema, or field rationale.",
            },
          },
        },
      },
    },
    search_phrases: { type: "array", items: { type: "string" } },
    confidence_label: {
      type: "string",
      enum: ["Looks right", "Maybe", "Not sure", "Couldn't tell"],
    },
    needs_review: { type: "boolean" },
  },
};

export function analysisSchemaForCollections(
  retrievedCollections: RetrievedCollection[],
) {
  const schema = JSON.parse(JSON.stringify(analysisSchema));
  const collectionIds = Array.from(
    new Set(
      retrievedCollections
        .map((collection) => collection.id)
        .filter(Boolean),
    ),
  );
  const collectionIdSchema = collectionIds.length
    ? { type: ["string", "null"], enum: [...collectionIds, null] }
    : { type: "null", enum: [null] };
  schema.properties.collection_decisions.items.properties.collection_id =
    collectionIdSchema;
  schema.properties.field_rationales.properties.collections.items.properties.collection_id =
    collectionIdSchema;
  return schema;
}

export const preflightSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "decision",
    "rationale_code",
    "confidence",
    "user_message",
    "evidence_summary",
  ],
  properties: {
    decision: { type: "string", enum: ["valid", "invalid"] },
    rationale_code: {
      type: "string",
      enum: [
        "public_metadata_sufficient",
        "url_identifier_sufficient",
        "map_place_parseable",
        "non_url_capture",
        "private_or_login_gated",
        "generic_platform_shell",
        "not_found_or_unreachable",
        "map_unparseable",
        "unsupported_file_or_url",
        "ambiguous_insufficient_evidence",
      ],
    },
    confidence: { type: "number" },
    user_message: { type: "string" },
    evidence_summary: { type: "string" },
  },
};

export const captureGateSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "decision",
    "rationale_code",
    "confidence",
    "user_message",
    "evidence_summary",
  ],
  properties: {
    decision: { type: "string", enum: ["analyze", "needs_review"] },
    rationale_code: {
      type: "string",
      enum: [
        "meaningful_note",
        "useful_image_content",
        "user_intent_context",
        "mixed_capture_context",
        "filename_or_uuid_only",
        "blank_or_unreadable_image",
        "instruction_only_prompt_injection",
        "insufficient_user_context",
      ],
    },
    confidence: { type: "number" },
    user_message: { type: "string" },
    evidence_summary: { type: "string" },
  },
};
