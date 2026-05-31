declare const EdgeRuntime: {
  waitUntil: (promise: Promise<unknown>) => void;
};

export function errorMessage(error: unknown, fallback = "Unexpected error") {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const value = error as Record<string, unknown>;
    return String(
      value.message || value.details || value.hint || value.code || fallback,
    );
  }
  return fallback;
}

export function env(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(value);
}

export function truncateText(value: unknown, limit: number) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

export function jsonObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export function boundedLimit(
  value: string | null,
  fallback: number,
  max: number,
) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(1, Math.min(Math.floor(numeric), max));
}

export function hostFromUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function normalizeUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

export function normalizedHost(value: URL | string | null | undefined) {
  try {
    const url = typeof value === "string" ? new URL(value) : value;
    return url?.hostname.replace(/^www\./, "").toLowerCase() || null;
  } catch {
    return null;
  }
}

export function cleanedString(value: unknown, limit = 2000) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, limit)
    : null;
}

export async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function absoluteUrl(
  value: string | null | undefined,
  baseUrl: string | null | undefined,
) {
  if (!value) return null;
  try {
    return new URL(value, baseUrl || undefined).toString();
  } catch {
    return null;
  }
}

export function decodeHtml(value: string | null | undefined) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function finiteNumber(value: unknown, fallback = 0) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

export function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function compactText(
  parts: Array<string | null | undefined>,
  maxLength = 3500,
) {
  return parts
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join("\n")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function runInBackground(task: Promise<unknown>) {
  const guarded = task.catch((error) => {
    console.warn("Background task failed", errorMessage(error));
  });
  if (
    typeof EdgeRuntime !== "undefined" &&
    typeof EdgeRuntime.waitUntil === "function"
  ) {
    EdgeRuntime.waitUntil(guarded);
    return;
  }
  void guarded;
}
