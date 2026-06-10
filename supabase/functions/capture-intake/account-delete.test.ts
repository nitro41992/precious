import { assert, assertEqual } from "./url-evidence.test-support.ts";
import {
  chunk,
  handleAccountResource,
  storagePathsFromAssets,
} from "./lib/routes/account.ts";

type AdminClient = Parameters<typeof handleAccountResource>[1];

// Minimal stand-in for the admin Supabase client covering only the calls the
// account handler makes: capture_assets read, storage remove, deleteUser.
function makeFakeSupabase(assetRows: Array<{ storage_path: string }>) {
  const calls = {
    selectedUserId: null as string | null,
    removed: [] as string[][],
    deletedUserId: null as string | null,
  };
  const supabase = {
    from(table: string) {
      assertEqual(table, "capture_assets", "reads capture_assets");
      return {
        select(_columns: string) {
          return {
            eq(_column: string, value: string) {
              calls.selectedUserId = value;
              return Promise.resolve({ data: assetRows, error: null });
            },
          };
        },
      };
    },
    storage: {
      from(bucket: string) {
        assertEqual(bucket, "captures", "removes from captures bucket");
        return {
          remove(paths: string[]) {
            calls.removed.push(paths);
            return Promise.resolve({ data: null, error: null });
          },
        };
      },
    },
    auth: {
      admin: {
        deleteUser(id: string) {
          calls.deletedUserId = id;
          return Promise.resolve({ data: null, error: null });
        },
      },
    },
  };
  return { supabase, calls };
}

Deno.test("storagePathsFromAssets de-dupes and drops empties", () => {
  const paths = storagePathsFromAssets([
    { storage_path: "u/c/a.jpg" },
    { storage_path: "u/c/a.jpg" },
    { storage_path: "" },
    { storage_path: "u/c/b.jpg" },
    {} as Record<string, unknown>,
  ]);
  assertEqual(paths.join(","), "u/c/a.jpg,u/c/b.jpg", "deduped non-empty paths");
});

Deno.test("chunk splits into batches", () => {
  assertEqual(chunk([1, 2, 3, 4, 5], 2).length, 3, "5 items in batches of 2");
  assertEqual(chunk([], 2).length, 0, "empty input yields no batches");
});

Deno.test("account handler rejects non-DELETE methods", async () => {
  const { supabase } = makeFakeSupabase([]);
  for (const method of ["GET", "POST", "PUT", "PATCH"]) {
    const response = await handleAccountResource(
      new Request("https://example.com/?resource=account", { method }),
      supabase as unknown as AdminClient,
      "token-user",
    );
    assertEqual(response.status, 404, `${method} is rejected`);
  }
});

Deno.test("account handler deletes only the token-derived user", async () => {
  const { supabase, calls } = makeFakeSupabase([
    { storage_path: "token-user/c1/a.jpg" },
  ]);
  // A malicious body naming another user must be ignored entirely.
  const response = await handleAccountResource(
    new Request("https://example.com/?resource=account", {
      method: "DELETE",
      body: JSON.stringify({ userId: "victim-user" }),
    }),
    supabase as unknown as AdminClient,
    "token-user",
  );
  assertEqual(response.status, 200, "DELETE succeeds");
  assertEqual(calls.selectedUserId, "token-user", "assets read for token user");
  assertEqual(calls.deletedUserId, "token-user", "deletes token user only");
  assert(
    calls.deletedUserId !== "victim-user",
    "never deletes a body-supplied userId",
  );
  assertEqual(
    calls.removed.flat().join(","),
    "token-user/c1/a.jpg",
    "removes the user's storage objects before deletion",
  );
});
