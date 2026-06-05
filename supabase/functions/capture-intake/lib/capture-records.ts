import { adminClient } from "./supabase.ts";
import type { CaptureImageVariant, CapturePayload } from "./types.ts";
import { dbCaptureTypes } from "./config.ts";
import { hostFromUrl } from "./common.ts";

export function extractUrl(value: string | null | undefined) {
  return value?.match(/https?:\/\/\S+/i)?.[0] ?? null;
}

export function titleFallback(
  sourceText: string | null,
  sourceUrl: string | null,
) {
  if (sourceUrl) {
    try {
      return new URL(sourceUrl).hostname.replace(/^www\./, "");
    } catch {
      return sourceUrl;
    }
  }
  return sourceText?.trim().split(/\n/)[0]?.slice(0, 80) || "Untitled capture";
}

export function safeFilename(value: string) {
  return String(value || "shared-file")
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 120) || "shared-file";
}

export function normalizeCaptureType(
  value: unknown,
  sourceUrl: string | null,
  sourceText: string | null,
) {
  const captureType = typeof value === "string" ? value.trim() : "";
  if (dbCaptureTypes.has(captureType)) return captureType;
  if (sourceUrl) return "link";
  if (sourceText?.trim()) return "text_note";
  return "unknown";
}

export function inferCaptureType(
  sourceUrl: string | null,
  sourceText: string | null,
) {
  let inferred = "unknown";
  if (sourceUrl) {
    if (
      /\.(aac|aif|aiff|flac|m4a|mp3|oga|opus|wav)(?:[?#].*)?$/i.test(sourceUrl)
    ) inferred = "voice_note";
    else if (
      /instagram\.com|tiktok\.com|reddit\.com|youtube\.com|youtu\.be|x\.com|twitter\.com/i
        .test(sourceUrl)
    ) {
      inferred = "social_post";
    } else {
      inferred = "link";
    }
  } else if (sourceText) {
    inferred = "text_note";
  }
  return normalizeCaptureType(inferred, sourceUrl, sourceText);
}

export function inferSourceApp(sourceUrl: string | null) {
  if (!sourceUrl) return null;
  if (/instagram\.com/i.test(sourceUrl)) return "Instagram";
  if (/tiktok\.com/i.test(sourceUrl)) return "TikTok";
  if (/reddit\.com/i.test(sourceUrl)) return "Reddit";
  if (/youtube\.com|youtu\.be/i.test(sourceUrl)) return "YouTube";
  if (
    /maps\.app\.goo\.gl|google\.[^/]+\/maps|maps\.google\./i.test(sourceUrl)
  ) return "Maps";
  if (/x\.com|twitter\.com/i.test(sourceUrl)) return "X";
  return hostFromUrl(sourceUrl) || "Browser";
}

export function captureState(row: any) {
  const analysis = row?.analysis && typeof row.analysis === "object"
    ? row.analysis
    : {};
  if (
    row?.deleted_at ||
    analysis.deleted_at ||
    analysis.capture_state === "deleted"
  ) {
    return "deleted";
  }
  if (row?.archived_at || analysis.capture_state === "archived") {
    return "deleted";
  }
  return "active";
}

export function withCaptureState(row: any) {
  return row ? { ...row, capture_state: captureState(row) } : row;
}

export function withCaptureStates(rows: any[]) {
  return Array.isArray(rows) ? rows.map(withCaptureState) : [];
}

export const CAPTURE_ASSET_SIGNED_URL_TTL_SECONDS = 60 * 60;

export const CAPTURE_IMAGE_TRANSFORMS: Record<
  CaptureImageVariant,
  { width: number; height: number; resize: "cover" | "contain"; quality: number }
> = {
  thumb: { width: 320, height: 320, resize: "cover", quality: 82 },
  detail: { width: 1280, height: 744, resize: "cover", quality: 82 },
  viewer: { width: 2048, height: 2048, resize: "contain", quality: 88 },
};

export async function signedCaptureAssetUrl(
  supabase: ReturnType<typeof adminClient>,
  storagePath: string,
  variant: CaptureImageVariant,
) {
  const bucket = supabase.storage.from("captures");
  const transformed = await bucket.createSignedUrl(
    storagePath,
    CAPTURE_ASSET_SIGNED_URL_TTL_SECONDS,
    { transform: CAPTURE_IMAGE_TRANSFORMS[variant] },
  );
  if (transformed.data?.signedUrl) return transformed.data.signedUrl;
  const fallback = await bucket.createSignedUrl(
    storagePath,
    CAPTURE_ASSET_SIGNED_URL_TTL_SECONDS,
  );
  return fallback.data?.signedUrl || null;
}

export async function withSignedCaptureAssets(
  supabase: ReturnType<typeof adminClient>,
  userId: string,
  row: Record<string, unknown> | null | undefined,
  variant: CaptureImageVariant = "thumb",
) {
  if (!row) return row;
  const assets = Array.isArray(row.capture_assets) ? row.capture_assets : [];
  if (!assets.length) return row;
  const signedAssets = await Promise.all(
    assets.map(async (asset) => {
      if (!asset || typeof asset !== "object") return asset;
      const record = asset as Record<string, unknown>;
      const storagePath = typeof record.storage_path === "string"
        ? record.storage_path
        : "";
      const mimeType = typeof record.mime_type === "string"
        ? record.mime_type
        : "";
      if (
        !storagePath ||
        !mimeType.startsWith("image/") ||
        (record.user_id && String(record.user_id) !== userId)
      ) {
        return record;
      }
      const signedUrl = await signedCaptureAssetUrl(
        supabase,
        storagePath,
        variant,
      );
      const signedFullUrl = variant === "detail"
        ? await signedCaptureAssetUrl(supabase, storagePath, "viewer")
        : null;
      return {
        ...record,
        signed_url: signedUrl,
        signed_url_variant: variant,
        signed_url_expires_in: CAPTURE_ASSET_SIGNED_URL_TTL_SECONDS,
        signed_url_cache_key: `${storagePath}:${variant}`,
        signed_full_url: signedFullUrl,
        signed_full_url_cache_key: signedFullUrl ? `${storagePath}:viewer` : null,
      };
    }),
  );
  return { ...row, capture_assets: signedAssets };
}

export async function withSignedCaptureAssetRows(
  supabase: ReturnType<typeof adminClient>,
  userId: string,
  rows: Array<Record<string, unknown>>,
  variant: CaptureImageVariant = "thumb",
) {
  return await Promise.all(
    rows.map((row) => withSignedCaptureAssets(supabase, userId, row, variant)),
  );
}

export function archivedFilter(row: any, archived: boolean) {
  return archived
    ? false
    : captureState(row) === "active";
}

export function mergeAnalysisPatch(row: any, patch: Record<string, unknown>) {
  const current = row?.analysis && typeof row.analysis === "object"
    ? row.analysis
    : {};
  return { ...current, ...patch };
}

export async function readCapturePayload(
  request: Request,
): Promise<CapturePayload> {
  const contentType = request.headers.get("content-type") || "";
  if (!/multipart\/form-data/i.test(contentType)) {
    return { fields: await request.json().catch(() => ({})), asset: null };
  }

  const form = await request.formData();
  const fields: Record<string, string> = {};
  let asset: CapturePayload["asset"] = null;
  for (const [key, value] of form.entries()) {
    if (value instanceof File) {
      if (key === "asset" && value.size > 0 && !asset) {
        asset = {
          filename: value.name || "shared-file",
          contentType: value.type || "application/octet-stream",
          bytes: await value.arrayBuffer(),
          size: value.size,
        };
      }
    } else {
      fields[key] = value;
    }
  }
  return { fields, asset };
}

export function capturePayloadExpectsAsset(fields: Record<string, unknown>) {
  return booleanField(fields.assetExpected) || booleanField(fields.expectedAsset);
}

function booleanField(value: unknown) {
  if (value === true) return true;
  if (typeof value !== "string") return false;
  return /^(true|1|yes)$/i.test(value.trim());
}

export async function ensureCaptureBucket(
  supabase: ReturnType<typeof adminClient>,
) {
  const { error } = await supabase.storage.getBucket("captures");
  if (!error) return;
  await supabase.storage.createBucket("captures", { public: false }).catch(
    () => {},
  );
}
