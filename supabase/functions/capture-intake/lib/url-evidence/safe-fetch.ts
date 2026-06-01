import {
  METADATA_MAX_BYTES,
  METADATA_TIMEOUT_MS,
  USER_AGENT,
} from "../config.ts";
import { normalizeUrl } from "../common.ts";

export function isPrivateHostname(hostname: string) {
  const host = hostname.toLowerCase();
  if (
    host === "localhost" || host.endsWith(".localhost") ||
    host.endsWith(".local")
  ) return true;
  return isPrivateAddress(host);
}

export function isPrivateAddress(value: string) {
  const host = value.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "0.0.0.0" ||
    host === "127.0.0.1" ||
    host === "::" ||
    host === "::1" ||
    host.startsWith("fc") ||
    host.startsWith("fd") ||
    host.startsWith("fe80:")
  ) {
    return true;
  }
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4) return false;
  const parts = ipv4.slice(1).map(Number);
  if (parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true;
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

export async function assertFetchableUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http/https URLs are supported");
  }
  if (url.username || url.password) {
    throw new Error("Credentialed URLs are not supported");
  }
  if (isPrivateHostname(url.hostname)) {
    throw new Error("Private URLs are not supported");
  }
  if (
    !/^\[?[0-9a-f:.]+\]?$/i.test(url.hostname) &&
    typeof Deno.resolveDns === "function"
  ) {
    const records = await Promise.all([
      Deno.resolveDns(url.hostname, "A").catch(() => [] as string[]),
      Deno.resolveDns(url.hostname, "AAAA").catch(() => [] as string[]),
    ]);
    if (records.flat().some((address) => isPrivateAddress(address))) {
      throw new Error("Private URLs are not supported");
    }
  }
}

export function concatChunks(chunks: Uint8Array[]) {
  const length = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

export async function fetchTextLimited(sourceUrl: string, options: {
  accept?: string;
  htmlOnly?: boolean;
  maxBytes?: number;
  timeoutMs?: number;
} = {}) {
  let current = normalizeUrl(sourceUrl);
  if (!current) throw new Error("Invalid URL");
  for (let redirect = 0; redirect <= 4; redirect += 1) {
    await assertFetchableUrl(current);
    const response: Response = await fetch(current, {
      redirect: "manual",
      headers: {
        accept: options.accept ||
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "user-agent": USER_AGENT,
      },
      signal: AbortSignal.timeout(options.timeoutMs || METADATA_TIMEOUT_MS),
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location: string | null = response.headers.get("location");
      if (!location) throw new Error("Redirect without location");
      current = new URL(location, current).toString();
      continue;
    }
    if (!response.ok) {
      throw new Error(`Metadata fetch failed with ${response.status}`);
    }
    const contentType = response.headers.get("content-type") || "";
    if (
      options.htmlOnly !== false &&
      !/text\/html|application\/xhtml\+xml/i.test(contentType)
    ) {
      throw new Error(
        `Unsupported metadata content-type: ${contentType || "unknown"}`,
      );
    }
    const reader = response.body?.getReader();
    if (!reader) {
      return { text: await response.text(), finalUrl: current, contentType };
    }
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;
      size += value.byteLength;
      if (size > (options.maxBytes || METADATA_MAX_BYTES)) {
        await reader.cancel();
        break;
      }
      chunks.push(value);
    }
    return {
      text: new TextDecoder().decode(concatChunks(chunks)),
      finalUrl: current,
      contentType,
    };
  }
  throw new Error("Too many redirects");
}

export async function resolveUrlLimited(sourceUrl: string) {
  let current = normalizeUrl(sourceUrl);
  if (!current) throw new Error("Invalid URL");
  for (let redirect = 0; redirect <= 6; redirect += 1) {
    await assertFetchableUrl(current);
    const response: Response = await fetch(current, {
      redirect: "manual",
      headers: {
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "user-agent": USER_AGENT,
      },
      signal: AbortSignal.timeout(METADATA_TIMEOUT_MS),
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location: string | null = response.headers.get("location");
      if (!location) throw new Error("Redirect without location");
      current = new URL(location, current).toString();
      continue;
    }
    return {
      finalUrl: current,
      status: response.status,
      contentType: response.headers.get("content-type") || "",
    };
  }
  throw new Error("Too many redirects");
}
