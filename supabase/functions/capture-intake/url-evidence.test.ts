import {
  assert,
  assertEqual,
  assertIncludes,
  captureFixture,
  corpus,
  evidenceFor,
  gateFixture,
  imageAssetFixture,
  urlEvidence,
} from "./url-evidence.test-support.ts";

async function assertRejects(
  fn: () => Promise<unknown>,
  message: string,
) {
  try {
    await fn();
  } catch {
    return;
  }
  throw new Error(message);
}

function fakePreviewSupabase(existingAsset: Record<string, unknown> | null = null) {
  const state = {
    assets: existingAsset ? [{ ...existingAsset }] : [] as Array<Record<string, unknown>>,
    uploads: [] as Array<Record<string, unknown>>,
    removes: [] as string[],
  };
  const captureAssetTable = {
    select() {
      return {
        filters: {} as Record<string, unknown>,
        eq(key: string, value: unknown) {
          this.filters[key] = value;
          return this;
        },
        maybeSingle() {
          const row = state.assets.find((asset) =>
            Object.entries(this.filters).every(([key, value]) =>
              asset[key] === value
            )
          );
          return Promise.resolve({ data: row || null, error: null });
        },
      };
    },
    insert(row: Record<string, unknown>) {
      state.assets.push({ id: `asset-${state.assets.length + 1}`, ...row });
      return Promise.resolve({ error: null });
    },
    update(row: Record<string, unknown>) {
      return {
        filters: {} as Record<string, unknown>,
        eq(key: string, value: unknown) {
          this.filters[key] = value;
          return this;
        },
        then(resolve: (value: { error: null }) => void) {
          const existing = state.assets.find((asset) =>
            Object.entries(this.filters).every(([key, value]) =>
              asset[key] === value
            )
          );
          if (existing) Object.assign(existing, row);
          resolve({ error: null });
        },
      };
    },
  };
  return {
    state,
    from(table: string) {
      if (table !== "capture_assets") throw new Error(`Unexpected table ${table}`);
      return captureAssetTable;
    },
    storage: {
      getBucket() {
        return Promise.resolve({ error: null });
      },
      from(bucket: string) {
        if (bucket !== "captures") throw new Error(`Unexpected bucket ${bucket}`);
        return {
          upload(path: string, bytes: ArrayBuffer, options: Record<string, unknown>) {
            state.uploads.push({ path, byteLength: bytes.byteLength, options });
            return Promise.resolve({ error: null });
          },
          remove(paths: string[]) {
            state.removes.push(...paths);
            return Promise.resolve({ error: null });
          },
        };
      },
    },
  };
}

Deno.test("URL evidence corpus normalizes into product evidence", () => {
  for (const entry of corpus) {
    const evidence = evidenceFor(entry);
    assert(evidence, `${entry.name} did not produce evidence`);
    const normalized = urlEvidence.normalizedUrlEvidence(evidence);

    assertEqual(evidence.title, entry.expected.title, `${entry.name} title`);
    if (entry.expected.canonical) {
      assertEqual(
        evidence.canonical,
        entry.expected.canonical,
        `${entry.name} canonical`,
      );
    }
    if (entry.expected.image) {
      assertEqual(evidence.image, entry.expected.image, `${entry.name} image`);
    }
    if (entry.expected.provider) {
      assertEqual(
        evidence.provider,
        entry.expected.provider,
        `${entry.name} provider`,
      );
    }
    if (entry.expected.type) {
      assertEqual(evidence.type, entry.expected.type, `${entry.name} type`);
    }
    assertEqual(
      normalized.status,
      entry.expected.status,
      `${entry.name} product status`,
    );
    assertEqual(
      normalized.evidence_quality,
      entry.expected.quality,
      `${entry.name} quality`,
    );
  }
});

Deno.test("URL evidence corpus keeps structured extraction details searchable", () => {
  const article = corpus.find((entry) =>
    entry.name === "article-open-graph-jsonld"
  );
  assert(article, "article fixture missing");
  const articleEvidence = evidenceFor(article);
  assert(articleEvidence, "article fixture did not produce evidence");
  assertEqual(
    articleEvidence.source,
    "openlink_html",
    "article fixture should use OpenLink as the HTML metadata parser",
  );

  const product = corpus.find((entry) =>
    entry.name === "product-jsonld"
  );
  assert(product, "product fixture missing");
  const evidence = evidenceFor(product);
  assert(evidence, "product fixture did not produce evidence");

  const expectedTypes = product.expected.entityTypes as string[];
  for (const type of expectedTypes) {
    assert(
      evidence.entities.some((entity) => entity.type === type),
      `missing entity type ${type}`,
    );
  }

  const compact = urlEvidence.compactUrlEvidence(evidence);
  assert(compact, "compact evidence missing");
  assert(
    compact.evidence_sources.includes("jsonld"),
    "compact evidence should include jsonld source",
  );
  assert(
    compact.entities.some((entity) => entity.type === "price"),
    "compact evidence should include price entity",
  );
});

