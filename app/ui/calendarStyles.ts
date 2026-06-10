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

// Material 3 Expressive calendar, in this app's language (lime accent, Clash Display, Geist, no
// hairline borders — separation via tonal fills, rounded shape, and soft shadows). Expressive
// shape: the selected day is a filled lime circle, today a soft-lime circle; the day's events
// render inline in a tonal container right under the grid.
export const calendarStyles = StyleSheet.create({
  // --- Header ---
  header: {
    paddingTop: (Platform.OS === "android" ? StatusBar.currentHeight ?? 0 : 0) + 16,
    paddingBottom: 6
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
    marginTop: 10,
    marginBottom: 6
  },
  todayPill: {
    alignItems: "center",
    backgroundColor: colors.accentSoft,
    borderRadius: 20,
    marginRight: "auto",
    paddingHorizontal: 16,
    paddingVertical: 9
  },
  todayPillPressed: {
    backgroundColor: colors.suggestionSurfacePressed
  },
  todayPillText: {
    color: colors.accentTextStrong,
    ...typefaces.bold,
    fontSize: 14
  },
  iconButton: {
    alignItems: "center",
    backgroundColor: colors.surfaceContainer,
    borderRadius: 20,
    height: 40,
    justifyContent: "center",
    width: 40
  },
  iconButtonPressed: {
    backgroundColor: colors.surfaceContainerHigh
  },
  addButton: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: 20,
    height: 40,
    justifyContent: "center",
    width: 40
  },
  addButtonPressed: {
    backgroundColor: colors.accentPressed
  },

  scrollContent: {
    paddingBottom: 140
  },

  // --- Weekday header + grid ---
  weekRow: {
    flexDirection: "row",
    marginTop: 4,
    marginBottom: 6
  },
  weekdayCell: {
    alignItems: "center",
    flex: 1
  },
  weekdayText: {
    color: colors.placeholder,
    ...typefaces.bold,
    fontSize: 12,
    letterSpacing: 0.6
  },
  gridRow: {
    flexDirection: "row"
  },
  dayCell: {
    alignItems: "center",
    flex: 1,
    gap: 4,
    justifyContent: "flex-start",
    paddingVertical: 5
  },
  dayCellPressed: {
    opacity: 0.55
  },
  // The expressive shape: a circle that wraps just the number.
  dayDisc: {
    alignItems: "center",
    borderRadius: 22,
    height: 44,
    justifyContent: "center",
    width: 44
  },
  dayDiscToday: {
    backgroundColor: colors.accentSoft
  },
  dayDiscSelected: {
    backgroundColor: colors.accent,
    ...softCardShadow
  },
  dayNumber: {
    color: colors.ink,
    ...typefaces.medium,
    fontSize: 17,
    lineHeight: 22
  },
  dayNumberOutside: {
    color: colors.placeholder,
    ...typefaces.regular
  },
  dayNumberToday: {
    color: colors.accentTextStrong,
    ...typefaces.bold
  },
  dayNumberSelected: {
    color: colors.onAccent,
    ...typefaces.bold
  },
  dotRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 3,
    height: 6,
    justifyContent: "center"
  },
  dot: {
    backgroundColor: colors.accentText,
    borderRadius: 3,
    height: 5,
    width: 5
  },
  dotCountText: {
    color: colors.accentText,
    ...typefaces.bold,
    fontSize: 10,
    lineHeight: 11
  },

  // --- Fuzzy "Sometime in <month>" card ---
  fuzzyCard: {
    backgroundColor: colors.suggestionSurface,
    borderRadius: 24,
    gap: 10,
    marginTop: 18,
    padding: 18,
    ...softCardShadow
  },
  fuzzyHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8
  },
  fuzzyTitle: {
    color: colors.accentTextStrong,
    ...typefaces.bold,
    fontSize: 15
  },
  fuzzyRow: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 16,
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  fuzzyRowPressed: {
    backgroundColor: colors.surfaceContainer
  },
  fuzzyRowTitle: {
    color: colors.ink,
    ...typefaces.medium,
    flex: 1,
    fontSize: 15
  },
  fuzzyRowMeta: {
    color: colors.muted,
    ...typefaces.regular,
    fontSize: 12
  },

  // --- Inline selected-day agenda ---
  agendaCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    gap: 12,
    marginTop: 18,
    padding: 18,
    ...softCardShadow
  },
  agendaHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between"
  },
  agendaDate: {
    color: colors.ink,
    ...typefaces.bold,
    flex: 1,
    fontSize: 18,
    letterSpacing: -0.2
  },
  agendaAddPill: {
    alignItems: "center",
    backgroundColor: colors.accentSoft,
    borderRadius: 16,
    flexDirection: "row",
    gap: 5,
    paddingHorizontal: 13,
    paddingVertical: 8
  },
  agendaAddPillPressed: {
    backgroundColor: colors.suggestionSurfacePressed
  },
  agendaAddPillText: {
    color: colors.accentTextStrong,
    ...typefaces.bold,
    fontSize: 13
  },
  agendaGroupRow: {
    flexDirection: "row",
    gap: 8
  },
  eventCard: {
    backgroundColor: colors.surfaceContainer,
    borderRadius: 18,
    flex: 1,
    gap: 5,
    overflow: "hidden",
    paddingHorizontal: 14,
    paddingVertical: 13
  },
  eventCardManual: {
    backgroundColor: colors.suggestionSurface
  },
  eventCardPressed: {
    backgroundColor: colors.surfaceContainerHigh
  },
  // A tonal accent edge so timed events read as "blocks" without a hairline border.
  eventAccentEdge: {
    backgroundColor: colors.accent,
    borderRadius: 3,
    height: 22,
    position: "absolute",
    left: 0,
    top: 14,
    width: 4
  },
  eventTime: {
    color: colors.accentTextStrong,
    ...typefaces.bold,
    fontSize: 13
  },
  eventTitle: {
    color: colors.ink,
    ...typefaces.medium,
    fontSize: 16,
    lineHeight: 21
  },
  eventMetaRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    marginTop: 1
  },
  eventMeta: {
    color: colors.muted,
    ...typefaces.regular,
    fontSize: 13
  },
  agendaEmpty: {
    alignItems: "center",
    gap: 14,
    paddingVertical: 18
  },
  agendaEmptyText: {
    color: colors.muted,
    ...typefaces.medium,
    fontSize: 15
  },

  // --- Whole-month empty state ---
  emptyState: {
    alignItems: "center",
    gap: 14,
    marginTop: 40,
    paddingHorizontal: 24
  },
  emptyGlyphWrap: {
    alignItems: "center",
    backgroundColor: colors.surfaceContainer,
    borderRadius: 28,
    height: 72,
    justifyContent: "center",
    width: 72
  },
  emptyTitle: {
    color: colors.ink,
    ...typefaces.bold,
    fontSize: 19,
    textAlign: "center"
  },
  emptyText: {
    color: colors.muted,
    ...typefaces.regular,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center"
  },
  emptyActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    marginTop: 6
  },
  primaryPill: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: 24,
    flexDirection: "row",
    gap: 7,
    paddingHorizontal: 20,
    paddingVertical: 12
  },
  primaryPillPressed: {
    backgroundColor: colors.accentPressed
  },
  primaryPillText: {
    color: colors.onAccent,
    ...typefaces.bold,
    fontSize: 15
  },
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
  ghostPillPressed: {
    backgroundColor: colors.suggestionSurfacePressed
  },
  ghostPillText: {
    color: colors.accentTextStrong,
    ...typefaces.bold,
    fontSize: 14
  },
  errorText: {
    color: colors.danger,
    ...typefaces.medium,
    fontSize: 14,
    marginTop: 12,
    textAlign: "center"
  },

  // --- Event editor: collapsible date row (replaces the embedded month calendar) ---
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
  eventDateRowPressed: {
    backgroundColor: colors.surfaceContainerHigh
  },
  eventDateValue: {
    color: colors.ink,
    ...typefaces.medium,
    flex: 1,
    fontSize: 16
  }
});
