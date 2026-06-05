import { METADATA_TIMEOUT_MS, USER_AGENT } from "./config.ts";
import { errorMessage, normalizeUrl, sha256Hex } from "./common.ts";
import { adminClient } from "./supabase.ts";
import { ensureCaptureBucket } from "./capture-records.ts";
import { assertFetchableUrl, concatChunks } from "./url-evidence/safe-fetch.ts";
import type { CaptureRow, UrlEvidence } from "./types.ts";

export const SOURCE_PREVIEW_MAX_BYTES = 2 * 1024 * 1024;
export const SOURCE_PREVIEW_ROLE = "source_preview";

type SourcePreviewImage = {
  bytes: Uint8Array;
  contentType: string;
  extension: string;
  finalUrl: string;
};

export type SourcePreviewMirrorResult =
  | { status: "mirrored"; storagePath: string; sourceUrl: string }
  | { status: "existing"; storagePath: string; sourceUrl: string }
  | { status: "skipped"; reason: string };

export function sourcePreviewContentType(value: string | null | undefined) {
  return String(value || "").split(";")[0].trim().toLowerCase();
}

export function sourcePreviewExtension(contentType: string) {
  if (contentType === "image/jpeg" || contentType === "image/jpg") {
    return "jpg";
  }
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  if (contentType === "image/gif") return "gif";
  return "";
}

export function gifLooksAnimated(bytes: Uint8Array) {
  let frames = 0;
  for (let index = 0; index < bytes.length - 2; index += 1) {
    if (
      bytes[index] === 0x21 &&
      bytes[index + 1] === 0xf9 &&
      bytes[index + 2] === 0x04
    ) {
      frames += 1;
      if (frames > 1) return true;
    }
  }
  return false;
}

export async function fetchSourcePreviewImage(
  sourceUrl: string,
  options: { maxBytes?: number; timeoutMs?: number } = {},
): Promise<SourcePreviewImage> {
  let current = normalizeUrl(sourceUrl);
  if (!current) throw new Error("Invalid source preview URL");
  if (!current.startsWith("https://")) {
    throw new Error("Source preview URL must use HTTPS");
  }

  const maxBytes = options.maxBytes || SOURCE_PREVIEW_MAX_BYTES;
  for (let redirect = 0; redirect <= 4; redirect += 1) {
    await assertFetchableUrl(current);
    if (!current.startsWith("https://")) {
      throw new Error("Source preview redirects must stay HTTPS");
    }
    const response: Response = await fetch(current, {
      redirect: "manual",
      headers: {
        accept: "image/jpeg,image/png,image/webp,image/gif",
        "user-agent": USER_AGENT,
      },
      signal: AbortSignal.timeout(options.timeoutMs || METADATA_TIMEOUT_MS),
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location: string | null = response.headers.get("location");
      if (!location) throw new Error("Source preview redirect without location");
      current = new URL(location, current).toString();
      continue;
    }
    if (!response.ok) {
      throw new Error(`Source preview fetch failed with ${response.status}`);
    }

    const contentType = sourcePreviewContentType(
      response.headers.get("content-type"),
    );
    const extension = sourcePreviewExtension(contentType);
    if (!extension) {
      throw new Error(
        `Unsupported source preview content-type: ${contentType || "unknown"}`,
      );
    }
    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      throw new Error("Source preview image is too large");
    }

    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader) {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value) continue;
        size += value.byteLength;
        if (size > maxBytes) {
          await reader.cancel();
          throw new Error("Source preview image is too large");
        }
        chunks.push(value);
      }
    } else {
      const bytes = new Uint8Array(await response.arrayBuffer());
      size = bytes.byteLength;
      if (size > maxBytes) throw new Error("Source preview image is too large");
      chunks.push(bytes);
    }
    const bytes = concatChunks(chunks);
    if (contentType === "image/gif" && gifLooksAnimated(bytes)) {
      throw new Error("Animated GIF source previews are not mirrored");
    }
    return { bytes, contentType, extension, finalUrl: current };
  }
  throw new Error("Too many source preview redirects");
}

export async function mirrorSourcePreviewAsset(
  supabase: ReturnType<typeof adminClient>,
  userId: string,
  capture: Pick<CaptureRow, "id" | "source_url">,
  urlEvidence: UrlEvidence | null,
): Promise<SourcePreviewMirrorResult> {
  const imageUrl = normalizeUrl(urlEvidence?.image || null);
  if (!imageUrl) return { status: "skipped", reason: "missing_image_url" };
  if (!imageUrl.startsWith("https://")) {
    return { status: "skipped", reason: "non_https_image_url" };
  }

  const existing = await supabase
    .from("capture_assets")
    .select("id,storage_path,source_url")
    .eq("user_id", userId)
    .eq("capture_id", capture.id)
    .eq("asset_role", SOURCE_PREVIEW_ROLE)
    .maybeSingle();
  if (existing.error && existing.error.code !== "PGRST116") {
    throw existing.error;
  }
  const existingRow = existing.data as Record<string, unknown> | null;
  const existingStoragePath = String(existingRow?.storage_path || "");
  const existingSourceUrl = normalizeUrl(String(existingRow?.source_url || ""));
  if (existingStoragePath && existingSourceUrl === imageUrl) {
    return {
      status: "existing",
      storagePath: existingStoragePath,
      sourceUrl: imageUrl,
    };
  }

  const image = await fetchSourcePreviewImage(imageUrl);
  await ensureCaptureBucket(supabase);
  const hash = (await sha256Hex(imageUrl)).slice(0, 24);
  const storagePath =
    `${userId}/${capture.id}/source-preview-${hash}.${image.extension}`;
  const upload = await supabase.storage.from("captures").upload(
    storagePath,
    image.bytes,
    {
      contentType: image.contentType,
      cacheControl: "31536000",
      upsert: true,
    },
  );
  if (upload.error) throw upload.error;

  const row = {
    user_id: userId,
    capture_id: capture.id,
    storage_path: storagePath,
    public_url: null,
    mime_type: image.contentType,
    byte_size: image.bytes.byteLength,
    asset_role: SOURCE_PREVIEW_ROLE,
    source_url: imageUrl,
  };
  if (existingRow?.id) {
    const update = await supabase
      .from("capture_assets")
      .update(row)
      .eq("id", String(existingRow.id))
      .eq("user_id", userId);
    if (update.error) throw update.error;
    if (existingStoragePath && existingStoragePath !== storagePath) {
      await supabase.storage.from("captures").remove([existingStoragePath])
        .catch(() => {});
    }
  } else {
    const insert = await supabase.from("capture_assets").insert(row);
    if (insert.error) throw insert.error;
  }

  return { status: "mirrored", storagePath, sourceUrl: imageUrl };
}

export async function mirrorSourcePreviewAssetQuietly(
  supabase: ReturnType<typeof adminClient>,
  userId: string,
  capture: Pick<CaptureRow, "id" | "source_url">,
  urlEvidence: UrlEvidence | null,
) {
  try {
    return await mirrorSourcePreviewAsset(
      supabase,
      userId,
      capture,
      urlEvidence,
    );
  } catch (error) {
    console.warn(
      "Source preview mirror failed",
      JSON.stringify({
        capture_id: capture.id,
        source_url: capture.source_url,
        reason: errorMessage(error),
      }),
    );
    return { status: "skipped", reason: errorMessage(error) } as const;
  }
}
