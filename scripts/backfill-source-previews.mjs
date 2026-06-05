import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import net from "node:net";
import { createClient } from "@supabase/supabase-js";
import { loadEnvFiles } from "./load-env-files.mjs";

loadEnvFiles();

const args = new Set(process.argv.slice(2));
const valueArg = (name, fallback) => {
  const prefix = `${name}=`;
  const inline = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
};

const dryRun = args.has("--dry-run");
const yes = args.has("--yes") || dryRun;
const limit = Math.max(1, Math.min(Number(valueArg("--limit", "50")) || 50, 500));
const maxBytes = 2 * 1024 * 1024;

if (!yes) {
  console.error("Pass --dry-run or --yes to backfill source previews.");
  process.exit(1);
}

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing EXPO_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

function isPrivateAddress(value) {
  const host = String(value || "").toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "0.0.0.0" ||
    host === "127.0.0.1" ||
    host === "::" ||
    host === "::1" ||
    host.startsWith("fc") ||
    host.startsWith("fd") ||
    host.startsWith("fe80:")
  ) return true;
  const parts = host.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return false;
  }
  return (
    parts[0] === 10 ||
    parts[0] === 127 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    parts[0] === 0
  );
}

async function assertPublicHttps(value) {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("URL must use HTTPS");
  if (url.username || url.password) throw new Error("Credentialed URLs are not supported");
  if (
    url.hostname === "localhost" ||
    url.hostname.endsWith(".localhost") ||
    url.hostname.endsWith(".local") ||
    isPrivateAddress(url.hostname)
  ) {
    throw new Error("Private URLs are not supported");
  }
  if (!net.isIP(url.hostname)) {
    const records = await lookup(url.hostname, { all: true }).catch(() => []);
    if (records.some((record) => isPrivateAddress(record.address))) {
      throw new Error("Private URLs are not supported");
    }
  }
}

function extensionFor(contentType) {
  const normalized = String(contentType || "").split(";")[0].trim().toLowerCase();
  if (normalized === "image/jpeg" || normalized === "image/jpg") return "jpg";
  if (normalized === "image/png") return "png";
  if (normalized === "image/webp") return "webp";
  if (normalized === "image/gif") return "gif";
  return "";
}

function gifLooksAnimated(bytes) {
  let frames = 0;
  for (let index = 0; index < bytes.length - 2; index += 1) {
    if (bytes[index] === 0x21 && bytes[index + 1] === 0xf9 && bytes[index + 2] === 0x04) {
      frames += 1;
      if (frames > 1) return true;
    }
  }
  return false;
}

async function fetchPreview(sourceUrl) {
  let current = new URL(sourceUrl).toString();
  for (let redirect = 0; redirect <= 4; redirect += 1) {
    await assertPublicHttps(current);
    const response = await fetch(current, {
      redirect: "manual",
      headers: {
        accept: "image/jpeg,image/png,image/webp,image/gif",
        "user-agent": "Mozilla/5.0 (compatible; PreciousCaptures/0.1; +https://sharebook.local)",
      },
      signal: AbortSignal.timeout(8000),
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Redirect without location");
      current = new URL(location, current).toString();
      continue;
    }
    if (!response.ok) throw new Error(`Fetch failed with ${response.status}`);
    const extension = extensionFor(response.headers.get("content-type"));
    if (!extension) throw new Error("Unsupported content type");
    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      throw new Error("Image is too large");
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength > maxBytes) throw new Error("Image is too large");
    if (extension === "gif" && gifLooksAnimated(bytes)) {
      throw new Error("Animated GIFs are not mirrored");
    }
    return {
      bytes,
      contentType: String(response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase(),
      extension,
      finalUrl: current,
    };
  }
  throw new Error("Too many redirects");
}

const { data, error } = await supabase
  .from("captures")
  .select("id,user_id,source_url,analysis,capture_assets(id,asset_role,storage_path,source_url)")
  .is("deleted_at", null)
  .is("archived_at", null)
  .is("rejected_at", null)
  .order("created_at", { ascending: false })
  .limit(limit);

if (error) throw error;

const counts = { mirrored: 0, existing: 0, skipped: 0, failed: 0 };
for (const capture of data ?? []) {
  const previewUrl = capture.analysis?.url_evidence?.image_url;
  const existing = (capture.capture_assets || []).find((asset) => asset.asset_role === "source_preview");
  if (!previewUrl) {
    counts.skipped += 1;
    continue;
  }
  if (existing?.source_url === previewUrl && existing?.storage_path) {
    counts.existing += 1;
    continue;
  }
  try {
    if (dryRun) {
      counts.mirrored += 1;
      continue;
    }
    const image = await fetchPreview(previewUrl);
    const hash = createHash("sha256").update(previewUrl).digest("hex").slice(0, 24);
    const storagePath = `${capture.user_id}/${capture.id}/source-preview-${hash}.${image.extension}`;
    const upload = await supabase.storage.from("captures").upload(storagePath, image.bytes, {
      contentType: image.contentType,
      cacheControl: "31536000",
      upsert: true,
    });
    if (upload.error) throw upload.error;
    const row = {
      user_id: capture.user_id,
      capture_id: capture.id,
      storage_path: storagePath,
      public_url: null,
      mime_type: image.contentType,
      byte_size: image.bytes.byteLength,
      asset_role: "source_preview",
      source_url: previewUrl,
    };
    if (existing?.id) {
      const update = await supabase
        .from("capture_assets")
        .update(row)
        .eq("id", existing.id)
        .eq("user_id", capture.user_id);
      if (update.error) throw update.error;
      if (existing.storage_path && existing.storage_path !== storagePath) {
        await supabase.storage.from("captures").remove([existing.storage_path]);
      }
    } else {
      const insert = await supabase.from("capture_assets").insert(row);
      if (insert.error) throw insert.error;
    }
    counts.mirrored += 1;
  } catch (backfillError) {
    counts.failed += 1;
    console.warn(`Failed ${capture.id}: ${backfillError.message || backfillError}`);
  }
}

console.log(JSON.stringify({ dry_run: dryRun, limit, ...counts }, null, 2));
