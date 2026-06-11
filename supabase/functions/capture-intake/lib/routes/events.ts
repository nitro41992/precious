import { adminClient } from "../supabase.ts";
import { CAPTURE_LIST_SELECT } from "../config.ts";
import { isUuid } from "../common.ts";
import { json } from "../http.ts";
import { withCaptureStates, withSignedCaptureAssetRows } from "../capture-records.ts";
import { withLazySourcePreviewAssets } from "../source-previews.ts";
import { attachLinkedCollections } from "../collections/links.ts";
import { hydrateResolvedPlaceThumbnails } from "../places.ts";

// Builds list-shaped capture rows (the exact pipeline the feed/list endpoint uses) for the
// captures behind a set of events, so the calendar agenda renders the real CaptureRow — DRY,
// and tapping one opens the same capture review where dates can be edited.
async function capturesForEvents(
  supabase: ReturnType<typeof adminClient>,
  userId: string,
  events: Array<Record<string, unknown>>,
): Promise<Array<Record<string, unknown>>> {
  const captureIds = Array.from(
    new Set(events.map((event) => String(event.capture_id || "")).filter((id) => isUuid(id))),
  );
  if (!captureIds.length) return [];
  const { data, error } = await supabase
    .from("captures")
    .select(CAPTURE_LIST_SELECT)
    .eq("user_id", userId)
    .in("id", captureIds)
    .is("deleted_at", null);
  if (error) throw error;
  const rows = await attachLinkedCollections(
    supabase,
    userId,
    (data ?? []) as unknown as Array<Record<string, unknown>>,
  );
  const previewRows = await withLazySourcePreviewAssets(
    supabase,
    userId,
    rows as Array<Record<string, unknown>>,
    rows.length,
  );
  const placeHydratedRows = await hydrateResolvedPlaceThumbnails(previewRows as Array<Record<string, unknown>>);
  const signedRows = await withSignedCaptureAssetRows(supabase, userId, placeHydratedRows, "thumb");
  return withCaptureStates(signedRows);
}

const EVENT_SELECT =
  "id,capture_id,title,start_date,end_date,start_time,end_time,all_day,duration,duration_unit,date_precision,time_precision,timezone,source,status,reminder_index,created_at,updated_at";

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{2}):(\d{2})$/;
const DATE_PRECISIONS = new Set([
  "exact",
  "day",
  "date_range",
  "week",
  "month_window",
  "month",
  "unknown",
]);
const TIME_PRECISIONS = new Set(["exact", "time_range", "unknown"]);
const DURATION_UNITS = new Set(["minutes", "hours", "days", "weeks"]);

function validDate(value: unknown): value is string {
  return typeof value === "string" && DATE_RE.test(value);
}

function validTime(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = TIME_RE.exec(value);
  return Boolean(match) && Number(match![1]) <= 23 && Number(match![2]) <= 59;
}

