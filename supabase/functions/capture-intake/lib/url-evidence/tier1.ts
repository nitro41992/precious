import { normalizedHost, normalizeUrl } from "../common.ts";
import { uniqueUrls } from "./quality.ts";

export const TRACKING_PARAMS = [
  "fbclid",
  "gclid",
  "dclid",
  "gbraid",
  "wbraid",
  "igsh",
  "igshid",
  "mc_cid",
  "mc_eid",
  "mibextid",
  "msclkid",
  "ref",
  "ref_",
  "ref_src",
  "si",
  "spm",
  "src",
  "tag",
  "utm",
  "utm_campaign",
  "utm_content",
  "utm_medium",
  "utm_source",
  "utm_term",
];

export function trackingCleanUrl(value: string | null | undefined) {
  const normalized = normalizeUrl(value);
  if (!normalized) return null;
  try {
    const url = new URL(normalized);
    for (const key of Array.from(url.searchParams.keys())) {
      const lower = key.toLowerCase();
      if (
        lower.startsWith("utm_") ||
        TRACKING_PARAMS.includes(lower) ||
        lower.startsWith("amp_")
      ) {
        url.searchParams.delete(key);
      }
    }
    return url.toString();
  } catch {
    return normalized;
  }
}

export function pathSegment(value: string | undefined) {
  return value ? decodeURIComponent(value).trim() : "";
}

export function youtubeVideoIdFromUrl(url: URL) {
  const host = normalizedHost(url);
  const segments = url.pathname.split("/").filter(Boolean);
  if (host === "youtu.be") return pathSegment(segments[0]);
  if (
    host === "youtube.com" || host === "m.youtube.com" ||
    host === "music.youtube.com"
  ) {
    if (url.searchParams.get("v")) return url.searchParams.get("v")?.trim();
    if (["shorts", "embed", "live"].includes(segments[0])) {
      return pathSegment(segments[1]);
    }
  }
  return null;
}

export function youtubeCanonicalCandidate(url: URL) {
  const videoId = youtubeVideoIdFromUrl(url);
  if (videoId && /^[a-zA-Z0-9_-]{6,}$/.test(videoId)) {
    return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  }
  const listId = url.searchParams.get("list")?.trim();
  if (listId && /^[a-zA-Z0-9_-]{6,}$/.test(listId)) {
    return `https://www.youtube.com/playlist?list=${
      encodeURIComponent(listId)
    }`;
  }
  return null;
}

export function tiktokCanonicalCandidate(url: URL) {
  const host = normalizedHost(url);
  if (host !== "tiktok.com" && !host?.endsWith(".tiktok.com")) return null;
  const segments = url.pathname.split("/").filter(Boolean);
  const videoIndex = segments.findIndex((segment) => segment === "video");
  const videoId = videoIndex >= 0 ? pathSegment(segments[videoIndex + 1]) : "";
  const handle = segments.find((segment) => segment.startsWith("@"));
  if (
    handle && /^@[a-zA-Z0-9._-]+$/.test(handle) && /^[0-9]{8,}$/.test(videoId)
  ) {
    return `https://www.tiktok.com/@${
      encodeURIComponent(handle.slice(1))
    }/video/${encodeURIComponent(videoId)}`;
  }
  return trackingCleanUrl(url.toString());
}

export function instagramCanonicalCandidate(url: URL) {
  const host = normalizedHost(url);
  if (host !== "instagram.com" && !host?.endsWith(".instagram.com")) {
    return null;
  }
  const segments = url.pathname.split("/").filter(Boolean);
  const kind = segments[0];
  const code = pathSegment(segments[1]);
  if (["p", "reel", "tv"].includes(kind) && /^[a-zA-Z0-9_-]{5,}$/.test(code)) {
    return `https://www.instagram.com/${kind}/${encodeURIComponent(code)}/`;
  }
  return trackingCleanUrl(url.toString());
}

export function threadsCanonicalCandidate(url: URL) {
  const host = normalizedHost(url);
  if (host !== "threads.net" && !host?.endsWith(".threads.net")) return null;
  const segments = url.pathname.split("/").filter(Boolean);
  const postIndex = segments.findIndex((segment) => segment === "post");
  const handle = segments.find((segment) => segment.startsWith("@"));
  const code = postIndex >= 0 ? pathSegment(segments[postIndex + 1]) : "";
  if (
    handle && /^@[a-zA-Z0-9._-]+$/.test(handle) &&
    /^[a-zA-Z0-9_-]{5,}$/.test(code)
  ) {
    return `https://www.threads.net/@${
      encodeURIComponent(handle.slice(1))
    }/post/${encodeURIComponent(code)}`;
  }
  return trackingCleanUrl(url.toString());
}

