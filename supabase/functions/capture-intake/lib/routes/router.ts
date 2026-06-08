import { adminClient, currentUser } from "../supabase.ts";
import { corsHeaders } from "../config.ts";
import { errorMessage } from "../common.ts";
import { json } from "../http.ts";
import { handleClientEventsResource } from "../client-events.ts";
import { handleCapturesResource } from "./captures.ts";
import { handleCollectionCapturesResource } from "./collection-captures.ts";
import { handleCollectionLinksResource } from "./collection-links.ts";
import { handleCollectionsResource } from "./collections.ts";
import { handleCollectionSuggestionsResource } from "./collection-suggestions.ts";
import { handlePurgeDeletedResource } from "./purge-deleted.ts";
import { handleSearchResource } from "./search.ts";
import { handlePlacePhotoRequest } from "../places.ts";

export async function handleCaptureIntakeRequest(request: Request) {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  const url = new URL(request.url);
  if (url.searchParams.get("resource") === "place-photo") {
    return await handlePlacePhotoRequest(url);
  }
  const user = await currentUser(request);
  if (!user) return json({ error: "Unauthorized" }, 401);

  try {
    const supabase = adminClient();
    const resource = url.searchParams.get("resource") || "";

    if (resource === "client-events") {
      return await handleClientEventsResource(request, supabase, user.id);
    }

    if (resource === "search") {
      return await handleSearchResource(request, supabase, user.id, url);
    }

    if (resource === "collections") {
      return await handleCollectionsResource(request, supabase, user.id, url);
    }

    if (resource === "collection-links") {
      return await handleCollectionLinksResource(request, supabase, user.id);
    }

    if (resource === "collection-suggestions") {
      return await handleCollectionSuggestionsResource(
        request,
        supabase,
        user.id,
      );
    }

    if (resource === "collection-captures") {
      return await handleCollectionCapturesResource(
        request,
        supabase,
        user.id,
        url,
      );
    }

    if (resource === "purge-deleted") {
      return await handlePurgeDeletedResource(request, supabase, user.id, url);
    }

    return await handleCapturesResource(request, supabase, user.id, url);
  } catch (error) {
    const message = errorMessage(error);
    const status =
      /URL|sourceText or sourceUrl|required|Private URLs|Only http\/https|Credentialed/i
          .test(message)
        ? 400
        : 500;
    return json({ error: message }, status);
  }
}
