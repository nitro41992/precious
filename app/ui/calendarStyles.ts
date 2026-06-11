import { Platform, StatusBar, StyleSheet } from "react-native";

import { colors, typefaces } from "./theme";

const softCardShadow = Platform.OS === "android"
  ? { elevation: 2 }
  : {
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.08,
      shadowRadius: 18
    };

export const CALENDAR_GEOMETRY = {
  screenPadding: 22,
  railCellWidth: 54
};

// Material 3 Expressive calendar: a horizontal rail of days at the top (focused, not a full month
// of info at once), with the selected day's capture cards below. Lime is reserved for
// today/selection; no hairline borders.
export const calendarStyles = StyleSheet.create({
  // --- Header ---
  header: {
    paddingHorizontal: CALENDAR_GEOMETRY.screenPadding,
    paddingTop: (Platform.OS === "android" ? StatusBar.currentHeight ?? 0 : 0) + 16,
    paddingBottom: 4
  },
  monthTitle: {
    color: colors.ink,
    ...typefaces.appBarTitle,
    fontSize: 34,
    letterSpacing: -0.5,
    lineHeight: 40
  },
  controlStrip: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    justifyContent: "flex-end",
    marginTop: 10
  },
  todayPill: {
    alignItems: "center",
    backgroundColor: colors.accentSoft,
    borderRadius: 20,
    marginRight: "auto",
    paddingHorizontal: 16,
    paddingVertical: 9
  },
  todayPillPressed: { backgroundColor: colors.suggestionSurfacePressed },
  todayPillText: { color: colors.accentTextStrong, ...typefaces.bold, fontSize: 14 },
  iconButton: {
    alignItems: "center",
    backgroundColor: colors.surfaceContainer,
    borderRadius: 20,
    height: 40,
    justifyContent: "center",
    width: 40
  },
  iconButtonPressed: { backgroundColor: colors.surfaceContainerHigh },
  addButton: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: 20,
    height: 40,
    justifyContent: "center",
    width: 40
  },
  addButtonPressed: { backgroundColor: colors.accentPressed },

  // --- Day rail ---
  // A horizontal ScrollView needs an explicit height in this flex column (it collapses below its
  // content otherwise), so the height must clear the full cell — weekday + disc + dot row — with
  // margin. Android's includeFontPadding makes the weekday line box taller than its nominal size,
  // which is what silently clipped the dot row at smaller heights; this value leaves real headroom.
  rail: { flexGrow: 0, height: 140 },
  railContent: { alignItems: "flex-start", paddingHorizontal: CALENDAR_GEOMETRY.screenPadding - 4, paddingTop: 8 },
  railCell: {
    alignItems: "center",
    gap: 7,
    paddingVertical: 4,
    width: CALENDAR_GEOMETRY.railCellWidth
  },
  railCellPressed: { opacity: 0.55 },
  railWeekday: {
    color: colors.placeholder,
    ...typefaces.bold,
    fontSize: 12,
    includeFontPadding: false,
    letterSpacing: 0.4,
    lineHeight: 14
  },
  railWeekdaySelected: { color: colors.accentTextStrong },
  railDisc: {
    alignItems: "center",
    borderRadius: 21,
    height: 42,
    justifyContent: "center",
    width: 42
  },
  railDiscToday: { backgroundColor: colors.accentSoft },
  // Explicitly circular and elevation-free: Android renders a View that has BOTH `elevation` and
  // `borderRadius` with a square (rect-outline) fill, which is what made the selected day a square
  // while today stayed a circle. No shadow + an explicit radius keeps the selection a clean circle.
  railDiscSelected: { backgroundColor: colors.accent, borderRadius: 21 },
  railNumber: { color: colors.ink, ...typefaces.medium, fontSize: 18, lineHeight: 22 },
  railNumberToday: { color: colors.accentTextStrong, ...typefaces.bold },
  railNumberSelected: { color: colors.onAccent, ...typefaces.bold },
  railDotRow: { alignItems: "center", flexDirection: "row", gap: 4, height: 7, justifyContent: "center" },
  railDot: { backgroundColor: colors.accentText, borderRadius: 3, height: 6, width: 6 },
  railDotSelected: { backgroundColor: colors.accentText },

  scrollContent: { paddingBottom: 140 },

  // --- Sections (selected day + fuzzy month), one consistent treatment ---
  section: { marginTop: 14 },
  sectionHeaderRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    marginBottom: 10,
    paddingHorizontal: CALENDAR_GEOMETRY.screenPadding
  },
  sectionTitle: { color: colors.ink, ...typefaces.bold, flex: 1, fontSize: 18, letterSpacing: -0.2 },
  sectionAddPill: {
    alignItems: "center",
    backgroundColor: colors.accentSoft,
    borderRadius: 16,
    flexDirection: "row",
    gap: 5,
    paddingHorizontal: 13,
    paddingVertical: 8
  },
  sectionAddPillPressed: { backgroundColor: colors.suggestionSurfacePressed },
  sectionAddPillText: { color: colors.accentTextStrong, ...typefaces.bold, fontSize: 13 },
  sectionEmpty: { paddingHorizontal: CALENDAR_GEOMETRY.screenPadding, paddingVertical: 6 },
  sectionEmptyText: { color: colors.muted, ...typefaces.medium, fontSize: 15 },

  // Manual events (no capture behind them) — a compact card matching the capture cards.
  manualCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    gap: 4,
    marginBottom: 18,
    marginHorizontal: CALENDAR_GEOMETRY.screenPadding,
    paddingHorizontal: 16,
    paddingVertical: 15,
    ...softCardShadow
  },
  manualCardPressed: { backgroundColor: colors.surfaceContainer },
  manualTime: { color: colors.accentTextStrong, ...typefaces.bold, fontSize: 13 },
  manualTitle: { color: colors.ink, ...typefaces.medium, fontSize: 16, lineHeight: 21 },
  manualMeta: { color: colors.muted, ...typefaces.regular, fontSize: 13 },

  // --- Whole-month empty state ---
  emptyState: { alignItems: "center", gap: 14, marginTop: 36, paddingHorizontal: 24 },
  emptyGlyphWrap: {
    alignItems: "center",
    backgroundColor: colors.surfaceContainer,
    borderRadius: 28,
    height: 72,
    justifyContent: "center",
    width: 72
  },
  emptyTitle: { color: colors.ink, ...typefaces.bold, fontSize: 19, textAlign: "center" },
  emptyText: { color: colors.muted, ...typefaces.regular, fontSize: 14, lineHeight: 20, textAlign: "center" },
  emptyActions: { alignItems: "center", flexDirection: "row", gap: 10, marginTop: 6 },
  primaryPill: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: 24,
    flexDirection: "row",
    gap: 7,
    paddingHorizontal: 20,
    paddingVertical: 12
  },
  primaryPillPressed: { backgroundColor: colors.accentPressed },
  primaryPillText: { color: colors.onAccent, ...typefaces.bold, fontSize: 15 },
  ghostPill: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: colors.accentSoft,
    borderRadius: 24,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 12
  },
  ghostPillPressed: { backgroundColor: colors.suggestionSurfacePressed },
  ghostPillText: { color: colors.accentTextStrong, ...typefaces.bold, fontSize: 14 },
  errorText: {
    color: colors.danger,
    ...typefaces.medium,
    fontSize: 14,
    marginTop: 8,
    paddingHorizontal: CALENDAR_GEOMETRY.screenPadding,
    textAlign: "center"
  },

  // --- Event editor: collapsible date row ---
  eventTitleField: {
    backgroundColor: colors.surfaceContainer,
    borderRadius: 16,
    color: colors.ink,
    ...typefaces.medium,
    fontSize: 18,
    marginBottom: 10,
    paddingHorizontal: 16,
    paddingVertical: 15
  },
  eventDateRow: {
    alignItems: "center",
    backgroundColor: colors.surfaceContainer,
    borderRadius: 16,
    flexDirection: "row",
    gap: 10,
    marginBottom: 10,
    paddingHorizontal: 16,
    paddingVertical: 15
  },
  eventDateRowPressed: { backgroundColor: colors.surfaceContainerHigh },
  eventDateValue: { color: colors.ink, ...typefaces.medium, flex: 1, fontSize: 16 }
});
