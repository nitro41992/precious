import { absoluteUrl, hostFromUrl, stringValue } from "../../common.ts";
import type { UrlEvidence } from "../../types.ts";
import { fetchTextLimited } from "../safe-fetch.ts";
import { dedupeEntities } from "../maps.ts";
import { emptyUrlEvidence, withPipelineRaw } from "../quality.ts";

export function redditPostIdFromUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, "");
    if (host !== "reddit.com" && !host.endsWith(".reddit.com")) return null;
    const match = url.pathname.match(/(?:^|\/)comments\/([a-z0-9]+)(?:\/|$)/i);
    return match?.[1] || null;
  } catch {
    return null;
  }
}

export function redditJsonEndpoint(value: string | null | undefined) {
  const postId = redditPostIdFromUrl(value);
  return postId ? `https://www.reddit.com/comments/${postId}.json` : null;
}

export function numberEntity(type: string, value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue)
    ? { type, name: String(numberValue), value: String(numberValue) }
    : null;
}

export function redditJsonMetadata(
  data: unknown,
  sourceUrl: string,
  finalUrl: string | null,
): UrlEvidence | null {
  if (!Array.isArray(data)) return null;
  const post = data[0]?.data?.children?.[0]?.data;
  if (!post || typeof post !== "object") return null;
  const title = stringValue(post.title);
  if (!title) return null;
  const permalink =
    absoluteUrl(stringValue(post.permalink), "https://www.reddit.com") ||
    finalUrl || sourceUrl;
  const subreddit = stringValue(post.subreddit_name_prefixed) ||
    (stringValue(post.subreddit) ? `r/${post.subreddit}` : null);
  const author = stringValue(post.author);
  const selftext = stringValue(post.selftext);
  const externalUrl = stringValue(post.url_overridden_by_dest) ||
    stringValue(post.url);
  const image = absoluteUrl(stringValue(post.thumbnail), permalink) ||
    absoluteUrl(stringValue(post.preview?.images?.[0]?.source?.url), permalink);
  const entities = [
    subreddit ? { type: "community", name: subreddit } : null,
    author ? { type: "author", name: `u/${author}` } : null,
    numberEntity("score", post.ups),
    numberEntity("comments", post.num_comments),
  ].filter(Boolean) as UrlEvidence["entities"];
  const description = [
    selftext,
    externalUrl && externalUrl !== permalink
      ? `Linked URL: ${externalUrl}`
      : null,
  ].filter(Boolean).join("\n").slice(0, 1200) || null;
  const text = [
    title,
    selftext,
    subreddit ? `Community: ${subreddit}` : null,
    author ? `Author: u/${author}` : null,
    Number.isFinite(Number(post.num_comments))
      ? `Comments: ${post.num_comments}`
      : null,
    Number.isFinite(Number(post.ups)) ? `Score: ${post.ups}` : null,
  ].filter(Boolean).join("\n").slice(0, 2400) || null;
  return {
    ...emptyUrlEvidence(sourceUrl, "success", "reddit_json"),
    confidence: selftext ? 0.92 : 0.86,
    finalUrl,
    canonical: permalink,
    host: hostFromUrl(permalink),
    provider: "reddit",
    siteName: "Reddit",
    type: "social_post",
    title: title.slice(0, 300),
    description,
    image,
    authorName: author ? `u/${author}` : null,
    authorUrl: author ? `https://www.reddit.com/user/${author}/` : null,
    publishedAt: Number.isFinite(Number(post.created_utc))
      ? new Date(Number(post.created_utc) * 1000).toISOString()
      : null,
    text,
    entities: dedupeEntities(entities),
    raw: {
      subreddit,
      post_id: stringValue(post.id),
      name: stringValue(post.name),
      permalink,
      ups: Number.isFinite(Number(post.ups)) ? Number(post.ups) : null,
      num_comments: Number.isFinite(Number(post.num_comments))
        ? Number(post.num_comments)
        : null,
      upvote_ratio: Number.isFinite(Number(post.upvote_ratio))
        ? Number(post.upvote_ratio)
        : null,
      over_18: Boolean(post.over_18),
      external_url: externalUrl || null,
    },
  };
}

export async function fetchRedditJsonEvidence(
  sourceUrl: string,
  finalUrl: string | null,
) {
  const endpoint = redditJsonEndpoint(finalUrl) ||
    redditJsonEndpoint(sourceUrl);
  if (!endpoint) return null;
  const { text } = await fetchTextLimited(endpoint, {
    accept: "application/json",
    htmlOnly: false,
    maxBytes: 180_000,
  });
  return redditJsonMetadata(JSON.parse(text), sourceUrl, finalUrl);
}

export async function extractAdapterEvidenceForUrl(
  sourceUrl: string,
  targetUrl: string,
  phase: string,
) {
  const redditJson = await fetchRedditJsonEvidence(sourceUrl, targetUrl).catch(
    () => null,
  );
  return redditJson
    ? withPipelineRaw(redditJson, { phase, target_url: targetUrl })
    : null;
}