Deno.test("best URL evidence prefers rich oEmbed over generic shell metadata", () => {
  const oembedEntry = corpus.find((entry) =>
    entry.name === "oembed-video"
  );
  assert(oembedEntry, "oEmbed fixture missing");
  const rich = evidenceFor(oembedEntry);
  assert(rich, "oEmbed fixture did not produce evidence");

  const generic = urlEvidence.parseHtmlEvidence(
    "<html><head><title>YouTube</title></head><body>Enable JavaScript to continue.</body></html>",
    oembedEntry.sourceUrl,
    oembedEntry.sourceUrl,
  );
  assert(generic, "generic fixture did not produce evidence");

  const best = urlEvidence.bestEvidence([generic, rich]);
  assert(best, "best evidence missing");
  assertEqual(best.title, "Street food tour in Osaka", "best evidence title");
  assertEqual(
    urlEvidence.productEvidenceStatus(best),
    "extracted",
    "best evidence product status",
  );
  assert(
    !urlEvidence.weaknessReasons(best).includes("generic_platform_metadata"),
    "best evidence should not be generic platform metadata",
  );
});

Deno.test("Exa contents response normalizes into first-class URL evidence", () => {
  const sourceUrl = "https://example.com/menu.pdf";
  const [evidence] = urlEvidence.normalizeExaContentsEvidence(sourceUrl, [
    sourceUrl,
  ], {
    requestId: "exa-request-1",
    results: [
      {
        id: sourceUrl,
        url: sourceUrl,
        title: "Ohlala Restaurant Week Menu",
        author: "Ohlala French Bistro",
        publishedDate: "2026-05-15T00:00:00.000Z",
        image: "https://example.com/menu.png",
        favicon: "https://example.com/favicon.ico",
        summary:
          "Restaurant Week menu with lunch and dinner pricing for June 2026.",
        highlights: [
          "Lunch prix fixe menu is available during Restaurant Week.",
          "Dinner reservations run from June 1 through June 14.",
        ],
        text:
          "Ohlala French Bistro Restaurant Week 2026 menu. Lunch $35. Dinner $55.",
      },
    ],
    statuses: [{ id: sourceUrl, status: "success" }],
  });

  assert(evidence, "Exa evidence missing");
  assertEqual(evidence.source, "exa_contents", "Exa source");
  assertEqual(evidence.title, "Ohlala Restaurant Week Menu", "Exa title");
  assertEqual(evidence.provider, "example.com", "Exa provider");
  assertIncludes(
    urlEvidence.evidenceSources(evidence),
    "exa_contents",
    "Exa should be an evidence source",
  );
  assertIncludes(
    urlEvidence.evidenceSources(evidence),
    "readable_text",
    "Exa text should count as readable text",
  );
  assertEqual(
    urlEvidence.productEvidenceStatus(evidence),
    "extracted",
    "Exa evidence should be extracted",
  );
  const compact = urlEvidence.compactUrlEvidence(evidence);
  assert(compact, "compact Exa evidence missing");
  assert(
    Boolean(compact.readable_text_excerpt?.includes("Dinner reservations")),
    "compact Exa evidence should include highlights",
  );
});

Deno.test("Exa per-URL failure records failed evidence without throwing", () => {
  const sourceUrl = "https://example.com/broken";
  const [evidence] = urlEvidence.normalizeExaContentsEvidence(sourceUrl, [
    sourceUrl,
  ], {
    requestId: "exa-request-2",
    results: [],
    statuses: [
      {
        id: sourceUrl,
        status: "error",
        error: {
          tag: "SOURCE_NOT_AVAILABLE",
          message: "Access forbidden",
          httpStatusCode: 403,
        },
      },
    ],
  });

  assert(evidence, "Exa failure evidence missing");
  assertEqual(evidence.source, "exa_contents", "Exa failure source");
  assertEqual(evidence.status, "failed", "Exa failure status");
  assert(
    Boolean(evidence.error?.includes("SOURCE_NOT_AVAILABLE")),
    "Exa failure should include status tag",
  );
});

function exaJsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function withExaFetch(
  responder: (call: number) => Response,
  run: (calls: () => number) => Promise<void>,
) {
  const previousKey = Deno.env.get("EXA_API_KEY");
  const originalFetch = globalThis.fetch;
  let calls = 0;
  Deno.env.set("EXA_API_KEY", "test-exa-key");
  globalThis.fetch = (() => {
    calls += 1;
    return Promise.resolve(responder(calls));
  }) as typeof fetch;
  return run(() => calls).finally(() => {
    globalThis.fetch = originalFetch;
    if (previousKey) Deno.env.set("EXA_API_KEY", previousKey);
    else Deno.env.delete("EXA_API_KEY");
  });
}

const EXA_RICH_RESULT = {
  title: "DEX Screener",
  summary:
    "DEX Screener listing for the Ethereum token pair SERV/WETH with live price and volume.",
  text:
    "SERV/WETH price USD $0.07294, liquidity $64K, FDV $72.9M, market cap $55.0M. " +
    "24h volume $164K across 655 transactions split into 321 buys and 334 sells. " +
    "Traders 281. Pair listed on Uniswap v2 on Ethereum via DEX Screener.",
};