export function facebookCanonicalCandidate(url: URL) {
  const host = normalizedHost(url);
  if (
    host !== "facebook.com" && host !== "fb.watch" && host !== "fb.com" &&
    !host?.endsWith(".facebook.com")
  ) return null;
  return trackingCleanUrl(url.toString());
}

export function redditCanonicalCandidate(url: URL) {
  const host = normalizedHost(url);
  if (host !== "reddit.com" && !host?.endsWith(".reddit.com")) return null;
  const segments = url.pathname.split("/").filter(Boolean).map(pathSegment);
  const commentsIndex = segments.findIndex((segment) => segment === "comments");
  if (commentsIndex >= 0 && segments[commentsIndex + 1]) {
    const postId = segments[commentsIndex + 1];
    const subredditIndex = commentsIndex >= 2 && segments[commentsIndex - 2] ===
        "r"
      ? commentsIndex - 1
      : -1;
    const subreddit = subredditIndex >= 0 ? segments[subredditIndex] : "";
    const slug = segments[commentsIndex + 2];
    if (subreddit) {
      return `https://www.reddit.com/r/${
        encodeURIComponent(subreddit)
      }/comments/${encodeURIComponent(postId)}/${
        slug ? `${encodeURIComponent(slug)}/` : ""
      }`;
    }
    return `https://www.reddit.com/comments/${encodeURIComponent(postId)}/`;
  }
  return trackingCleanUrl(url.toString())?.replace(
    /^https:\/\/(?:old|new|m)\.reddit\.com/i,
    "https://www.reddit.com",
  ) || null;
}

export function xCanonicalCandidate(url: URL) {
  const host = normalizedHost(url);
  if (
    host !== "x.com" && host !== "twitter.com" && host !== "mobile.twitter.com"
  ) {
    return null;
  }
  const segments = url.pathname.split("/").filter(Boolean).map(pathSegment);
  const statusIndex = segments.findIndex((segment) =>
    ["status", "statuses"].includes(segment)
  );
  const id = statusIndex >= 0 ? segments[statusIndex + 1] : "";
  if (/^[0-9]{6,}$/.test(id)) {
    const user = statusIndex > 0 && !["i", "intent"].includes(segments[0])
      ? segments[0]
      : "i";
    return user === "i"
      ? `https://x.com/i/web/status/${encodeURIComponent(id)}`
      : `https://x.com/${encodeURIComponent(user)}/status/${
        encodeURIComponent(id)
      }`;
  }
  return trackingCleanUrl(url.toString())?.replace(
    /^https:\/\/(?:mobile\.)?twitter\.com/i,
    "https://x.com",
  ) || null;
}

export function vimeoCanonicalCandidate(url: URL) {
  const host = normalizedHost(url);
  if (host !== "vimeo.com" && host !== "player.vimeo.com") return null;
  const segments = url.pathname.split("/").filter(Boolean);
  const videoIndex = segments.findIndex((segment) => segment === "video");
  const videoId = host === "player.vimeo.com"
    ? pathSegment(segments[videoIndex + 1])
    : pathSegment(segments.find((segment) => /^[0-9]+$/.test(segment)));
  if (/^[0-9]{5,}$/.test(videoId)) {
    return `https://vimeo.com/${encodeURIComponent(videoId)}`;
  }
  return trackingCleanUrl(url.toString());
}

export function spotifyCanonicalCandidate(url: URL) {
  const host = normalizedHost(url);
  if (host !== "open.spotify.com") return null;
  const segments = url.pathname.split("/").filter(Boolean).map(pathSegment);
  const offset = /^intl-[a-z]{2,}$/i.test(segments[0]) ? 1 : 0;
  const kind = segments[offset];
  const id = segments[offset + 1];
  if (
    ["track", "album", "artist", "playlist", "episode", "show"].includes(
      kind,
    ) &&
    /^[a-zA-Z0-9]{8,}$/.test(id)
  ) {
    return `https://open.spotify.com/${kind}/${encodeURIComponent(id)}`;
  }
  return trackingCleanUrl(url.toString());
}

