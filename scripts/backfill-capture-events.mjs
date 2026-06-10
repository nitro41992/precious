import { createClient } from "@supabase/supabase-js";
import { loadEnvFiles } from "./load-env-files.mjs";

// One-off backfill: walk existing captures' analysis.suggested_reminders into the capture_events
// table, so events detected before the calendar's write-hook was deployed show up on the calendar.
// Mirrors lib/calendar/events.ts (eventRowsFromAnalysis); structured-field copy only.
loadEnvFiles();

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const yes = args.has("--yes") || dryRun;
if (!yes) {
  console.error("Pass --dry-run or --yes to backfill capture events.");
  process.exit(1);
}

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing EXPO_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^(\d{2}):(\d{2})$/;
const DATE_PRECISIONS = new Set(["exact", "day", "date_range", "week", "month_window", "month", "unknown"]);
const TIME_PRECISIONS = new Set(["exact", "time_range", "unknown"]);
const DURATION_UNITS = new Set(["minutes", "hours", "days", "weeks"]);
const str = (v) => (typeof v === "string" ? v.trim() : "");
const validTime = (v) => TIME_RE.test(v) && Number(v.slice(0, 2)) <= 23 && Number(v.slice(3, 5)) <= 59;

function eventRows(userId, captureId, analysis, title) {
  const reminders = Array.isArray(analysis?.suggested_reminders) ? analysis.suggested_reminders : [];
  const rows = [];
  reminders.forEach((reminder, index) => {
    if (!reminder || typeof reminder !== "object" || str(reminder.trigger_type) !== "time") return;
    const startDate = str(reminder.start_date);
    if (!DATE_RE.test(startDate)) return;
    const endDateRaw = str(reminder.end_date);
    const endDate = DATE_RE.test(endDateRaw) ? endDateRaw : startDate;
    const startTime = validTime(str(reminder.start_time)) ? str(reminder.start_time) : null;
    const endTime = startTime && validTime(str(reminder.end_time)) ? str(reminder.end_time) : null;
    const datePrecision = DATE_PRECISIONS.has(str(reminder.date_precision)) ? str(reminder.date_precision) : "exact";
    const timePrecision = TIME_PRECISIONS.has(str(reminder.time_precision)) ? str(reminder.time_precision) : "unknown";
    const durationUnit = DURATION_UNITS.has(str(reminder.duration_unit)) ? str(reminder.duration_unit) : null;
    const durationValue = Number(reminder.duration);
    const duration = durationUnit && Number.isFinite(durationValue) && durationValue > 0 ? durationValue : null;
    rows.push({
      user_id: userId,
      capture_id: captureId,
      title: (title || str(reminder.trigger_value) || "Event").slice(0, 200),
      start_date: startDate,
      end_date: endDate,
      start_time: startTime,
      end_time: endTime,
      all_day: !startTime,
      duration: duration && durationUnit ? duration : null,
      duration_unit: duration ? durationUnit : null,
      date_precision: datePrecision,
      time_precision: timePrecision,
      timezone: str(reminder.timezone) || null,
      source: "analysis",
      status: "detected",
      reminder_index: index,
    });
  });
  return rows;
}

const PAGE = 200;
let from = 0;
let scanned = 0;
let capturesWithEvents = 0;
let rowsToWrite = 0;
let inserted = 0;

for (;;) {
  const { data: captures, error } = await supabase
    .from("captures")
    .select("id,user_id,analysis,display_title,title")
    .order("created_at", { ascending: true })
    .range(from, from + PAGE - 1);
  if (error) { console.error("Read failed:", error.message); process.exit(1); }
  if (!captures?.length) break;

  for (const capture of captures) {
    scanned += 1;
    const rows = eventRows(capture.user_id, capture.id, capture.analysis, capture.display_title || capture.title);
    if (!rows.length) continue;

    // Idempotent: skip captures that already have analysis-sourced events (don't touch
    // anything the live hook or a prior backfill already wrote).
    const existing = await supabase
      .from("capture_events")
      .select("id", { count: "exact", head: true })
      .eq("capture_id", capture.id)
      .eq("source", "analysis");
    if ((existing.count ?? 0) > 0) continue;

    capturesWithEvents += 1;
    rowsToWrite += rows.length;
    if (dryRun) {
      console.log(`would write ${rows.length} event(s) for capture ${capture.id}: ${rows.map((r) => `${r.start_date}${r.start_time ? " " + r.start_time : ""}`).join(", ")}`);
      continue;
    }
    const ins = await supabase.from("capture_events").insert(rows);
    if (ins.error) console.error(`insert failed for ${capture.id}:`, ins.error.message);
    else inserted += rows.length;
  }
  from += PAGE;
}

console.log(
  `\nScanned ${scanned} captures. ${capturesWithEvents} have new dated events (${rowsToWrite} rows). ` +
    (dryRun ? "Dry run — nothing written." : `Inserted ${inserted} event rows.`)
);
