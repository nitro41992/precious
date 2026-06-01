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