export function soundCloudCanonicalCandidate(url: URL) {
  const host = normalizedHost(url);
  if (host !== "soundcloud.com" && !host?.endsWith(".soundcloud.com")) {
    return null;
  }
  return trackingCleanUrl(url.toString());
}

export function pinterestCanonicalCandidate(url: URL) {
  const host = normalizedHost(url);
  if (host !== "pinterest.com" && !host?.endsWith(".pinterest.com")) {
    return null;
  }
  const segments = url.pathname.split("/").filter(Boolean).map(pathSegment);
  const pinIndex = segments.findIndex((segment) => segment === "pin");
  const pinId = pinIndex >= 0 ? segments[pinIndex + 1] : "";
  if (/^[0-9]{6,}$/.test(pinId)) {
    return `https://www.pinterest.com/pin/${encodeURIComponent(pinId)}/`;
  }
  return trackingCleanUrl(url.toString());
}

export function amazonCanonicalCandidate(url: URL) {
  const host = normalizedHost(url);
  if (!host || !/(^|\.)amazon\./i.test(host)) return null;
  const asinMatch = decodeURIComponent(url.pathname).match(
    /\/(?:dp|gp\/product|product)\/([A-Z0-9]{10})(?:[/?]|$)/i,
  );
  const asin = asinMatch?.[1]?.toUpperCase();
  if (!asin) return trackingCleanUrl(url.toString());
  const regionalHost = host.replace(/^smile\./, "").replace(/^www\./, "");
  return `https://www.${regionalHost}/dp/${encodeURIComponent(asin)}`;
}

export function appleMusicCanonicalCandidate(url: URL) {
  const host = normalizedHost(url);
  if (host !== "music.apple.com") return null;
  const cleaned = new URL(url.toString());
  const trackId = cleaned.searchParams.get("i");
  for (const key of Array.from(cleaned.searchParams.keys())) {
    if (key !== "i") cleaned.searchParams.delete(key);
  }
  if (trackId) cleaned.searchParams.set("i", trackId);
  cleaned.hash = "";
  return cleaned.toString();
}

export function tier1CanonicalCandidates(value: string | null | undefined) {
  const normalized = normalizeUrl(value);
  if (!normalized) return [];
  const candidates: Array<string | null> = [trackingCleanUrl(normalized)];
  try {
    const url = new URL(normalized);
    const host = normalizedHost(url);
    if (
      host === "youtu.be" || host === "youtube.com" ||
      host?.endsWith(".youtube.com")
    ) {
      candidates.push(youtubeCanonicalCandidate(url));
    } else if (host === "tiktok.com" || host?.endsWith(".tiktok.com")) {
      candidates.push(tiktokCanonicalCandidate(url));
    } else if (host === "instagram.com" || host?.endsWith(".instagram.com")) {
      candidates.push(instagramCanonicalCandidate(url));
    } else if (host === "threads.net" || host?.endsWith(".threads.net")) {
      candidates.push(threadsCanonicalCandidate(url));
    } else if (
      host === "facebook.com" || host === "fb.watch" || host === "fb.com" ||
      host?.endsWith(".facebook.com")
    ) {
      candidates.push(facebookCanonicalCandidate(url));
    } else if (host === "reddit.com" || host?.endsWith(".reddit.com")) {
      candidates.push(redditCanonicalCandidate(url));
    } else if (
      host === "x.com" || host === "twitter.com" ||
      host === "mobile.twitter.com"
    ) {
      candidates.push(xCanonicalCandidate(url));
    } else if (host === "vimeo.com" || host === "player.vimeo.com") {
      candidates.push(vimeoCanonicalCandidate(url));
    } else if (host === "open.spotify.com") {
      candidates.push(spotifyCanonicalCandidate(url));
    } else if (host === "soundcloud.com" || host?.endsWith(".soundcloud.com")) {
      candidates.push(soundCloudCanonicalCandidate(url));
    } else if (
      host === "pinterest.com" || host?.endsWith(".pinterest.com")
    ) {
      candidates.push(pinterestCanonicalCandidate(url));
    } else if (/(^|\.)amazon\./i.test(host || "")) {
      candidates.push(amazonCanonicalCandidate(url));
    } else if (host === "music.apple.com") {
      candidates.push(appleMusicCanonicalCandidate(url));
    }
  } catch {
    // Ignore malformed candidates; the original URL remains in the pipeline.
  }
  return uniqueUrls(candidates).filter((candidate) => candidate !== normalized);
}
