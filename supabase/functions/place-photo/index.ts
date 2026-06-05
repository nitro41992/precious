import { corsHeaders } from "../capture-intake/lib/config.ts";
import { handlePlacePhotoRequest } from "../capture-intake/lib/places.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  return await handlePlacePhotoRequest(new URL(request.url));
});
