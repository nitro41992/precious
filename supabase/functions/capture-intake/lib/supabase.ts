import { createClient } from "@supabase/supabase-js";
import { env } from "./common.ts";

export function adminClient() {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
}

export async function currentUser(request: Request) {
  const token = request.headers.get("authorization")?.replace(
    /^Bearer\s+/i,
    "",
  );
  if (!token) return null;
  const { data, error } = await adminClient().auth.getUser(token);
  if (error) return null;
  return data.user;
}
