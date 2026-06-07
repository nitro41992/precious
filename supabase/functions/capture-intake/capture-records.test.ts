import {
  assert,
  assertEqual,
} from "./url-evidence.test-support.ts";
import {
  captureAssetCacheKey,
  CAPTURE_ASSET_CACHE_VERSION,
  CAPTURE_IMAGE_TRANSFORMS,
} from "./lib/capture-records.ts";

Deno.test("every image variant preserves the original aspect ratio (contain)", () => {
  // The review hero upgrades its source mid-view (thumb -> viewer). Under the
  // client's contentFit="cover", two sources only crop identically when they
  // share the original's intrinsic aspect ratio, which requires "contain".
  for (const [variant, transform] of Object.entries(CAPTURE_IMAGE_TRANSFORMS)) {
    assertEqual(transform.resize, "contain", `${variant} must use contain`);
    assert(
      transform.width <= 2500 && transform.height <= 2500,
      `${variant} exceeds Supabase's 2500px transform cap`,
    );
    assert(
      transform.quality >= 20 && transform.quality <= 100,
      `${variant} quality out of range`,
    );
  }
});

Deno.test("captureAssetCacheKey carries the version token", () => {
  const key = captureAssetCacheKey("user/capture/photo.png", "thumb");
  assertEqual(
    key,
    `user/capture/photo.png:thumb:${CAPTURE_ASSET_CACHE_VERSION}`,
    "cache key must include storage path, variant, and version",
  );
  // Distinct variants and the version suffix keep stale (old-aspect) disk
  // cache entries from being reused after a transform change.
  assert(
    captureAssetCacheKey("p", "thumb") !== captureAssetCacheKey("p", "viewer"),
    "variants must produce distinct cache keys",
  );
});
