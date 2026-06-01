import { extract as extractProviderOembed } from "@extractus/oembed-extractor";
import { METADATA_TIMEOUT_MS, USER_AGENT } from "../config.ts";
import {
  absoluteUrl,
  decodeHtml,
  hostFromUrl,
  normalizedHost,
  stringValue,
} from "../common.ts";
import type { UrlEvidence } from "../types.ts";
import { fetchTextLimited } from "./safe-fetch.ts";
import { dedupeEntities } from "./maps.ts";
import { emptyUrlEvidence, withPipelineRaw } from "./quality.ts";

export function oembedEndpoint(value: string) {
  try {
    const url = new URL(value);
    const host = normalizedHost(url);
    if (
      host === "youtube.com" || host === "m.youtube.com" ||
      host === "youtu.be" || host === "music.youtube.com"
    ) {
      return `https://www.youtube.com/oembed?format=json&url=${
        encodeURIComponent(value)
      }`;
    }
    if (host === "reddit.com" || host?.endsWith(".reddit.com")) {
      return `https://www.reddit.com/oembed?format=json&url=${
        encodeURIComponent(value)
      }`;
    }
    if (host === "tiktok.com" || host?.endsWith(".tiktok.com")) {
      return `https://www.tiktok.com/oembed?url=${encodeURIComponent(value)}`;
    }
    if (
      host === "x.com" || host === "twitter.com" ||
      host === "mobile.twitter.com"
    ) {
      return `https://publish.x.com/oembed?omit_script=true&url=${
        encodeURIComponent(value)
      }`;
    }
    if (host === "vimeo.com" || host === "player.vimeo.com") {
      return `https://vimeo.com/api/oembed.json?url=${
        encodeURIComponent(value)
      }`;
    }
    if (host === "open.spotify.com" || host === "spotify.link") {
      return `https://open.spotify.com/oembed?url=${encodeURIComponent(value)}`;
    }
    if (host === "soundcloud.com" || host?.endsWith(".soundcloud.com")) {
      return `https://soundcloud.com/oembed?format=json&url=${
        encodeURIComponent(value)
      }`;
    }
  } catch {
    return null;
  }
  return null;
}

function stripHtmlForText(html: string) {
  return decodeHtml(
    html
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<svg\b[\s\S]*?<\/svg>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  ).slice(0, 2400);
}

export function metaOembedEndpoint(value: string) {
  const token = Deno.env.get("META_OEMBED_ACCESS_TOKEN") ||
    Deno.env.get("INSTAGRAM_OEMBED_ACCESS_TOKEN");
  if (!token) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, "");
    if (host === "instagram.com" || host.endsWith(".instagram.com")) {
      return `https://graph.facebook.com/v23.0/instagram_oembed?url=${
        encodeURIComponent(value)
      }&access_token=${encodeURIComponent(token)}`;
    }
    if (host === "facebook.com" || host.endsWith(".facebook.com")) {
      return `https://graph.facebook.com/v23.0/oembed_post?url=${
        encodeURIComponent(value)
      }&access_token=${encodeURIComponent(token)}`;
    }
  } catch {
    return null;
  }
  return null;
}

export function oembedMetadata(
  data: Record<string, unknown>,
  sourceUrl: string,
): UrlEvidence | null {
  const provider = stringValue(data.provider_name) || "oembed";
  const authorName = stringValue(data.author_name);
  const htmlText = stripHtmlForText(stringValue(data.html) || "");
  const title = stringValue(data.title) ||
    (htmlText ? htmlText.slice(0, 180) : null) ||
    (authorName ? `${provider} by ${authorName}` : null);
  const description = stringValue(data.description)?.slice(0, 1200) ||
    (htmlText && htmlText !== title ? htmlText.slice(0, 1200) : null);
  const image = absoluteUrl(stringValue(data.thumbnail_url), sourceUrl);
  if (!title && !description && !image) return null;
  const text = [
    title,
    description && description !== title ? description : null,
    authorName ? `Author: ${authorName}` : null,
    provider,
  ].filter(Boolean).join("\n").slice(0, 2400) || null;
  const entities = [
    authorName ? { type: "author", name: authorName } : null,
  ].filter(Boolean) as UrlEvidence["entities"];
  return {
    ...emptyUrlEvidence(sourceUrl, "success", "oembed"),
    confidence: 0.9,
    provider,
    siteName: stringValue(data.provider_name),
    type: stringValue(data.type),
    title: title ? title.slice(0, 300) : null,
    description,
    image,
    authorName,
    authorUrl: stringValue(data.author_url),
    text,
    entities: dedupeEntities(entities),
    raw: {
      provider_name: data.provider_name || null,
      provider_url: data.provider_url || null,
      type: data.type || null,
      version: data.version || null,
      thumbnail_url: data.thumbnail_url || null,
      html_text: htmlText ? htmlText.slice(0, 1200) : null,
    },
  };
}

export async function fetchOembedEvidence(
  sourceUrl: string,
  endpoint: string | null,
) {
  if (!endpoint) return null;
  const { text } = await fetchTextLimited(endpoint, {
    accept: "application/json",
    htmlOnly: false,
    maxBytes: 80_000,
  });
  return oembedMetadata(JSON.parse(text), sourceUrl);
}

export async function fetchExtractusOembedEvidence(
  sourceUrl: string,
  targetUrl: string,
) {
  const data = await extractProviderOembed(
    targetUrl,
    {},
    {
      headers: { "user-agent": USER_AGENT },
      signal: AbortSignal.timeout(METADATA_TIMEOUT_MS),
    },
  );
  if (!data || typeof data !== "object") return null;
  const evidence = oembedMetadata(
    data as unknown as Record<string, unknown>,
    sourceUrl,
  );
  return evidence
    ? {
      ...evidence,
      raw: {
        ...evidence.raw,
        extractor: "@extractus/oembed-extractor",
      },
    }
    : null;
}

export async function extractOembedEvidenceForUrl(
  sourceUrl: string,
  targetUrl: string,
  phase: string,
) {
  const extracted = await fetchExtractusOembedEvidence(sourceUrl, targetUrl)
    .catch(() => null);
  if (extracted) {
    const source = `${phase}_extractus_oembed`;
    return withPipelineRaw(
      {
        ...extracted,
        source,
        finalUrl: targetUrl,
        canonical: targetUrl || extracted.canonical,
        host: hostFromUrl(targetUrl),
      },
      { phase: source, target_url: targetUrl },
    );
  }

  const endpoint = oembedEndpoint(targetUrl) || metaOembedEndpoint(targetUrl);
  const evidence = await fetchOembedEvidence(sourceUrl, endpoint).catch(() =>
    null
  );
  if (!evidence) return null;
  const source = `${phase}_known_oembed`;
  return withPipelineRaw(
    {
      ...evidence,
      source,
      finalUrl: targetUrl,
      canonical: targetUrl || evidence.canonical,
      host: hostFromUrl(targetUrl),
    },
    { phase: source, target_url: targetUrl },
  );
}