// "YYYY-MM-DD" -> first day of that month; widening the read window to whole months guarantees
// fuzzy month/week anchors for every visible month are covered by a single start_date range scan.
function firstOfMonth(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

function lastOfMonth(date: string): string {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7)); // 1-12
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${date.slice(0, 7)}-${String(lastDay).padStart(2, "0")}`;
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function handleEventsResource(
  request: Request,
  supabase: ReturnType<typeof adminClient>,
  userId: string,
  url: URL,
): Promise<Response> {
  if (request.method === "GET") {
    const fromParam = url.searchParams.get("from");
    const toParam = url.searchParams.get("to");
    const anchor = validDate(fromParam) ? fromParam : todayDate();
    const from = firstOfMonth(anchor);
    const to = lastOfMonth(validDate(toParam) ? toParam : anchor);

    const result = await supabase
      .from("capture_events")
      .select(EVENT_SELECT)
      .eq("user_id", userId)
      .neq("status", "dismissed")
      .gte("start_date", from)
      .lte("start_date", to)
      .order("start_date", { ascending: true })
      .order("start_time", { ascending: true, nullsFirst: true });
    if (result.error) throw result.error;

    // Earliest event strictly after the visible window, so the client can offer "jump to next
    // event" across empty months without scanning.
    const upcoming = await supabase
      .from("capture_events")
      .select("start_date")
      .eq("user_id", userId)
      .neq("status", "dismissed")
      .gt("start_date", to)
      .order("start_date", { ascending: true })
      .limit(1)
      .maybeSingle();

    const events = (result.data ?? []) as Array<Record<string, unknown>>;
    const captures = await capturesForEvents(supabase, userId, events);

    return json({
      events,
      captures,
      from,
      to,
      next_event_date: upcoming.data?.start_date ?? null,
    });
  }

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;

  if (request.method === "POST") {
    const row = normalizeEventWrite(body);
    if ("error" in row) return json({ error: row.error }, 400);
    const insertion = await supabase
      .from("capture_events")
      .insert({
        ...row.values,
        user_id: userId,
        capture_id: null,
        source: "manual",
        status: "confirmed",
        reminder_index: null,
      })
      .select(EVENT_SELECT)
      .single();
    if (insertion.error) throw insertion.error;
    return json({ event: insertion.data });
  }

  if (request.method === "PATCH") {
    const eventId = String(body.eventId || "");
    if (!isUuid(eventId)) return json({ error: "eventId is required" }, 400);
    const action = String(body.action || "update");

    if (action === "delete") {
      const deletion = await supabase
        .from("capture_events")
        .delete()
        .eq("user_id", userId)
        .eq("id", eventId);
      if (deletion.error) throw deletion.error;
      return json({ ok: true });
    }

    let patch: Record<string, unknown>;
    if (action === "confirm") {
      patch = { status: "confirmed" };
    } else if (action === "dismiss") {
      patch = { status: "dismissed" };
    } else {
      const row = normalizeEventWrite(body);
      if ("error" in row) return json({ error: row.error }, 400);
      // Editing a row promotes it to a confirmed, user-owned event so re-analysis won't clobber it.
      patch = { ...row.values, status: "confirmed" };
    }

    const update = await supabase
      .from("capture_events")
      .update(patch)
      .eq("user_id", userId)
      .eq("id", eventId)
      .select(EVENT_SELECT)
      .single();
    if (update.error) throw update.error;
    return json({ event: update.data });
  }

  return json({ error: "Not found" }, 404);
}

type EventWriteValues = {
  title: string;
  start_date: string;
  end_date: string;
  start_time: string | null;
  end_time: string | null;
  all_day: boolean;
  duration: number | null;
  duration_unit: string | null;
  date_precision: string;
  time_precision: string;
  timezone: string | null;
};

function normalizeEventWrite(
  body: Record<string, unknown>,
): { values: EventWriteValues } | { error: string } {
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) return { error: "title is required" };
  const startDate = body.start_date;
  if (!validDate(startDate)) return { error: "start_date must be YYYY-MM-DD" };
  const endDate = validDate(body.end_date) ? body.end_date : startDate;
  if (endDate < startDate) return { error: "end_date cannot precede start_date" };
  const startTime = validTime(body.start_time) ? body.start_time : null;
  const endTime = startTime && validTime(body.end_time) ? body.end_time : null;
  const datePrecision = DATE_PRECISIONS.has(String(body.date_precision))
    ? String(body.date_precision)
    : "exact";
  const timePrecision = TIME_PRECISIONS.has(String(body.time_precision))
    ? String(body.time_precision)
    : startTime
    ? "exact"
    : "unknown";
  const durationUnit = DURATION_UNITS.has(String(body.duration_unit))
    ? String(body.duration_unit)
    : null;
  const durationValue = Number(body.duration);
  const duration = durationUnit && Number.isFinite(durationValue) && durationValue > 0
    ? durationValue
    : null;
  return {
    values: {
      title: title.slice(0, 200),
      start_date: startDate,
      end_date: endDate,
      start_time: startTime,
      end_time: endTime,
      all_day: !startTime,
      duration: duration && durationUnit ? duration : null,
      duration_unit: duration ? durationUnit : null,
      date_precision: datePrecision,
      time_precision: timePrecision,
      timezone: typeof body.timezone === "string" && body.timezone.trim()
        ? body.timezone.trim()
        : null,
    },
  };
}
