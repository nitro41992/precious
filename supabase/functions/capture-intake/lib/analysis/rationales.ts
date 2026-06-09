import { jsonObject, stringValue } from "../common.ts";

export function firstRationale(records: unknown) {
  if (!Array.isArray(records)) return null;
  for (const item of records) {
    const record = jsonObject(item);
    const rationale = stringValue(record.rationale);
    if (rationale) return rationale;
  }
  return null;
}

function matchFieldCollection(
  decision: Record<string, unknown>,
  fieldCollections: Array<Record<string, unknown>>,
) {
  const decisionId = stringValue(decision.collection_id);
  if (decisionId) {
    const byId = fieldCollections.find(
      (entry) => stringValue(entry.collection_id) === decisionId,
    );
    if (byId) return byId;
  }
  const title = stringValue(decision.title);
  if (title) {
    const byLabel = fieldCollections.find(
      (entry) => stringValue(entry.selection_label) === title,
    );
    if (byLabel) return byLabel;
  }
  return null;
}

// field_rationales.*.text is the single canonical user-facing rationale the model
// writes. Fan it out deterministically into the legacy per-decision rationale
// fields here instead of asking the model to copy the same strings (which it can
// do inconsistently). Rationale wording/quality is enforced at generation time
// (prompt + structured output), so the model's text is never filtered or rewritten
// afterward — this only copies it into compatibility fields.
export function applyFieldRationaleCopies(
  analysis: Record<string, unknown>,
): Record<string, unknown> {
  const fieldRationales = jsonObject(analysis.field_rationales);
  if (!Object.keys(fieldRationales).length) return analysis;
  const next: Record<string, unknown> = { ...analysis };

  const purposeText = stringValue(jsonObject(fieldRationales.purpose).text);
  if (purposeText) {
    const defaultIntent = jsonObject(analysis.default_intent);
    if (Object.keys(defaultIntent).length) {
      next.default_intent = { ...defaultIntent, rationale: purposeText };
    }
  }

  const reminderText = stringValue(jsonObject(fieldRationales.reminder).text);
  if (reminderText && Array.isArray(analysis.suggested_reminders)) {
    next.suggested_reminders = analysis.suggested_reminders.map(
      (item, index) => {
        if (index !== 0) return item;
        const record = jsonObject(item);
        if (!Object.keys(record).length) return item;
        return { ...record, rationale: reminderText };
      },
    );
  }

  const fieldCollections = Array.isArray(fieldRationales.collections)
    ? fieldRationales.collections.map((item) => jsonObject(item))
    : [];
  if (fieldCollections.length && Array.isArray(analysis.collection_decisions)) {
    next.collection_decisions = analysis.collection_decisions.map((item) => {
      const record = jsonObject(item);
      if (!Object.keys(record).length) return item;
      const match = matchFieldCollection(record, fieldCollections);
      const text = match ? stringValue(match.text) : "";
      if (!text) return item;
      return { ...record, rationale: text };
    });
  }

  return next;
}
