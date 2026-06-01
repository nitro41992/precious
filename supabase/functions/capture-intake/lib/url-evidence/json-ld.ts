import { absoluteUrl, decodeHtml, stringValue } from "../common.ts";
import type { UrlEvidence } from "../types.ts";

function parseAttrs(value: string) {
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

export function jsonLdCandidates(html: string): Array<Record<string, unknown>> {
  const candidates: Array<Record<string, unknown>> = [];
  const add = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(add);
      return;
    }
    const record = value as Record<string, unknown>;
    if (Array.isArray(record["@graph"])) record["@graph"].forEach(add);
    candidates.push(record);
  };
  for (
    const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)
  ) {
    const attrs = parseAttrs(match[1]);
    if (!String(attrs.type || "").toLowerCase().includes("ld+json")) continue;
    try {
      add(JSON.parse(match[2].trim()));
    } catch {
      // Ignore malformed JSON-LD.
    }
  }
  return candidates.slice(0, 12);
}

export function firstJsonLdValue(
  value: unknown,
  keys: string[],
): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const result = firstJsonLdValue(item, keys);
      if (result) return result;
    }
    return null;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of keys) {
      const result = firstJsonLdValue(record[key], keys);
      if (result) return result;
    }
  }
  return null;
}

export function imageFromJsonLd(value: unknown, baseUrl: string) {
  const image = firstJsonLdValue(value, ["url", "contentUrl", "image"]);
  return absoluteUrl(image, baseUrl);
}

export function jsonLdType(value: Record<string, unknown> | null) {
  if (!value) return null;
  const type = value["@type"];
  if (Array.isArray(type)) return type.map(String).join(", ");
  return stringValue(type);
}

export function jsonLdEntities(candidates: Array<Record<string, unknown>>) {
  const entities: UrlEvidence["entities"] = [];
  for (const item of candidates) {
    const type = jsonLdType(item);
    const name = stringValue(item.name) || stringValue(item.headline);
    if (type && name) entities.push({ type, name });
    const brand = firstJsonLdValue(item.brand, ["name"]);
    if (brand) entities.push({ type: "brand", name: brand });
    const offers = item.offers;
    if (offers && typeof offers === "object") {
      const offer = Array.isArray(offers) ? offers[0] : offers;
      const record = offer as Record<string, unknown>;
      const price = [record.priceCurrency, record.price].filter(Boolean).join(
        " ",
      );
      if (price.trim()) {
        entities.push({
          type: "price",
          name: price.trim(),
          value: price.trim(),
        });
      }
    }
    const location = firstJsonLdValue(item.location, ["name", "address"]);
    if (location) entities.push({ type: "place", name: location });
    const startDate = stringValue(item.startDate);
    if (startDate) {
      entities.push({ type: "date", name: startDate, value: startDate });
    }
  }
  const seen = new Set<string>();
  return entities.filter((entity) => {
    const key = `${entity.type}:${entity.name}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 12);
}