Deno.test("Exa transient per-URL error triggers one retry that succeeds", async () => {
  const url = "https://dexscreener.com/ethereum/0xB771f724C504b329623B0ce9199907137670600E";
  await withExaFetch(
    (call) =>
      call === 1
        ? exaJsonResponse({
          requestId: "r1",
          results: [],
          statuses: [{
            id: url,
            status: "error",
            error: {
              tag: "SOURCE_NOT_AVAILABLE",
              message: "Access forbidden",
              httpStatusCode: 403,
            },
          }],
        })
        : exaJsonResponse({
          requestId: "r2",
          results: [{ id: url, url, ...EXA_RICH_RESULT }],
          statuses: [{ id: url, status: "success" }],
        }),
    async (calls) => {
      const evidence = await urlEvidence.fetchExaContentsEvidence(url, [url]);
      assertEqual(calls(), 2, "transient failure should retry exactly once");
      assertEqual(evidence[0].status, "success", "retry should recover content");
      assertEqual(
        urlEvidence.productEvidenceStatus(evidence[0]),
        "extracted",
        "recovered Exa evidence should be extracted",
      );
    },
  );
});

Deno.test("Exa clean empty result is not retried", async () => {
  const url = "https://example.com/empty";
  await withExaFetch(
    () =>
      exaJsonResponse({
        requestId: "r1",
        results: [{ id: url, url }],
        statuses: [{ id: url, status: "success" }],
      }),
    async (calls) => {
      const evidence = await urlEvidence.fetchExaContentsEvidence(url, [url]);
      assertEqual(calls(), 1, "a clean empty result should not retry");
      assertEqual(evidence[0].status, "empty", "no content yields empty status");
    },
  );
});

Deno.test("Exa transient HTTP 503 is retried; definitive 404 is not", async () => {
  const url = "https://example.com/flaky";
  await withExaFetch(
    (call) =>
      call === 1
        ? exaJsonResponse({ error: "service unavailable" }, 503)
        : exaJsonResponse({
          requestId: "r2",
          results: [{ id: url, url, ...EXA_RICH_RESULT }],
          statuses: [{ id: url, status: "success" }],
        }),
    async (calls) => {
      const evidence = await urlEvidence.fetchExaContentsEvidence(url, [url]);
      assertEqual(calls(), 2, "HTTP 503 should retry");
      assertEqual(evidence[0].status, "success", "retry recovers after 503");
    },
  );

  const deadUrl = "https://example.com/gone";
  await withExaFetch(
    () =>
      exaJsonResponse({
        requestId: "r1",
        results: [],
        statuses: [{
          id: deadUrl,
          status: "error",
          error: {
            tag: "SOURCE_NOT_FOUND",
            message: "Not found",
            httpStatusCode: 404,
          },
        }],
      }),
    async (calls) => {
      const evidence = await urlEvidence.fetchExaContentsEvidence(deadUrl, [
        deadUrl,
      ]);
      assertEqual(calls(), 1, "a definitive 404 should not retry");
      assertEqual(evidence[0].status, "failed", "404 stays failed");
    },
  );
});

Deno.test("isTransientExaFailure classifies transient vs definitive failures", () => {
  const url = "https://example.com/x";
  const failure = (status: string, error: Record<string, unknown>) =>
    urlEvidence.normalizeExaContentsEvidence(url, [url], {
      requestId: "r",
      results: [],
      statuses: [{ id: url, status, error }],
    });

  assert(
    urlEvidence.isTransientExaFailure(
      failure("error", { tag: "RATE_LIMIT", message: "Too many", httpStatusCode: 429 }),
    ),
    "429 is transient",
  );
  assert(
    urlEvidence.isTransientExaFailure(
      failure("error", { tag: "CRAWL_FAILED", message: "Upstream error", httpStatusCode: 503 }),
    ),
    "503 is transient",
  );
  assert(
    urlEvidence.isTransientExaFailure(
      failure("error", { tag: "SOURCE_NOT_AVAILABLE", message: "Access forbidden", httpStatusCode: 403 }),
    ),
    "403 forbidden is transient",
  );
  assert(
    urlEvidence.isTransientExaFailure(
      failure("error", { tag: "TIMEOUT", message: "Livecrawl timeout" }),
    ),
    "timeout tag is transient",
  );
  assert(
    !urlEvidence.isTransientExaFailure(
      failure("error", { tag: "SOURCE_NOT_FOUND", message: "Not found", httpStatusCode: 404 }),
    ),
    "404 not-found is not transient",
  );
  assert(
    !urlEvidence.isTransientExaFailure(
      urlEvidence.normalizeExaContentsEvidence(url, [url], {
        requestId: "r",
        results: [{ id: url, url }],
        statuses: [{ id: url, status: "success" }],
      }),
    ),
    "clean empty result is not transient",
  );
  assert(
    !urlEvidence.isTransientExaFailure(
      urlEvidence.normalizeExaContentsEvidence(url, [url], {
        requestId: "r",
        results: [{ id: url, url, ...EXA_RICH_RESULT }],
        statuses: [{ id: url, status: "success" }],
      }),
    ),
    "successful content is not a failure",
  );
});

