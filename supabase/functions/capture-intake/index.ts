import { handleCaptureIntakeRequest } from "./lib/routes.ts";
export { __urlEvidenceTest } from "./lib/test-support.ts";

if (import.meta.main) {
  Deno.serve(handleCaptureIntakeRequest);
}
