import { extract as extractOpenLink, parse as parseOpenLink } from "openlink";
import {
  absoluteUrl,
  decodeHtml,
  errorMessage,
  hostFromUrl,
  stringValue,
} from "../common.ts";
import type { UrlEvidence } from "../types.ts";
import { fetchTextLimited } from "./safe-fetch.ts";
import { fetchOembedEvidence } from "./oembed.ts";
import { emptyUrlEvidence, withPipelineRaw } from "./quality.ts";
import {
  firstJsonLdValue,
  imageFromJsonLd,
  jsonLdCandidates,
  jsonLdEntities,
  jsonLdType,
} from "./json-ld.ts";

export function parseAttrs(value: string) {
  const attrs: Record<string, string> = {};
  for (
    const match of value.matchAll(
      /([a-zA-Z_:.-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g,
    )
  ) {
    attrs[match[1].toLowerCase()] = decodeHtml(
      match[3] ?? match[4] ?? match[5] ?? "",
    );
  }
  return attrs;
}

export function firstMeta(html: string, keys: string[]) {
  const wanted = new Set(keys.map((key) => key.toLowerCase()));
  for (const match of html.matchAll(/<meta\b([^>]+)>/gi)) {
    const attrs = parseAttrs(match[1]);
    const name = String(attrs.property || attrs.name || attrs.itemprop || "")
      .toLowerCase();
    if (wanted.has(name) && attrs.content) return attrs.content;
  }
  return null;
}

export function allMeta(html: string, keys: string[]) {
  const wanted = new Set(keys.map((key) => key.toLowerCase()));
  const values: string[] = [];
  for (const match of html.matchAll(/<meta\b([^>]+)>/gi)) {
    const attrs = parseAttrs(match[1]);
    const name = String(attrs.property || attrs.name || attrs.itemprop || "")
      .toLowerCase();
    if (wanted.has(name) && attrs.content) values.push(attrs.content);
  }
  return values;
}

export function firstLink(
  html: string,
  rels: string[],
  baseUrl: string,
  typePredicate?: (type: string) => boolean,
) {
  const wanted = rels.map((rel) => rel.toLowerCase());
  for (const match of html.matchAll(/<link\b([^>]+)>/gi)) {
    const attrs = parseAttrs(match[1]);
    const rel = String(attrs.rel || "").toLowerCase();
    if (
      !attrs.href || !wanted.some((item) => rel.split(/\s+/).includes(item))
    ) continue;
    if (
      typePredicate && !typePredicate(String(attrs.type || "").toLowerCase())
    ) continue;
    return absoluteUrl(attrs.href, baseUrl);
  }
  return null;
}

export function firstTitle(html: string) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return decodeHtml(match?.[1] || "");
}

export function stripHtmlForText(html: string) {
  return decodeHtml(
    html
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<svg\b[\s\S]*?<\/svg>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  ).slice(0, 2400);
}

export function openLinkMetadata(html: string, finalUrl: string) {
  try {
    const parsed = parseOpenLink(html);
    const preview = extractOpenLink(parsed, finalUrl);
    return { parsed, preview };
  } catch (error) {
    console.warn(
      "openlink_parse_failed",
      JSON.stringify({ final_url: finalUrl, error: errorMessage(error) }),
    );
    return null;
  }
}

export function parseHtmlEvidence(
  html: string,
  sourceUrl: string,
  finalUrl: string,
): UrlEvidence | null {
  const openLink = openLinkMetadata(html, finalUrl);
  const openLinkPreview = openLink?.preview;
  const jsonLd = jsonLdCandidates(html);
  const primaryJsonLd =
    jsonLd.find((item) =>
      item && (item.name || item.headline || item.description)
    ) || null;
  const canonical = absoluteUrl(stringValue(openLinkPreview?.url), finalUrl) ||
    firstLink(html, ["canonical"], finalUrl) || finalUrl;
  const title = stringValue(openLinkPreview?.title) ||
    firstMeta(html, ["og:title", "twitter:title"]) ||
    stringValue(primaryJsonLd?.headline) ||
    stringValue(primaryJsonLd?.name) ||
    firstTitle(html);
  const description = stringValue(openLinkPreview?.description) ||
    firstMeta(html, ["og:description", "twitter:description", "description"]) ||
    stringValue(primaryJsonLd?.description);
  const image = absoluteUrl(
    stringValue(openLinkPreview?.image),
    finalUrl,
  ) ||
    absoluteUrl(
      firstMeta(html, [
        "og:image",
        "og:image:url",
        "twitter:image",
        "twitter:image:src",
      ]),
      finalUrl,
    ) ||
    imageFromJsonLd(primaryJsonLd?.image, finalUrl);
  const video = absoluteUrl(
    stringValue(openLinkPreview?.video),
    finalUrl,
  ) ||
    absoluteUrl(
      firstMeta(html, [
        "og:video",
        "og:video:url",
        "og:video:secure_url",
        "twitter:player",
      ]),
      finalUrl,
    ) ||
    null;
  const siteName = stringValue(openLinkPreview?.siteName) ||
    firstMeta(html, ["og:site_name", "application-name"]) ||
    hostFromUrl(finalUrl);
  const authorName = stringValue(openLinkPreview?.author) ||
    firstMeta(html, ["article:author", "author", "twitter:creator"]) ||
    firstJsonLdValue(primaryJsonLd?.author || primaryJsonLd?.creator, [
      "name",
      "author",
      "creator",
    ]);
  const favicon =
    absoluteUrl(stringValue(openLinkPreview?.favicon), finalUrl) ||
    firstLink(html, ["icon"], finalUrl) ||
    firstLink(html, ["shortcut", "apple-touch-icon"], finalUrl) ||
    absoluteUrl("/favicon.ico", finalUrl);
  const text = stripHtmlForText(html);
  const entities = jsonLdEntities(jsonLd);
  if (!title && !description && !image && !video && !text && !entities.length) {
    return null;
  }
  const openLinkHasMetadata = Boolean(
    openLinkPreview?.title || openLinkPreview?.description ||
      openLinkPreview?.image || openLinkPreview?.video ||
      openLinkPreview?.favicon,
  );
  return {
    status: "success",
    source: openLinkHasMetadata
      ? "openlink_html"
      : title || description
      ? "open_graph"
      : "html_metadata",
    confidence: title || description ? 0.75 : 0.45,
    sourceUrl,
    finalUrl,
    canonical,
    host: hostFromUrl(finalUrl),
    provider: siteName || hostFromUrl(finalUrl),
    siteName,
    type: firstMeta(html, ["og:type"]) || jsonLdType(primaryJsonLd),
    title: title ? String(title).slice(0, 300) : null,
    description: description ? String(description).slice(0, 1200) : null,
    image,
    video,
    favicon,
    authorName: authorName ? String(authorName).slice(0, 240) : null,
    authorUrl: null,
    publishedAt: stringValue(openLinkPreview?.publishedTime) ||
      firstMeta(html, ["article:published_time", "date", "datePublished"]) ||
      stringValue(primaryJsonLd?.datePublished),
    modifiedAt: firstMeta(html, ["article:modified_time", "dateModified"]) ||
      stringValue(primaryJsonLd?.dateModified),
    text: text || null,
    entities,
    raw: {
      openlink: openLinkPreview
        ? {
          url: stringValue(openLinkPreview.url),
          title: stringValue(openLinkPreview.title),
          description: stringValue(openLinkPreview.description),
          image: stringValue(openLinkPreview.image),
          favicon: stringValue(openLinkPreview.favicon),
          site_name: stringValue(openLinkPreview.siteName),
          type: stringValue(openLinkPreview.type),
          content_type: stringValue(openLinkPreview.contentType),
        }
        : null,
      metaImages: allMeta(html, ["og:image", "twitter:image"]).slice(0, 4),
      jsonLd: jsonLd.slice(0, 4).map((item) => ({
        type: jsonLdType(item),
        name: stringValue(item.name),
        headline: stringValue(item.headline),
        datePublished: stringValue(item.datePublished),
        dateModified: stringValue(item.dateModified),
      })),
    },
    error: null,
  };
}

export async function extractHtmlEvidenceForUrl(
  sourceUrl: string,
  targetUrl: string,
  phase: string,
) {
  const { text: html, finalUrl, contentType } = await fetchTextLimited(
    targetUrl,
  );
  const discoveredOembed = firstLink(
    html,
    ["alternate"],
    finalUrl,
    (type) => type.includes("json+oembed") || type.includes("xml+oembed"),
  );
  const discovered = await fetchOembedEvidence(sourceUrl, discoveredOembed)
    .catch(() => null);
  if (discovered) {
    return withPipelineRaw(
      {
        ...discovered,
        source: `${phase}_discovered_oembed`,
        finalUrl,
        canonical: discovered.canonical || finalUrl,
      },
      {
        phase,
        target_url: targetUrl,
        final_url: finalUrl,
        content_type: contentType,
      },
    );
  }

  const parsed = parseHtmlEvidence(html, sourceUrl, finalUrl);
  if (parsed) {
    return withPipelineRaw(parsed, {
      phase,
      target_url: targetUrl,
      final_url: finalUrl,
      content_type: contentType,
    });
  }
  return withPipelineRaw(
    {
      ...emptyUrlEvidence(
        sourceUrl,
        "empty",
        phase,
        "No preview metadata found",
      ),
      finalUrl,
      raw: { contentType },
    },
    {
      phase,
      target_url: targetUrl,
      final_url: finalUrl,
      content_type: contentType,
    },
  );
}