Deno.test("source preview fetch accepts bounded public images", async () => {
  const originalFetch = globalThis.fetch;
  const pngBytes = new Uint8Array([137, 80, 78, 71]);
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response(pngBytes, {
        status: 200,
        headers: {
          "content-type": "image/png",
          "content-length": String(pngBytes.byteLength),
        },
      }),
    )) as typeof fetch;
  try {
    const image = await urlEvidence.fetchSourcePreviewImage(
      "https://cdn.example.com/preview.png",
    );
    assertEqual(image.contentType, "image/png", "preview content type");
    assertEqual(image.extension, "png", "preview extension");
    assertEqual(image.bytes.byteLength, 4, "preview byte length");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("source preview fetch rejects unsafe or unsupported images", async () => {
  const originalFetch = globalThis.fetch;
  await assertRejects(
    () => urlEvidence.fetchSourcePreviewImage("http://cdn.example.com/a.png"),
    "non-HTTPS preview should fail",
  );

  globalThis.fetch = (() =>
    Promise.resolve(
      new Response("<svg></svg>", {
        status: 200,
        headers: { "content-type": "image/svg+xml" },
      }),
    )) as typeof fetch;
  try {
    await assertRejects(
      () => urlEvidence.fetchSourcePreviewImage("https://cdn.example.com/a.svg"),
      "SVG preview should fail",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  globalThis.fetch = (() =>
    Promise.resolve(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: {
          "content-type": "image/jpeg",
          "content-length": "3",
        },
      }),
    )) as typeof fetch;
  try {
    await assertRejects(
      () =>
        urlEvidence.fetchSourcePreviewImage(
          "https://cdn.example.com/large.jpg",
          { maxBytes: 2 },
        ),
      "oversized preview should fail",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  globalThis.fetch = (() =>
    Promise.resolve(
      new Response(
        new Uint8Array([
          0x47,
          0x49,
          0x46,
          0x38,
          0x39,
          0x61,
          0x21,
          0xf9,
          0x04,
          0x00,
          0x21,
          0xf9,
          0x04,
          0x00,
        ]),
        {
          status: 200,
          headers: { "content-type": "image/gif" },
        },
      ),
    )) as typeof fetch;
  try {
    await assertRejects(
      () => urlEvidence.fetchSourcePreviewImage("https://cdn.example.com/a.gif"),
      "animated GIF preview should fail",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("source preview mirror stores one source_preview asset", async () => {
  const originalFetch = globalThis.fetch;
  const pngBytes = new Uint8Array([137, 80, 78, 71]);
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response(pngBytes, {
        status: 200,
        headers: { "content-type": "image/png" },
      }),
    )) as typeof fetch;
  const supabase = fakePreviewSupabase();
  try {
    const evidence = urlEvidence.oembedMetadata(
      {
        title: "Preview post",
        thumbnail_url: "https://cdn.example.com/preview.png",
      },
      "https://example.com/post/1",
    );
    const result = await urlEvidence.mirrorSourcePreviewAsset(
      supabase as any,
      "user-1",
      { id: "capture-1", source_url: "https://example.com/post/1" },
      evidence,
    );
    assertEqual(result.status, "mirrored", "mirror status");
    assertEqual(supabase.state.assets.length, 1, "asset count");
    assertEqual(
      supabase.state.assets[0].asset_role,
      "source_preview",
      "asset role",
    );
    assertEqual(
      supabase.state.assets[0].mime_type,
      "image/png",
      "asset mime type",
    );
    assert(
      !("capture_type" in supabase.state.assets[0]),
      "mirror must not update capture fields",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("source preview mirror skips duplicate existing asset", async () => {
  const supabase = fakePreviewSupabase({
    id: "asset-1",
    user_id: "user-1",
    capture_id: "capture-1",
    storage_path: "user-1/capture-1/source-preview-existing.png",
    source_url: "https://cdn.example.com/preview.png",
    asset_role: "source_preview",
  });
  const evidence = urlEvidence.oembedMetadata(
    {
      title: "Preview post",
      thumbnail_url: "https://cdn.example.com/preview.png",
    },
    "https://example.com/post/1",
  );
  const result = await urlEvidence.mirrorSourcePreviewAsset(
    supabase as any,
    "user-1",
    { id: "capture-1", source_url: "https://example.com/post/1" },
    evidence,
  );
  assertEqual(result.status, "existing", "existing status");
  assertEqual(supabase.state.uploads.length, 0, "no duplicate upload");
  assertEqual(supabase.state.assets.length, 1, "no duplicate asset row");
});

Deno.test("Places resolver accepts a strong single text-search result", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = Deno.env.get("GOOGLE_PLACES_API_KEY");
  Deno.env.set("GOOGLE_PLACES_API_KEY", "test-key");
  globalThis.fetch = ((url: string | URL | Request, init?: RequestInit) => {
    const requestUrl = String(url);
    assert(
      requestUrl.includes("places:searchText"),
      "resolver should call Text Search",
    );
    assertEqual(
      (init?.headers as Record<string, string>)["X-Goog-FieldMask"],
      "places.id,places.name,places.displayName,places.formattedAddress,places.location,places.googleMapsUri,places.photos,places.types,places.businessStatus",
      "field mask",
    );
    return Promise.resolve(
      new Response(
        JSON.stringify({
          places: [{
            id: "place-love-club",
            name: "places/place-love-club",
            displayName: { text: "Love's Club" },
            formattedAddress: "106 Melrose St, Brooklyn, NY 11206",
            location: { latitude: 40.703, longitude: -73.93 },
            googleMapsUri: "https://maps.google.com/?cid=123",
            photos: [{
              name: "places/place-love-club/photos/photo-1",
              authorAttributions: [{
                displayName: "Google contributor",
                uri: "https://maps.google.com",
              }],
            }],
          }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
  }) as typeof fetch;
  try {
    const resolved = await urlEvidence.resolvePlaceForAnalysis({
      visit_target_name: "Love's Club",
      visit_target_query: "Love's Club 106 Melrose St Brooklyn NY",
      visit_target_confidence: "high",
      visit_target_evidence: ["Maps link names the venue."],
    });
    assertEqual(resolved.status, "resolved", "place status");
    assertEqual(resolved.place_id, "place-love-club", "place id");
    assertEqual(resolved.thumbnail_status, "available", "photo status");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey) Deno.env.set("GOOGLE_PLACES_API_KEY", originalKey);
    else Deno.env.delete("GOOGLE_PLACES_API_KEY");
  }
});

Deno.test("Places resolver leaves weak multi-result searches unverified", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = Deno.env.get("GOOGLE_PLACES_API_KEY");
  Deno.env.set("GOOGLE_PLACES_API_KEY", "test-key");
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          places: [
            {
              id: "place-a",
              name: "places/place-a",
              displayName: { text: "Central Cafe" },
              formattedAddress: "1 Main St",
            },
            {
              id: "place-b",
              name: "places/place-b",
              displayName: { text: "Downtown Cafe" },
              formattedAddress: "2 Main St",
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    )) as typeof fetch;
  try {
    const resolved = await urlEvidence.resolvePlaceForAnalysis({
      visit_target_name: "Cafe",
      visit_target_query: "Cafe",
      visit_target_confidence: "medium",
      visit_target_evidence: ["Only a generic cafe name is available."],
    });
    assertEqual(resolved.status, "ambiguous", "weak results should not verify");
    assertEqual(resolved.place_id, null, "ambiguous place id");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey) Deno.env.set("GOOGLE_PLACES_API_KEY", originalKey);
    else Deno.env.delete("GOOGLE_PLACES_API_KEY");
  }
});

Deno.test("Exa enrichment gate skips strong evidence and targets weak evidence", () => {
  const rich = urlEvidence.oembedMetadata(
    {
      type: "video",
      provider_name: "YouTube",
      title: "Street food tour in Osaka",
      author_name: "Creator",
      thumbnail_url: "https://i.ytimg.com/vi/example/hqdefault.jpg",
    },
    "https://www.youtube.com/watch?v=example",
  );
  assert(rich, "rich evidence missing");
  assert(
    !urlEvidence.shouldAttemptExaEnrichment(rich),
    "strong oEmbed evidence should not call Exa",
  );

  const medium = urlEvidence.parseHtmlEvidence(
    "<html><head><title>Weekend picks in Paris</title><meta name=\"description\" content=\"A weekend guide with events, museums, and activities.\"></head><body>Weekend picks for June 5-7 with many listed activities.</body></html>",
    "https://example.com/weekend-guide",
    "https://example.com/weekend-guide",
  );
  assert(medium, "medium evidence missing");
  assertEqual(
    urlEvidence.evidenceQuality(medium),
    "medium",
    "HTML evidence should be medium before Exa enrichment",
  );
  assert(
    urlEvidence.shouldAttemptExaEnrichment(medium),
    "medium sparse URL evidence should call Exa",
  );

  const generic = urlEvidence.parseHtmlEvidence(
    "<html><head><title>Instagram</title></head><body>Log in to continue.</body></html>",
    "https://www.instagram.com/reel/DY0pJskIjoe/",
    "https://www.instagram.com/reel/DY0pJskIjoe/",
  );
  assert(generic, "generic shell evidence missing");
  assert(
    urlEvidence.shouldAttemptExaEnrichment(generic),
    "generic platform shell should call Exa",
  );

  const failed = urlEvidence.emptyUrlEvidence(
    "https://example.com/file.pdf",
    "failed",
    "metadata_pipeline",
    "Unsupported metadata content-type: application/pdf",
  );
  assert(
    urlEvidence.shouldAttemptExaEnrichment(failed),
    "failed URL evidence should call Exa",
  );
});

Deno.test("Exa-aware cache reuse refreshes medium evidence once", () => {
  const url = "https://example.com/weekend-guide";
  const medium = urlEvidence.parseHtmlEvidence(
    "<html><head><title>Weekend picks in Paris</title><meta name=\"description\" content=\"A weekend guide with events, museums, and activities.\"></head><body>Weekend picks for June 5-7 with many listed activities.</body></html>",
    url,
    url,
  );
  assert(medium, "medium evidence missing");
  assert(
    urlEvidence.shouldUseCachedEvidence(medium, url),
    "medium cache should remain reusable without Exa refresh mode",
  );
  assert(
    !urlEvidence.shouldUseCachedEvidence(medium, url, { refreshForExa: true }),
    "medium cache should refresh when Exa can enrich it",
  );

  const exaAttempted = {
    ...medium,
    raw: {
      ...(medium.raw || {}),
      pipeline: {
        extraction_sources_attempted: ["original_exa_contents"],
      },
    },
  };
  assert(
    urlEvidence.shouldUseCachedEvidence(exaAttempted, url, {
      refreshForExa: true,
    }),
    "cache should be reusable after an Exa attempt is recorded",
  );

  const rich = urlEvidence.oembedMetadata(
    {
      type: "video",
      provider_name: "YouTube",
      title: "Street food tour in Osaka",
      author_name: "Creator",
      thumbnail_url: "https://i.ytimg.com/vi/example/hqdefault.jpg",
    },
    "https://www.youtube.com/watch?v=example",
  );
  assert(rich, "rich evidence missing");
  assert(
    urlEvidence.shouldUseCachedEvidence(rich, rich.sourceUrl, {
      refreshForExa: true,
    }),
    "strong cached evidence should not refresh for Exa",
  );
});

Deno.test("Exa helpers bound request shape and skip when key is missing", async () => {
  const body = urlEvidence.exaContentsRequestBody(["https://example.com"]);
  assertEqual(Boolean((body as any).text), true, "Exa text should be top-level");
  assertEqual(
    Boolean((body as any).contents),
    false,
    "Exa contents endpoint should not nest content params",
  );
  assertEqual((body as any).maxAgeHours, 24, "Exa maxAgeHours");
  assertEqual((body as any).livecrawlTimeout, 12000, "Exa timeout");
  assertEqual(
    urlEvidence.exaTargetUrlsForEnrichment([
      "https://example.com/a",
      "https://example.com/a#fragment",
      "https://example.com/b",
      "https://example.com/c",
      "https://example.com/d",
    ]).length,
    3,
    "Exa target URLs should be deduped and bounded",
  );

  const previous = Deno.env.get("EXA_API_KEY");
  try {
    Deno.env.delete("EXA_API_KEY");
    assert(
      !urlEvidence.isExaContentsConfigured(),
      "Exa should be disabled without key",
    );
    const evidence = await urlEvidence.fetchExaContentsEvidence(
      "https://example.com",
      ["https://example.com"],
    );
    assertEqual(evidence.length, 0, "missing key should skip Exa");
  } finally {
    if (previous) Deno.env.set("EXA_API_KEY", previous);
  }
});

Deno.test("domain evidence profiles make YouTube oEmbed beat HTML shell metadata", () => {
  const sourceUrl =
    "https://youtube.com/watch?v=oTJSHLRYBhE&si=ELKZ-57_rieHQKer";
  const rich = urlEvidence.oembedMetadata(
    {
      type: "video",
      version: "1.0",
      provider_name: "YouTube",
      title: "007 First Light - Before You Buy",
      author_name: "gameranx",
      author_url: "https://www.youtube.com/@gameranxTV",
      thumbnail_url: "https://i.ytimg.com/vi/oTJSHLRYBhE/hqdefault.jpg",
    },
    sourceUrl,
  );
  assert(rich, "YouTube oEmbed fixture did not produce evidence");

  const genericHtml = {
    ...rich,
    status: "success",
    source: "openlink_html",
    confidence: 0.75,
    sourceUrl,
    finalUrl: "https://www.youtube.com/watch?v=oTJSHLRYBhE&si=ELKZ-57_rieHQKer",
    canonical: "https://www.youtube.com/undefined",
    host: "youtube.com",
    provider: "www.youtube.com",
    siteName: "www.youtube.com",
    type: null,
    title: "- YouTube",
    description:
      "Enjoy the videos and music you love, upload original content, and share it all with friends, family, and the world on YouTube.",
    image: null,
    video: null,
    authorName: null,
    authorUrl: null,
    text:
      "- YouTube About Press Copyright Contact us Creators Advertise Developers Terms Privacy Policy & Safety How YouTube works Test new features NFL Sunday Ticket " +
      "window.ytAtN({});".repeat(20),
    entities: [],
    raw: {},
    error: null,
  };

  const best = urlEvidence.bestEvidence([genericHtml as any, rich]);
  assert(best, "best evidence missing");
  assertEqual(
    best.title,
    "007 First Light - Before You Buy",
    "best evidence should keep the real YouTube title",
  );
  assertIncludes(
    urlEvidence.weaknessReasons(genericHtml as any),
    "generic_platform_metadata",
    "YouTube shell evidence should be marked generic",
  );
  assertEqual(
    urlEvidence.normalizedUrlEvidence(genericHtml as any).canonical_url,
    "",
    "invalid YouTube canonical should be omitted from normalized evidence",
  );
});

Deno.test("known oEmbed endpoint supports canonical TikTok video URLs", () => {
  const endpoint = urlEvidence.oembedEndpoint(
    "https://www.tiktok.com/@scout2015/video/6718335390845095173",
  );
  assert(endpoint, "TikTok oEmbed endpoint missing");
  assert(
    endpoint.startsWith("https://www.tiktok.com/oembed?url="),
    "TikTok oEmbed endpoint should use the official provider endpoint",
  );
});

Deno.test("Tier 1 canonicalization creates provider-ready URL candidates", () => {
  const cases = [
    {
      url: "https://youtu.be/dQw4w9WgXcQ?si=share",
      expected: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    },
    {
      url: "https://youtu.be/oTJSHLRYBhE?si=j_tWfjfBKKBWQp49",
      expected: "https://www.youtube.com/watch?v=oTJSHLRYBhE",
    },
    {
      url:
        "https://www.tiktok.com/@ssjeli/video/7633858537852079390?_r=1&utm_source=x",
      expected: "https://www.tiktok.com/@ssjeli/video/7633858537852079390",
    },
    {
      url:
        "https://www.tiktok.com/@ssjeli/video/7633858537852079390?_r=1&_t=ZP-96kyNdT9HUk",
      expected: "https://www.tiktok.com/@ssjeli/video/7633858537852079390",
    },
    {
      url:
        "https://www.instagram.com/reel/C0abcDEF123/?igsh=abc&utm_source=share",
      expected: "https://www.instagram.com/reel/C0abcDEF123/",
    },
    {
      url: "https://www.instagram.com/reel/DY0pJskIjoe/?igsh=MWxlODJmM2cxaHVr",
      expected: "https://www.instagram.com/reel/DY0pJskIjoe/",
    },
    {
      url: "https://www.threads.net/@precious/post/C1234567890?xmt=AQGz",
      expected: "https://www.threads.net/@precious/post/C1234567890",
    },
    {
      url:
        "https://www.facebook.com/example/posts/1234567890?fbclid=abc&utm_source=share",
      expected: "https://www.facebook.com/example/posts/1234567890",
    },
    {
      url:
        "https://old.reddit.com/r/test/comments/abc123/example_title/?utm_source=share",
      expected: "https://www.reddit.com/r/test/comments/abc123/example_title/",
    },
    {
      url:
        "https://twitter.com/TwitterDev/status/463440424141459456?ref_src=twsrc",
      expected: "https://x.com/TwitterDev/status/463440424141459456",
    },
    {
      url: "https://player.vimeo.com/video/123456789?h=abc",
      expected: "https://vimeo.com/123456789",
    },
    {
      url:
        "https://open.spotify.com/intl-tr/track/7ouMYWpwJ422jRcDASZB7P?si=abc",
      expected: "https://open.spotify.com/track/7ouMYWpwJ422jRcDASZB7P",
    },
    {
      url: "https://soundcloud.com/forss/flickermood?utm_campaign=social",
      expected: "https://soundcloud.com/forss/flickermood",
    },
    {
      url: "https://www.pinterest.com/pin/123456789012345678/?utm_content=pin",
      expected: "https://www.pinterest.com/pin/123456789012345678/",
    },
    {
      url:
        "https://www.amazon.com/Example-Product/dp/B08N5WRWNW/ref=sr_1_1?tag=abc&utm_source=x",
      expected: "https://www.amazon.com/dp/B08N5WRWNW",
    },
    {
      url:
        "https://music.apple.com/us/album/example/1234567890?i=987654321&utm_source=share",
      expected:
        "https://music.apple.com/us/album/example/1234567890?i=987654321",
    },
  ];

  for (const entry of cases) {
    assertIncludes(
      urlEvidence.tier1CanonicalCandidates(entry.url),
      entry.expected,
      `canonical candidate for ${entry.url}`,
    );
  }
});

Deno.test("Tier 1 known oEmbed endpoints cover public high-value providers", () => {
  const cases = [
    {
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      prefix: "https://www.youtube.com/oembed?",
    },
    {
      url: "https://www.reddit.com/r/test/comments/abc123/example/",
      prefix: "https://www.reddit.com/oembed?",
    },
    {
      url: "https://www.tiktok.com/@ssjeli/video/7633858537852079390",
      prefix: "https://www.tiktok.com/oembed?",
    },
    {
      url: "https://x.com/TwitterDev/status/463440424141459456",
      prefix: "https://publish.x.com/oembed?",
    },
    {
      url: "https://vimeo.com/123456789",
      prefix: "https://vimeo.com/api/oembed.json?",
    },
    {
      url: "https://open.spotify.com/track/7ouMYWpwJ422jRcDASZB7P",
      prefix: "https://open.spotify.com/oembed?",
    },
    {
      url: "https://soundcloud.com/forss/flickermood",
      prefix: "https://soundcloud.com/oembed?",
    },
  ];

  for (const entry of cases) {
    const endpoint = urlEvidence.oembedEndpoint(entry.url);
    assert(endpoint, `missing oEmbed endpoint for ${entry.url}`);
    assert(
      endpoint.startsWith(entry.prefix),
      `unexpected oEmbed endpoint for ${entry.url}: ${endpoint}`,
    );
  }
});

Deno.test("Tier 1 token-backed Meta oEmbed endpoints stay behind config", () => {
  const previous = Deno.env.get("META_OEMBED_ACCESS_TOKEN");
  try {
    Deno.env.set("META_OEMBED_ACCESS_TOKEN", "test-token");
    const instagram = urlEvidence.metaOembedEndpoint(
      "https://www.instagram.com/reel/C0abcDEF123/",
    );
    const facebook = urlEvidence.metaOembedEndpoint(
      "https://www.facebook.com/example/posts/1234567890",
    );
    assert(
      Boolean(
        instagram?.startsWith(
          "https://graph.facebook.com/v23.0/instagram_oembed?",
        ),
      ),
      "Instagram oEmbed should use Meta Graph when token is configured",
    );
    assert(
      Boolean(
        facebook?.startsWith(
          "https://graph.facebook.com/v23.0/oembed_post?",
        ),
      ),
      "Facebook oEmbed should use Meta Graph when token is configured",
    );
  } finally {
    if (previous) {
      Deno.env.set("META_OEMBED_ACCESS_TOKEN", previous);
    } else {
      Deno.env.delete("META_OEMBED_ACCESS_TOKEN");
    }
  }
});

Deno.test("oEmbed normalization keeps tweet text when providers omit titles", () => {
  const evidence = urlEvidence.oembedMetadata(
    {
      type: "rich",
      version: "1.0",
      provider_name: "Twitter",
      author_name: "US Department of the Interior",
      author_url: "https://x.com/Interior",
      html:
        '<blockquote class="twitter-tweet"><p>Sunsets do not get much better than this one over Grand Teton.</p></blockquote>',
    },
    "https://x.com/Interior/status/463440424141459456",
  );
  assert(evidence, "tweet oEmbed evidence missing");
  assertEqual(evidence.provider, "Twitter", "tweet provider");
  assert(
    Boolean(evidence.title?.includes("Sunsets do not get much better")),
    "tweet title should fall back to embed text",
  );
  assert(
    evidence.entities.some((entity) =>
      entity.type === "author" &&
      entity.name === "US Department of the Interior"
    ),
    "tweet author should stay searchable",
  );
});

Deno.test("Tier 1 platform detection avoids treating commerce and maps as social posts", () => {
  assertEqual(
    urlEvidence.platformForUrl("https://www.amazon.com/dp/B08N5WRWNW"),
    "amazon",
    "Amazon platform",
  );
  assertEqual(
    urlEvidence.platformForUrl("https://maps.apple.com/?q=Tokyo"),
    "apple_maps",
    "Apple Maps platform",
  );
  assertEqual(
    urlEvidence.platformForUrl("https://maps.app.goo.gl/example"),
    "google_maps",
    "Google Maps platform",
  );
  assertEqual(
    urlEvidence.platformForUrl(
      "https://open.spotify.com/track/7ouMYWpwJ422jRcDASZB7P",
    ),
    "spotify",
    "Spotify platform",
  );
});

Deno.test("domain evidence profiles mark platform shell metadata per domain", () => {
  const shells = [
    {
      name: "TikTok shell",
      sourceUrl: "https://www.tiktok.com/@ssjeli/video/7633858537852079390",
      title: "TikTok - Make Your Day",
      description: "TikTok - trends start here.",
      text:
        "Log in to follow creators, like videos, and view comments. Watch videos from creators you love.",
    },
    {
      name: "Instagram shell",
      sourceUrl: "https://www.instagram.com/reel/DY0pJskIjoe/",
      title: "Instagram",
      description:
        "Create an account or log in to Instagram - Share what you're into with the people who get you.",
      text:
        "Create an account or log in to Instagram. Sign up to see photos and videos from friends, family and interests around the world.",
    },
    {
      name: "Access-limited shell",
      sourceUrl: "https://example.com/post/age-limited",
      title: "This content is unavailable",
      description:
        "This account has set limits on who can see their profile and content.",
      text:
        "People under 21 can't see this content. This account has set limits on who can see their profile and content.",
    },
  ];

  for (const shell of shells) {
    const evidence = {
      status: "success",
      source: "openlink_html",
      confidence: 0.75,
      sourceUrl: shell.sourceUrl,
      finalUrl: shell.sourceUrl,
      canonical: shell.sourceUrl,
      host: new URL(shell.sourceUrl).hostname.replace(/^www\./, ""),
      provider: new URL(shell.sourceUrl).hostname,
      siteName: new URL(shell.sourceUrl).hostname,
      type: null,
      title: shell.title,
      description: shell.description,
      image: null,
      video: null,
      favicon: null,
      authorName: null,
      authorUrl: null,
      publishedAt: null,
      modifiedAt: null,
      text: shell.text,
      entities: [],
      raw: {},
      error: null,
    };
    if (shell.name !== "Access-limited shell") {
      assertIncludes(
        urlEvidence.weaknessReasons(evidence as any),
        "generic_platform_metadata",
        `${shell.name} should be marked generic`,
      );
    }
    if (shell.name === "Access-limited shell") {
      assertIncludes(
        urlEvidence.weaknessReasons(evidence as any),
        "blocked_or_login_page",
        `${shell.name} should be marked blocked`,
      );
    }
    assertEqual(
      urlEvidence.productEvidenceStatus(evidence as any),
      "partial_evidence",
      `${shell.name} should not be treated as fully extracted`,
    );
  }
});
