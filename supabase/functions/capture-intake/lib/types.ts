export type CaptureRow = {
  id: string;
  user_id: string;
  capture_type?: string | null;
  title?: string | null;
  display_title?: string | null;
  source_url: string | null;
  original_url?: string | null;
  client_resolved_url?: string | null;
  client_resolution_source?: string | null;
  client_resolution_timestamp?: string | null;
  client_resolution_attempt_count?: number | null;
  source_text: string | null;
  context_note?: string | null;
  source_app: string | null;
  created_at?: string | null;
  asset_url?: string;
  asset_mime_type?: string | null;
  capture_assets?: CaptureAssetRow[];
};

export type CaptureAssetRow = {
  storage_path: string;
  mime_type: string | null;
};

export type CaptureImageVariant = "thumb" | "detail" | "viewer";

export const CAPTURE_ASSET_SELECT =
  "id,user_id,capture_id,storage_path,public_url,mime_type,byte_size,created_at";
export const CAPTURE_LIST_SELECT =
  "id,user_id,client_capture_key,source_url,source_text,source_app,display_title,title,context_note,analysis_state,analysis_error,analysis,analysis_provider,analysis_mode,default_intent,current_save_intent,intent_rationale,thumbnail_url,capture_type,created_at,updated_at,processed_at,archived_at,deleted_at,delete_purge_after,rejected_at," +
  `capture_assets(${CAPTURE_ASSET_SELECT})`;
export const CAPTURE_DETAIL_SELECT = "*,capture_assets(*)";
export const COLLECTION_LIST_SELECT =
  "id,user_id,title,description,status,created_by,archived_at,deleted_at,delete_purge_after,created_at,updated_at";
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

export type CapturePayload = {
  fields: Record<string, string>;
  asset: {
    filename: string;
    contentType: string;
    bytes: ArrayBuffer;
    size: number;
  } | null;
};

export type UrlEvidence = {
  status: "success" | "partial" | "blocked" | "failed" | "empty";
  source: string;
  confidence: number;
  sourceUrl: string;
  finalUrl: string | null;
  canonical: string | null;
  host: string | null;
  provider: string | null;
  siteName: string | null;
  type: string | null;
  title: string | null;
  description: string | null;
  image: string | null;
  video: string | null;
  favicon: string | null;
  authorName: string | null;
  authorUrl: string | null;
  publishedAt: string | null;
  modifiedAt: string | null;
  text: string | null;
  entities: Array<{
    type: string;
    name: string;
    value?: string | null;
  }>;
  raw: Record<string, unknown>;
  error: string | null;
};

export type LlMUrlEvidence = {
  url: string;
  status:
    | "extracted"
    | "partial_evidence"
    | "needs_client_resolution"
    | "insufficient_url_evidence"
    | "failed";
  evidence_quality: "high" | "medium" | "low" | "none";
  final_url: string | null;
  canonical_url: string | null;
  client_resolved_url: string | null;
  source_domain: string | null;
  content_type_guess: string | null;
  platform: string | null;
  title: string | null;
  description: string | null;
  site_name: string | null;
  author: string | null;
  published_at: string | null;
  modified_at: string | null;
  image_url: string | null;
  favicon: string | null;
  media_url: string | null;
  readable_text_excerpt: string | null;
  entities: UrlEvidence["entities"];
  extraction_status: UrlEvidence["status"];
  extraction_confidence: number;
  evidence_sources: string[];
  weakness_reasons: string[];
  item_specific_url_signal: boolean;
  should_web_search: boolean;
  error: string | null;
};

export type ProductUrlEvidenceStatus =
  | "extracted"
  | "partial_evidence"
  | "needs_client_resolution"
  | "insufficient_url_evidence"
  | "failed";
export type EvidenceQuality = "high" | "medium" | "low" | "none";
export type ClientResolutionInput = {
  originalUrl: string | null;
  clientResolvedUrl: string | null;
  clientResolutionSource: string | null;
  clientResolutionTimestamp: string | null;
  clientResolutionAttemptCount: number | null;
};

export type RetrievedCollection = {
  id: string;
  title: string;
  description: string;
  keyword_rank?: number | null;
  semantic_rank?: number | null;
  keyword_score?: number | null;
  semantic_score?: number | null;
  rrf_score?: number | null;
  rerank_rank?: number | null;
  rerank_confidence?: number | null;
  rerank_fit?: "strong" | "possible" | "none" | null;
  rerank_rationale?: string | null;
  rerank_capture_role?: CaptureRole | null;
  rerank_capture_role_confidence?: number | null;
  rerank_capture_role_rationale?: string | null;
};
export type CaptureRole =
  | "shopping"
  | "place_visit"
  | "event_attendance"
  | "trip_planning"
  | "learning_reference"
  | "visual_inspiration"
  | "project_execution"
  | "media_watch_or_listen"
  | "other";
export type ContentEvidenceProfile = {
  content_limited: boolean;
  source_fallback_allowed: boolean;
  content_signals: string[];
  limited_reasons: string[];
};

export type AnalysisOutput = Record<string, any>;
export type PreflightDecision = {
  decision: "valid" | "invalid";
  rationale_code:
    | "public_metadata_sufficient"
    | "url_identifier_sufficient"
    | "map_place_parseable"
    | "non_url_capture"
    | "private_or_login_gated"
    | "generic_platform_shell"
    | "not_found_or_unreachable"
    | "map_unparseable"
    | "unsupported_file_or_url"
    | "ambiguous_insufficient_evidence";
  confidence: number;
  user_message: string;
  evidence_summary: string;
};

export type DomainEvidenceProfile = {
  genericTitlePatterns: RegExp[];
  genericDescriptionPatterns: RegExp[];
  shellTextPatterns: RegExp[];
  invalidCanonicalPatterns?: RegExp[];
  preferredSourcePattern?: RegExp;
};

export type CaptureGateDecision = {
  decision: "analyze" | "needs_review";
  rationale_code:
    | "meaningful_note"
    | "useful_image_content"
    | "user_intent_context"
    | "mixed_capture_context"
    | "filename_or_uuid_only"
    | "blank_or_unreadable_image"
    | "instruction_only_prompt_injection"
    | "insufficient_user_context";
  confidence: number;
  user_message: string;
  evidence_summary: string;
};
