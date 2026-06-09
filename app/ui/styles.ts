import { Platform, StatusBar, StyleSheet } from "react-native";

import { colors, typefaces } from "./theme";

const bottomControlShadow = Platform.OS === "android"
  ? {
      boxShadow: "0px 4px 34px 2px rgba(23, 33, 27, 0.2)",
      elevation: 0
    }
  : {
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.16,
      shadowRadius: 30
    };

const softCardEdgeColor = "rgba(207, 198, 180, 0.35)";
const softCardRadius = 18;
const softCardInnerRadius = 14;
const softPillRadius = 16;
const softCardShadow = Platform.OS === "android"
  ? {
      boxShadow: "0px 10px 24px 0px rgba(23, 33, 27, 0.05)",
      elevation: 0
    }
  : {
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.045,
      shadowRadius: 18
    };
// Softer, more spread-out lift for the suggestion tiles so the shadow reads as a
// diffuse glow rather than a hard drop.
const diffuseCardShadow = Platform.OS === "android"
  ? {
      boxShadow: "0px 6px 26px 0px rgba(23, 33, 27, 0.10)",
      elevation: 0
    }
  : {
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.10,
      shadowRadius: 26
    };
// Tight shadow so the light count pill separates from light areas of a thumbnail.
const pillShadow = Platform.OS === "android"
  ? { boxShadow: "0px 1px 5px 0px rgba(23, 33, 27, 0.20)" }
  : {
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.2,
      shadowRadius: 4
    };

export const styles = StyleSheet.create({
  safe: {
    backgroundColor: colors.paper,
    flex: 1,
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight ?? 0 : 0
  },
  edgeToEdgeSafe: {
    backgroundColor: colors.paper,
    flex: 1
  },
  reviewSafe: {
    backgroundColor: colors.paper,
    flex: 1
  },
  screenStack: {
    backgroundColor: colors.paper,
    flex: 1
  },
  topLevelPane: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0
  },
  topLevelPaneActive: {
    opacity: 1,
    zIndex: 1
  },
  topLevelPaneHidden: {
    opacity: 0,
    zIndex: 0
  },
  bootBlank: {
    backgroundColor: colors.paper,
    flex: 1
  },
  screenOverlay: {
    backgroundColor: colors.paper,
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 40
  },
  // Committed resting visibility for the overlay frame: a surface re-attach
  // restores committed props, so opacity 1 must not live only in the
  // handoff's UI-thread animated style (see ScreenOverlayFrame).
  screenOverlayResting: {
    opacity: 1
  },
  reviewHandoffOverlay: {
    // Transparent until the copy's image displays: an opaque background
    // would blank the card it covers for the first frames of the flight.
    overflow: "hidden",
    position: "absolute",
    zIndex: 64
  },
  reviewHandoffImage: {
    height: "100%",
    width: "100%"
  },
  container: {
    flex: 1,
    paddingHorizontal: 22,
    paddingTop: 14
  },
  topAppBarScreen: {
    flex: 1,
    paddingHorizontal: 22
  },
  keyboardScreen: {
    flex: 1
  },
  header: {
    gap: 4,
    paddingBottom: 14,
    position: "relative",
    zIndex: 2
  },
  headerContentGradient: {
    height: Platform.OS === "android" ? (StatusBar.currentHeight ?? 0) + 138 : 138,
    left: -22,
    position: "absolute",
    right: -22,
    top: 0,
    zIndex: 0
  },
  headerRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    position: "relative",
    zIndex: 2
  },
  headerCopy: {
    flex: 1,
    minWidth: 0
  },
  headerTitleLine: {
    alignItems: "baseline",
    flexDirection: "row",
    gap: 10,
    minWidth: 0
  },
  topAppBarOverlay: {
    left: 22,
    paddingTop: (Platform.OS === "android" ? StatusBar.currentHeight ?? 0 : 0) + 14,
    position: "absolute",
    right: 22,
    top: 0,
    zIndex: 4
  },
  topAppBarListInset: {
    // Clears the absolute header (title + persistent search bar) plus the fade
    // tail, so the rail/pill banner starts crisp below the gradient (not washed
    // out by it).
    paddingTop: (Platform.OS === "android" ? StatusBar.currentHeight ?? 0 : 0) + 146
  },
  title: {
    color: colors.ink,
    fontSize: 30,
    fontWeight: "900",
    ...typefaces.appBarTitle,
    letterSpacing: 0,
    lineHeight: 35
  },
  titleCount: {
    color: colors.muted,
    ...typefaces.bold,
    flexShrink: 1,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0,
    lineHeight: 16
  },
  iconButton: {
    alignItems: "center",
    backgroundColor: colors.transparent,
    borderRadius: 8,
    justifyContent: "center",
    minHeight: 44,
    minWidth: 44
  },
  iconButtonSelected: {
    backgroundColor: colors.accentSoft
  },
  iconButtonDisabled: {
    opacity: 0.42
  },
  search: {
    backgroundColor: colors.reviewCardWell,
    borderRadius: 8,
    color: colors.ink,
    fontSize: 16,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  bottomNavLayer: {
    bottom: 0,
    left: 0,
    paddingBottom: Platform.OS === "android" ? 28 : 24,
    paddingHorizontal: 0,
    position: "absolute",
    right: 0,
    zIndex: 24
  },
  bottomNavGradient: {
    bottom: 0,
    height: Platform.OS === "android" ? 152 : 162,
    left: 0,
    position: "absolute",
    right: 0,
    zIndex: 0
  },
  bottomNavDock: {
    alignItems: "center",
    alignSelf: "center",
    flexDirection: "row",
    gap: 16,
    justifyContent: "center",
    maxWidth: "78%",
    position: "relative",
    zIndex: 1,
    width: 264
  },
  bottomNavBar: {
    alignItems: "center",
    backgroundColor: colors.surfaceContainer,
    borderRadius: 27,
    flex: 1,
    flexDirection: "row",
    gap: 6,
    justifyContent: "space-between",
    minHeight: 50,
    paddingHorizontal: 5,
    paddingVertical: 5,
    ...bottomControlShadow
  },
  bottomNavItem: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    minHeight: 44,
    minWidth: 0,
    paddingHorizontal: 2
  },
  bottomNavItemPressed: {
    transform: [{ scale: 0.985 }]
  },
  bottomNavIconWrap: {
    alignItems: "center",
    borderRadius: 18,
    height: 32,
    justifyContent: "center",
    minWidth: 39,
    paddingHorizontal: 8
  },
  bottomNavIconWrapSelected: {},
  // Deep-green FAB matching the selected nav-icon color, with a white +: the
  // DoorDash/Spotify "modern FAB" look (white icon on a saturated fill). Keeps the
  // create action on-brand green as the strongest shade in the hierarchy.
  bottomNavFabShadow: {
    backgroundColor: colors.accentText,
    borderRadius: 25,
    height: 50,
    width: 50,
    ...bottomControlShadow
  },
  bottomNavFab: {
    alignItems: "center",
    backgroundColor: colors.accentText,
    borderRadius: 25,
    height: 50,
    justifyContent: "center",
    width: 50
  },
  bottomNavFabPressed: {
    backgroundColor: colors.accentTextStrong,
    transform: [{ scale: 0.965 }]
  },
  searchScreen: {
    flex: 1
  },
  searchListWrap: {
    flex: 1
  },
  searchTop: {
    paddingHorizontal: 22,
    paddingTop: 14,
    paddingBottom: 6
  },
  searchBarRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12
  },
  searchInputWrap: {
    alignItems: "center",
    backgroundColor: colors.surfaceContainer,
    borderRadius: 8,
    flex: 1,
    flexDirection: "row",
    gap: 8,
    minHeight: 50,
    paddingHorizontal: 12
  },
  searchInputNative: {
    color: colors.ink,
    ...typefaces.medium,
    flex: 1,
    fontSize: 17,
    fontWeight: "600",
    minHeight: 48,
    paddingVertical: 10
  },
  // Persistent in-header search affordance (SearchBarTrigger). Soft filled pill,
  // no hairline; the pressed fill darkens within the bar's own radius.
  searchBarTrigger: {
    alignItems: "center",
    backgroundColor: colors.surfaceContainer,
    borderRadius: 14,
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
    minHeight: 46,
    paddingHorizontal: 14,
    zIndex: 2
  },
  searchBarTriggerPressed: {
    backgroundColor: colors.surfaceContainerHigh
  },
  searchBarTriggerText: {
    color: colors.placeholder,
    ...typefaces.medium,
    flex: 1,
    fontSize: 16,
    fontWeight: "600"
  },
  searchAssistRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between",
    paddingTop: 8
  },
  searchScopeLabel: {
    color: colors.muted,
    flex: 1,
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 15
  },
  searchRefineDots: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 2
  },
  searchRefineDot: {
    backgroundColor: colors.accentText,
    borderRadius: 3,
    height: 6,
    width: 6
  },
  scopeRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4
  },
  scopeChip: {
    alignItems: "center",
    borderRadius: 6,
    justifyContent: "center",
    minHeight: 28,
    paddingHorizontal: 7
  },
  scopeChipSelected: {
    backgroundColor: colors.reviewCardWell
  },
  scopeChipText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "700"
  },
  scopeChipTextSelected: {
    color: colors.ink
  },
  captureInput: {
    backgroundColor: colors.reviewCardWell,
    borderRadius: 8,
    color: colors.ink,
    ...typefaces.regular,
    fontSize: 16,
    lineHeight: 22,
    maxHeight: 124,
    minHeight: 86,
    paddingHorizontal: 14,
    paddingVertical: 12,
    textAlignVertical: "top"
  },
  captureInputCompact: {
    maxHeight: 104,
    minHeight: 80,
    paddingVertical: 10
  },
  captureHelperText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18
  },
  captureHelperTextError: {
    color: colors.danger
  },
  collectionSheetTitleInput: {
    ...typefaces.displayMedium,
    fontSize: 18,
    fontWeight: "400",
    lineHeight: 24,
    maxHeight: 64,
    minHeight: 54,
    paddingVertical: 10,
    textAlignVertical: "center"
  },
  collectionSheetDescriptionInput: {
    minHeight: 96
  },
  captureModeRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8
  },
  captureModeChip: {
    alignItems: "center",
    backgroundColor: colors.paper,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 0,
    flex: 1,
    flexDirection: "row",
    gap: 7,
    justifyContent: "center",
    minHeight: 44,
    minWidth: 0,
    paddingHorizontal: 8
  },
  captureModeChipSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent
  },
  captureModeText: {
    color: colors.ink,
    ...typefaces.bold,
    flexShrink: 1,
    fontSize: 14,
    fontWeight: "800"
  },
  captureModeTextSelected: {
    color: colors.onAccent
  },
  captureImagePanel: {
    alignItems: "stretch",
    gap: 10
  },
  captureImageButton: {
    alignItems: "center",
    alignSelf: "stretch",
    backgroundColor: colors.reviewCardWell,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 0,
    flexDirection: "row",
    gap: 12,
    justifyContent: "flex-start",
    minHeight: 64,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  captureImageButtonIcon: {
    alignItems: "center",
    backgroundColor: colors.accentSoft,
    borderRadius: 8,
    height: 42,
    justifyContent: "center",
    width: 42
  },
  captureImageButtonDisabled: {
    opacity: 0.56
  },
  captureImageButtonText: {
    color: colors.ink,
    ...typefaces.bold,
    fontSize: 15,
    fontWeight: "800"
  },
  sheetLayer: {
    bottom: 0,
    justifyContent: "flex-end",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 36
  },
  modalLayer: {
    bottom: 0,
    justifyContent: "flex-end",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 40
  },
  modalBackdrop: {
    backgroundColor: colors.scrim,
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0
  },
  actionSheet: {
    backgroundColor: colors.surfaceContainer,
    borderTopColor: colors.line,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 0,
    gap: 14,
    paddingBottom: Platform.OS === "android" ? 20 : 28,
    paddingHorizontal: 22,
    paddingTop: 8
  },
  purposeSheet: {
    gap: 12,
    paddingBottom: Platform.OS === "android" ? 34 : 42
  },
  fieldRationaleBox: {
    backgroundColor: colors.surfaceContainerHigh,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 0,
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  fieldRationaleTitle: {
    color: colors.secondary,
    fontSize: 12,
    fontWeight: "800",
    ...typefaces.displaySemibold,
    lineHeight: 16
  },
  fieldRationaleText: {
    color: colors.ink,
    ...typefaces.medium,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 19
  },
  // AI insight: a white card whose header reuses the "Suggested" pill (pale-green
  // pill + green fill-sparkle + green label), with the insight body below — so the
  // green always sits on white, never on a muddy gray fill.
  aiInsight: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    gap: 8,
    marginBottom: 2,
    padding: 14,
    ...softCardShadow
  },
  aiInsightTag: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.accentSoft,
    borderRadius: 999,
    flexDirection: "row",
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 6
  },
  aiInsightTagText: {
    ...typefaces.displaySemibold,
    color: colors.accentTextStrong,
    fontSize: 12
  },
  aiInsightText: {
    color: colors.ink,
    ...typefaces.medium,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18
  },
  // The AI prediction card — ONE premium, elevated white card for both the new-
  // collection suggestion and an existing AI pick, so the picker never reshapes by
  // capture. A diffuse lift sets it apart from the flat list; no border (CLAUDE.md).
  predictionCard: {
    backgroundColor: colors.surface,
    borderRadius: softCardRadius,
    gap: 10,
    padding: 16,
    ...diffuseCardShadow
  },
  predictionCardHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8
  },
  predictionCardIcon: {
    alignItems: "center",
    backgroundColor: colors.accentSoft,
    borderRadius: 9,
    height: 28,
    justifyContent: "center",
    width: 28
  },
  predictionCardLabel: {
    ...typefaces.displaySemibold,
    color: colors.accentTextStrong,
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: "uppercase"
  },
  predictionCardTitle: {
    ...typefaces.displayMedium,
    color: colors.ink,
    fontSize: 19,
    lineHeight: 24
  },
  predictionCardMeta: {
    ...typefaces.medium,
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: -4
  },
  predictionCardDescription: {
    ...typefaces.regular,
    color: colors.ink,
    fontSize: 14,
    lineHeight: 19
  },
  // The plain-language reason — a tonal inset so the AI's "why" reads as a quiet
  // aside within the card (the single home for collection rationale).
  predictionCardRationale: {
    backgroundColor: colors.reviewCardWell,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11
  },
  predictionCardRationaleText: {
    ...typefaces.medium,
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18
  },
  predictionCardActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 2
  },
  predictionConfirmButton: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: 12,
    flex: 1,
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    paddingVertical: 12
  },
  predictionConfirmText: {
    ...typefaces.displaySemibold,
    color: colors.onAccent,
    fontSize: 14
  },
  predictionDismissButton: {
    alignItems: "center",
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: 12,
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    paddingHorizontal: 18,
    paddingVertical: 12
  },
  predictionDismissText: {
    ...typefaces.displaySemibold,
    color: colors.muted,
    fontSize: 14
  },
  // Existing-pick toggle: a calm confirmed pill — the loud lime stays reserved for
  // the genuine "create new collection" CTA. Selected = pale-green added; off = neutral.
  predictionToggle: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: 12,
    flexDirection: "row",
    gap: 6,
    marginTop: 2,
    paddingHorizontal: 16,
    paddingVertical: 11
  },
  predictionToggleOn: {
    backgroundColor: colors.accentSoft
  },
  predictionToggleOff: {
    backgroundColor: colors.surfaceContainerHigh
  },
  predictionToggleText: {
    ...typefaces.displaySemibold,
    color: colors.collectionAccentText,
    fontSize: 14
  },
  predictionToggleTextOn: {
    color: colors.accentTextStrong
  },
  suggestionDisabled: {
    opacity: 0.5
  },
  collectionSelectorSuggestion: {
    paddingBottom: 12
  },
  // "New collection" action row — a calm soft card matching the list rows, so its
  // press feedback never flashes a loud accent (it shares the rows' neutral press).
  collectionCreateRow: {
    alignItems: "center",
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: 16,
    flexDirection: "row",
    gap: 12,
    marginBottom: 8,
    minHeight: 68,
    paddingHorizontal: 14,
    paddingVertical: 14
  },
  collectionCreateRowPressed: {
    backgroundColor: colors.surfaceContainerHighest
  },
  collectionCreateIcon: {
    alignItems: "center",
    backgroundColor: colors.collectionAccentSoft,
    borderRadius: 11,
    height: 38,
    justifyContent: "center",
    width: 38
  },
  collectionCreateLabel: {
    ...typefaces.displayMedium,
    color: colors.ink,
    fontSize: 15
  },
  purposeOptionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  purposeOption: {
    alignItems: "center",
    backgroundColor: colors.surfaceContainerHigh,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 0,
    flexGrow: 0,
    justifyContent: "center",
    minHeight: 54,
    minWidth: 0,
    paddingHorizontal: 12,
    width: "31.6%"
  },
  purposeOptionWide: {
    width: "100%"
  },
  purposeOptionSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent
  },
  purposeOptionText: {
    color: colors.ink,
    ...typefaces.bold,
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 18,
    textAlign: "center"
  },
  purposeOptionTextSelected: {
    color: colors.onAccent
  },
  sheetBackdrop: {
    backgroundColor: colors.scrim,
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0
  },
  sheetBackdropHit: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0
  },
  sheetKeyboard: {
    flex: 1,
    justifyContent: "flex-end",
    width: "100%"
  },
  captureSheet: {
    backgroundColor: colors.surfaceContainer,
    borderTopColor: colors.line,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 0,
    gap: 14,
    paddingBottom: Platform.OS === "android" ? 18 : 26,
    paddingHorizontal: 22,
    paddingTop: 8
  },
  captureSheetCompact: {
    gap: 10,
    paddingBottom: Platform.OS === "android" ? 16 : 22
  },
  captureSheetBody: {
    flexShrink: 1,
    minWidth: 0
  },
  captureSheetBodyContent: {
    gap: 14,
    paddingBottom: 8
  },
  captureSheetBodyContentCompact: {
    gap: 10,
    paddingBottom: 12
  },
  sheetGrabber: {
    alignSelf: "center",
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: 3,
    height: 5,
    width: 40
  },
  captureSheetHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between"
  },
  sheetActions: {
    alignItems: "center",
    flexDirection: "row",
    flexShrink: 0,
    gap: 10
  },
  sheetActionRow: {
    alignItems: "center",
    borderTopColor: colors.line,
    borderTopWidth: 0,
    flexDirection: "row",
    gap: 12,
    minHeight: 62,
    paddingVertical: 12
  },
  sheetActionCopy: {
    flex: 1,
    gap: 3,
    minWidth: 0
  },
  sheetActionTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "800"
  },
  sheetActionDanger: {
    color: colors.danger
  },
  sheetActionText: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18
  },
  destructiveSheetIcon: {
    alignItems: "center",
    backgroundColor: colors.dangerSoft,
    borderColor: colors.dangerLine,
    borderRadius: 12,
    borderWidth: 0,
    height: 46,
    justifyContent: "center",
    width: 46
  },
  listContent: {
    paddingBottom: 132,
    paddingTop: 0
  },
  homeList: {
    marginHorizontal: -22
  },
  searchResultsContent: {
    // No horizontal padding: search rows are carded (like Recents) and carry
    // their own marginHorizontal, which also leaves room for the card shadow.
    paddingBottom: 180,
    paddingTop: 4
  },
  collectionSearchResultsContent: {
    paddingBottom: 180,
    paddingHorizontal: 14,
    paddingTop: 4
  },
  searchEmptyContent: {
    flexGrow: 1,
    paddingHorizontal: 22,
    paddingTop: 28
  },
  groupHeader: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "800",
    ...typefaces.displaySemibold,
    lineHeight: 17,
    paddingHorizontal: 22,
    paddingBottom: 10,
    paddingTop: 16
  },
  captureRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    minHeight: 128,
    paddingHorizontal: 22,
    paddingVertical: 16
  },
  captureRowPressed: {
    backgroundColor: colors.accent
  },
  captureRowCard: {
    backgroundColor: colors.reviewCard,
    borderColor: softCardEdgeColor,
    borderRadius: softCardRadius,
    borderWidth: 2,
    marginBottom: 18,
    marginHorizontal: 22,
    minHeight: 124,
    paddingHorizontal: 12,
    paddingVertical: 14,
    ...softCardShadow
  },
  // Press feedback for capture rows is dim-only: the row is a shared-element
  // source, and any press scale leaves the card mid-restore when the morph
  // copy appears at the unscaled layout rect — the content visibly juts.
  captureRowCardPressed: {
    backgroundColor: colors.surfaceContainer
  },
  subtlePressed: {
    backgroundColor: colors.surfaceContainerHigh,
    transform: [{ scale: 0.985 }]
  },
  darkButtonPressed: {
    backgroundColor: colors.surfaceContainerHighest,
    transform: [{ scale: 0.985 }]
  },
  sourceMark: {
    alignItems: "center",
    backgroundColor: colors.surfaceContainer,
    borderRadius: 14,
    height: 96,
    justifyContent: "center",
    overflow: "hidden",
    width: 74
  },
  sourceMarkDetail: {
    alignItems: "center",
    backgroundColor: colors.accentSoft,
    borderRadius: 8,
    height: 28,
    justifyContent: "center",
    overflow: "hidden",
    width: 28
  },
  sourceMarkInline: {
    alignItems: "center",
    height: 28,
    justifyContent: "center",
    overflow: "hidden",
    width: 28
  },
  sourceMarkMeta: {
    alignItems: "center",
    flexShrink: 0,
    height: 16,
    justifyContent: "center",
    overflow: "hidden",
    width: 16
  },
  sourceMarkMetaPill: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accentLine,
    borderRadius: 6,
    borderWidth: 0,
    height: 20,
    width: 20
  },
  sourceMarkProcessing: {
    backgroundColor: colors.processingSoft,
    borderColor: colors.processingLine
  },
  sourceMarkFailed: {
    backgroundColor: colors.dangerSoft,
    borderColor: colors.dangerLine
  },
  sourceFavicon: {
    height: 42,
    width: 42
  },
  sourceFaviconDetail: {
    height: 16,
    width: 16
  },
  sourceFaviconInline: {
    height: 24,
    width: 24
  },
  sourceFaviconMeta: {
    borderRadius: 2,
    height: 14,
    width: 14
  },
  captureThumbnailFrame: {
    backgroundColor: colors.surfaceContainer,
    borderRadius: 14,
    height: 96,
    overflow: "hidden",
    width: 74
  },
  captureThumbnailImage: {
    height: "100%",
    width: "100%"
  },
  handoffHiddenThumbnail: {
    opacity: 0
  },
  thumbnailRevealSlot: {
    height: 96,
    position: "relative",
    width: 74
  },
  thumbnailGhostOverlay: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0
  },
  statusGlyph: {
    alignItems: "center",
    backgroundColor: colors.reviewCardWell,
    borderRadius: 8,
    flexShrink: 0,
    height: 28,
    justifyContent: "center",
    width: 28
  },
  statusGlyphProcessing: {
    backgroundColor: colors.processingSoft,
    flexDirection: "row",
    gap: 5,
    paddingHorizontal: 8,
    width: 92
  },
  statusGlyphProcessingText: {
    color: colors.processing,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 16
  },
  statusGlyphFailed: {
    backgroundColor: colors.dangerSoft
  },
  processingStatusPill: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.processingSoft,
    borderRadius: 999,
    flexDirection: "row",
    flexShrink: 0,
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  processingStatusPillReview: {
    backgroundColor: "rgba(192, 214, 223, 0.94)",
    paddingHorizontal: 12,
    paddingVertical: 7,
    ...bottomControlShadow
  },
  processingStatusText: {
    color: colors.processing,
    ...typefaces.bold,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 15
  },
  processingStatusTextReview: {
    fontSize: 13,
    lineHeight: 17
  },
  rowContent: {
    flex: 1,
    gap: 5,
    minWidth: 0
  },
  rowTop: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between"
  },
  rowTitleLine: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8
  },
  captureTitle: {
    color: colors.ink,
    flex: 1,
    fontSize: 18,
    fontWeight: "400",
    ...typefaces.cardTitle,
    lineHeight: 23
  },
  captureCardTitle: {
    fontSize: 18,
    lineHeight: 23
  },
  status: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: "700"
  },
  statusProcessing: {
    color: colors.processing
  },
  statusReview: {
    color: colors.review
  },
  statusFailed: {
    color: colors.danger
  },
  meta: {
    color: colors.muted,
    ...typefaces.medium,
    flexShrink: 1,
    fontSize: 13,
    lineHeight: 18
  },
  sectionTitle: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "800",
    ...typefaces.displaySemibold,
    letterSpacing: 0,
    lineHeight: 18
  },
  rowMetaLine: {
    alignItems: "center",
    flexDirection: "row",
    gap: 5,
    minWidth: 0
  },
  rowSourceMetaText: {
    color: colors.muted,
    ...typefaces.medium,
    flexShrink: 1,
    fontSize: 13,
    lineHeight: 18,
    minWidth: 0
  },
  rowMetaSeparator: {
    color: colors.muted,
    flexShrink: 0,
    fontSize: 13,
    lineHeight: 18
  },
  rowDateMetaText: {
    color: colors.muted,
    ...typefaces.medium,
    flexShrink: 0,
    fontSize: 13,
    lineHeight: 18
  },
  notePreview: {
    color: colors.ink,
    fontSize: 15,
    lineHeight: 21
  },
  summaryPreview: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20
  },
  supportPreview: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 19
  },
  rowMeaningLine: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: 10,
    rowGap: 5,
    paddingTop: 3
  },
  meaningToken: {
    alignItems: "center",
    flexDirection: "row",
    gap: 5,
    maxWidth: "100%",
    minHeight: 22,
    minWidth: 0
  },
  meaningTokenText: {
    color: colors.muted,
    ...typefaces.bold,
    flexShrink: 1,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17
  },
  collectionMeaningToken: {
    paddingRight: 2
  },
  collectionMeaningTokenMulti: {
    paddingRight: 0
  },
  collectionMeaningTokenText: {
    color: colors.muted
  },
  collectionOverflowBadge: {
    alignItems: "center",
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: 6,
    flexShrink: 0,
    justifyContent: "center",
    minHeight: 18,
    minWidth: 24,
    paddingHorizontal: 5
  },
  collectionOverflowText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 14
  },
  searchMatchText: {
    color: colors.accentText,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18
  },
  separator: {
    backgroundColor: colors.line,
    height: 0
  },
  emptyContent: {
    flexGrow: 1,
    paddingBottom: 132
  },
  empty: {
    flex: 1,
    justifyContent: "center",
    paddingBottom: 80
  },
  homeEmpty: {
    alignItems: "center",
    flex: 1,
    gap: 18,
    justifyContent: "center",
    paddingBottom: 92,
    paddingTop: 0
  },
  homeEmptyVisual: {
    alignSelf: "center",
    height: 210,
    maxWidth: 342,
    position: "relative",
    width: "100%"
  },
  homeEmptyRail: {
    alignItems: "center",
    bottom: 22,
    left: 10,
    position: "absolute",
    top: 20,
    width: 24
  },
  homeEmptyRailDotActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accentLine,
    borderRadius: 8,
    borderWidth: 0,
    height: 16,
    width: 16
  },
  homeEmptyRailLine: {
    backgroundColor: colors.line,
    flex: 1,
    marginVertical: 8,
    width: 0
  },
  homeEmptyRailDot: {
    backgroundColor: colors.surfaceContainerHigh,
    borderColor: colors.line,
    borderRadius: 7,
    borderWidth: 0,
    height: 14,
    width: 14
  },
  homeEmptyTileStack: {
    gap: 10,
    marginLeft: 34,
    paddingRight: 2,
    paddingTop: 8
  },
  homeEmptyTile: {
    backgroundColor: colors.surfaceContainer,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 0,
    overflow: "hidden"
  },
  homeEmptyTilePrimary: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    minHeight: 82,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  homeEmptyTileRow: {
    flexDirection: "row",
    gap: 10
  },
  homeEmptyTileSmall: {
    flex: 1,
    gap: 10,
    minHeight: 96,
    padding: 13
  },
  homeEmptyTileImage: {
    backgroundColor: colors.processingSoft
  },
  homeEmptyIconMark: {
    alignItems: "center",
    backgroundColor: colors.accentSoft,
    borderRadius: 8,
    height: 44,
    justifyContent: "center",
    width: 44
  },
  homeEmptyLineGroup: {
    flex: 1,
    gap: 9,
    minWidth: 0
  },
  homeEmptyLineStrong: {
    backgroundColor: colors.collectionAccentLine,
    borderRadius: 6,
    height: 13,
    width: "76%"
  },
  homeEmptyLineSoft: {
    backgroundColor: colors.surfaceContainerHighest,
    borderRadius: 6,
    height: 12,
    width: "52%"
  },
  homeEmptyMiniLines: {
    gap: 7
  },
  homeEmptyMiniLine: {
    backgroundColor: colors.surfaceContainerHighest,
    borderRadius: 6,
    height: 12,
    width: "78%"
  },
  homeEmptyMiniLineShort: {
    backgroundColor: colors.surfaceContainerHighest,
    borderRadius: 6,
    height: 12,
    width: "54%"
  },
  homeEmptyImageFrame: {
    alignSelf: "stretch",
    backgroundColor: colors.processingSoft,
    borderColor: colors.processingLine,
    borderRadius: 8,
    borderWidth: 0,
    flex: 1,
    minHeight: 34
  },
  homeEmptySearchHint: {
    alignItems: "center",
    backgroundColor: colors.surfaceContainerHigh,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 0,
    bottom: 0,
    height: 42,
    justifyContent: "center",
    position: "absolute",
    right: 12,
    width: 42
  },
  homeEmptyCopy: {
    alignItems: "center",
    gap: 2,
    maxWidth: 318
  },
  homeEmptyTitle: {
    textAlign: "center"
  },
  homeEmptyText: {
    textAlign: "center"
  },
  searchEmpty: {
    gap: 8,
    paddingTop: 22
  },
  emptyTitle: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: "700",
    ...typefaces.displayBold,
    marginBottom: 8
  },
  emptyText: {
    color: colors.muted,
    ...typefaces.regular,
    fontSize: 15,
    lineHeight: 22,
    maxWidth: 280
  },
  promptChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    maxWidth: 320,
    paddingTop: 10
  },
  promptChip: {
    alignItems: "center",
    backgroundColor: colors.reviewCardWell,
    borderRadius: 8,
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 12
  },
  promptChipText: {
    color: colors.ink,
    ...typefaces.bold,
    fontSize: 13,
    fontWeight: "700"
  },
  emptyCue: {
    color: colors.muted,
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    maxWidth: 280
  },
  homeEmptyPrimary: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: colors.accent,
    borderRadius: 8,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 56,
    maxWidth: 360,
    paddingHorizontal: 16,
    paddingVertical: 14,
    width: "100%"
  },
  homeEmptyPrimaryPressed: {
    backgroundColor: colors.accentPressed,
    transform: [{ scale: 0.99 }]
  },
  homeEmptyPrimaryText: {
    color: colors.onAccent,
    ...typefaces.bold,
    fontSize: 16,
    fontWeight: "800"
  },
  homeEmptyCue: {
    alignItems: "flex-start",
    alignSelf: "center",
    flexDirection: "row",
    gap: 8,
    maxWidth: 320,
    paddingTop: 1
  },
  homeEmptyCueText: {
    maxWidth: 260
  },
  loadingRows: {
    gap: 1,
    paddingTop: 10
  },
  loadingQuietSpace: {
    minHeight: 180
  },
  skeletonRevealFrame: {
    position: "relative"
  },
  skeletonRevealOverlay: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0
  },
  skeletonBlock: {
    backgroundColor: colors.surfaceContainerHigh,
    overflow: "hidden"
  },
  skeletonSheen: {
    backgroundColor: colors.skeletonSheen,
    bottom: -14,
    position: "absolute",
    top: -14,
    width: 38
  },
  captureRowSkeletonInline: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    minHeight: 128,
    paddingVertical: 16
  },
  collectionCaptureSkeletonInline: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    minHeight: 128,
    paddingVertical: 16
  },
  captureRowSkeletonCopy: {
    flex: 1,
    gap: 8,
    minWidth: 0,
    paddingTop: 3
  },
  collectionListSkeletonRows: {
    paddingTop: 0
  },
  collectionListSkeletonBody: {
    gap: 7
  },
  collectionListSkeletonIcon: {
    borderRadius: 8,
    height: 36,
    width: 36
  },
  collectionListSkeletonTitle: {
    borderRadius: 6,
    height: 18,
    marginTop: 1,
    width: "66%"
  },
  collectionListSkeletonMeta: {
    borderRadius: 6,
    height: 13,
    marginTop: 7,
    width: "38%"
  },
  collectionListSkeletonSummaryStack: {
    gap: 7
  },
  collectionListSkeletonSummary: {
    borderRadius: 6,
    height: 13,
    width: "90%"
  },
  collectionListSkeletonSummaryShort: {
    borderRadius: 6,
    height: 13,
    width: "76%"
  },
  collectionSelectionSkeletonControl: {
    borderRadius: 8,
    flexShrink: 0,
    height: 34,
    marginRight: 2,
    width: 34
  },
  loadingSourceMark: {
    borderRadius: 14,
    height: 96,
    width: 74
  },
  loadingThumbnailMark: {
    borderRadius: 14,
    height: 96,
    width: 74
  },
  collectionLoadingTitle: {
    borderRadius: 6,
    height: 18,
    width: "68%"
  },
  collectionLoadingLine: {
    borderRadius: 6,
    height: 13,
    width: "88%"
  },
  collectionLoadingLineShort: {
    borderRadius: 6,
    height: 13,
    width: "52%"
  },
  collectionLoadingToken: {
    borderRadius: 6,
    height: 14,
    marginTop: 2,
    width: 72
  },
  collectionLoadingAction: {
    borderRadius: 8,
    height: 44,
    width: 44
  },
  collectionDetailContent: {
    paddingBottom: 40,
    paddingHorizontal: 0,
    paddingTop: 18
  },
  collectionDetailTop: {
    gap: 12,
    paddingHorizontal: 22,
    paddingBottom: 8
  },
  collectionCaptureRow: {
    minWidth: 0
  },
  collectionCaptureMain: {
    flex: 1,
    gap: 7
  },
  collectionCaptureSeparator: {
    height: 0,
    marginLeft: 108,
    marginRight: 22
  },
  collectionRow: {
    gap: 7,
    minHeight: 74,
    paddingVertical: 15
  },
  collectionRowTop: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10
  },
  collectionIconMark: {
    alignItems: "center",
    backgroundColor: colors.surfaceContainer,
    borderRadius: 8,
    height: 36,
    justifyContent: "center",
    width: 36
  },
  collectionRowCopy: {
    flex: 1,
    minWidth: 0
  },
  collectionCardWrap: {
    flex: 1,
    padding: 8
  },
  collectionGridSkeleton: {
    flexDirection: "row",
    flexWrap: "wrap"
  },
  collectionGridSkeletonCell: {
    padding: 8,
    width: "50%"
  },
  collectionCardSkeletonTitle: {
    borderRadius: 6,
    height: 18,
    width: "70%"
  },
  collectionCardSkeletonMeta: {
    borderRadius: 6,
    height: 13,
    marginTop: 6,
    width: "40%"
  },
  collectionCard: {
    backgroundColor: colors.reviewCard,
    borderColor: softCardEdgeColor,
    borderRadius: softCardRadius,
    borderWidth: 2,
    flex: 1,
    gap: 10,
    minHeight: 0,
    padding: 8,
    ...softCardShadow
  },
  collectionCardPressed: {
    backgroundColor: colors.surfaceContainer,
    transform: [{ scale: 0.99 }]
  },
  // Collections-tab "Suggested" section: a labelled group of pending AI suggestions.
  suggestionsScreenContent: {
    gap: 10,
    paddingBottom: 48,
    paddingHorizontal: 22,
    paddingTop: 8
  },
  // Collections list banner: primary "Add collection" pill + secondary
  // "See suggestions" entry. Soft pills, no hairline; pressed fills hug each
  // pill's own rounded footprint.
  collectionsBanner: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    paddingBottom: 16,
    paddingTop: 6
  },
  collectionsAddPill: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: 999,
    flexDirection: "row",
    gap: 7,
    paddingHorizontal: 16,
    paddingVertical: 11
  },
  collectionsAddPillPressed: {
    backgroundColor: colors.accentPressed,
    transform: [{ scale: 0.99 }]
  },
  collectionsAddPillText: {
    ...typefaces.bold,
    color: colors.onAccent,
    fontSize: 15,
    fontWeight: "800"
  },
  collectionsSuggestPill: {
    alignItems: "center",
    backgroundColor: colors.surfaceContainer,
    borderRadius: 999,
    flexDirection: "row",
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 11
  },
  collectionsSuggestPillPressed: {
    backgroundColor: colors.surfaceContainerHigh,
    transform: [{ scale: 0.99 }]
  },
  collectionsSuggestPillText: {
    ...typefaces.bold,
    color: colors.accentTextStrong,
    fontSize: 15,
    fontWeight: "700"
  },
  suggestionSection: {
    paddingBottom: 8
  },
  suggestionSectionGrid: {
    flexDirection: "row",
    flexWrap: "wrap"
  },
  suggestionGridWrap: {
    padding: 8,
    width: "50%"
  },
  suggestionGridCard: {
    backgroundColor: colors.suggestionSurface,
    borderColor: colors.suggestionBorder,
    borderWidth: 1.5
  },
  // Quick-add affordance on the suggestion tile's image — a compact soft-green
  // "+" circle with the app green glyph, so the footer stays clean for the title.
  suggestionGridAddButton: {
    alignItems: "center",
    backgroundColor: colors.accentSoft,
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    position: "absolute",
    right: 8,
    top: 8,
    width: 36,
    ...pillShadow
  },
  suggestionGridAddButtonPressed: {
    backgroundColor: colors.suggestionBorder,
    transform: [{ scale: 0.94 }]
  },
  // Recents rail: a compact, horizontally-scrolling band of suggested
  // collections above the feed. Shown only when suggestions exist.
  // The home list is full-bleed (homeList marginHorizontal: -22), so the rail
  // head is inset to 22 to align with the title/cards, while the scroll content
  // pads both edges so cards rest at 22 and can still scroll past the edge. The
  // band is balanced top/bottom so the cards sit centered between the section
  // label and the "Today" group header.
  homeRail: {
    paddingBottom: 0,
    paddingTop: 0
  },
  homeRailHead: {
    alignItems: "center",
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: 6,
    paddingBottom: 10,
    paddingHorizontal: 22,
    paddingTop: 2
  },
  // Matches the "Today" group header (groupHeader) so the two read as siblings.
  homeRailTitle: {
    ...typefaces.displaySemibold,
    color: colors.muted,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 17
  },
  // Vertical padding clears the tile's diffuse shadow so the ScrollView doesn't
  // clip it; horizontal padding aligns the rail with the title/cards.
  homeRailScroll: {
    gap: 12,
    paddingBottom: 26,
    paddingHorizontal: 22,
    paddingTop: 10
  },
  // Square media tile — collage on top, green footer with the title — so the
  // suggestion rail reads as distinct from the wide landscape capture rows. A
  // fixed height keeps the FlashList header measurement exact (no stray gap).
  suggestionRailCard: {
    backgroundColor: colors.suggestionSurface,
    borderColor: colors.suggestionBorder,
    borderRadius: 20,
    borderWidth: 1.5,
    gap: 9,
    height: 220,
    padding: 8,
    width: 168,
    ...diffuseCardShadow
  },
  suggestionRailCardPressed: {
    backgroundColor: colors.suggestionSurfacePressed,
    transform: [{ scale: 0.99 }]
  },
  suggestionRailCollage: {
    aspectRatio: 1,
    borderRadius: 14,
    overflow: "hidden",
    position: "relative",
    width: "100%"
  },
  // Shared count badge across collection / suggestion / rail tiles: a small light
  // pill with just the number, sitting on the thumbnail so the footer stays free
  // for the title.
  cardCountPill: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 999,
    bottom: 8,
    height: 24,
    justifyContent: "center",
    minWidth: 24,
    paddingHorizontal: 8,
    position: "absolute",
    right: 8,
    ...pillShadow
  },
  cardCountText: {
    ...typefaces.displaySemibold,
    color: colors.ink,
    fontSize: 12
  },
  suggestionRailBody: {
    gap: 2,
    paddingBottom: 2,
    paddingHorizontal: 4
  },
  suggestionRailTitle: {
    ...typefaces.cardTitle,
    color: colors.ink,
    fontSize: 16,
    lineHeight: 21
  },
  // Suggested-collection detail (preview before persisting).
  detailSuggestedTag: {
    alignItems: "center",
    backgroundColor: colors.accentSoft,
    borderRadius: 999,
    flexDirection: "row",
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 6
  },
  detailSuggestedTagText: {
    ...typefaces.displaySemibold,
    color: colors.accentTextStrong,
    fontSize: 12
  },
  detailPersistButton: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: 14,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    marginTop: 16,
    paddingVertical: 14
  },
  detailPersistText: {
    ...typefaces.displaySemibold,
    color: colors.onAccent,
    fontSize: 15
  },
  // Low-emphasis, text-only dismiss sitting under the primary persist action so the
  // whole-suggestion dismiss reads as intentional but clearly subordinate to Add. It hugs
  // its label as a centered pill so the pressed tonal fill is a soft rounded shape, never a
  // full-width hard-edged slab.
  detailDismissButton: {
    alignItems: "center",
    alignSelf: "center",
    borderRadius: 999,
    justifyContent: "center",
    marginTop: 8,
    paddingHorizontal: 18,
    paddingVertical: 10
  },
  detailDismissText: {
    ...typefaces.displaySemibold,
    color: colors.muted,
    fontSize: 14
  },
  collectionCollageFrame: {
    aspectRatio: 1,
    backgroundColor: colors.surfaceContainer,
    borderRadius: softCardInnerRadius,
    overflow: "hidden",
    width: "100%"
  },
  collectionCollageEmpty: {
    backgroundColor: colors.surfaceContainer
  },
  collectionCollagePending: {
    alignItems: "center",
    backgroundColor: colors.surfaceContainerHigh,
    gap: 8,
    justifyContent: "center",
    paddingHorizontal: 18
  },
  collectionCollagePendingLine: {
    backgroundColor: colors.surfaceContainerHighest,
    borderRadius: 6,
    height: 9,
    width: "66%"
  },
  collectionCollagePendingLineShort: {
    backgroundColor: colors.surfaceContainer,
    borderRadius: 6,
    height: 9,
    width: "42%"
  },
  collectionCollageRow: {
    flex: 1,
    flexDirection: "row",
    gap: 2
  },
  collectionCollageGrid: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 2
  },
  collectionCollageTile: {
    alignItems: "center",
    backgroundColor: colors.surfaceContainerHigh,
    justifyContent: "center",
    overflow: "hidden"
  },
  collectionCollageFillTile: {
    height: "100%",
    width: "100%"
  },
  collectionCollageHalfTile: {
    flex: 1
  },
  collectionCollageLargeTile: {
    flex: 1.35
  },
  collectionCollageStack: {
    flex: 1,
    gap: 2
  },
  collectionCollageStackTile: {
    flex: 1
  },
  collectionCollageGridTile: {
    height: "50%",
    width: "49.4%"
  },
  collectionCollageImage: {
    height: "100%",
    width: "100%"
  },
  collectionCollageFallbackTile: {
    gap: 5,
    paddingHorizontal: 6
  },
  collectionCollageFallbackHost: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "700",
    lineHeight: 12,
    maxWidth: "100%"
  },
  collectionCardCopy: {
    gap: 2,
    minWidth: 0,
    paddingHorizontal: 1
  },
  collectionCardTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "400",
    ...typefaces.cardTitle,
    lineHeight: 21,
    // Reserve two lines so 1- and 2-line titles keep cards in a row equal height.
    height: 42
  },
  removeButton: {
    paddingVertical: 4
  },
  collectionRemoveIconButton: {
    alignItems: "center",
    borderRadius: 8,
    flexShrink: 0,
    height: 44,
    justifyContent: "center",
    marginRight: -8,
    marginTop: -9,
    width: 44
  },
  collectionRemoveIconButtonPressed: {
    backgroundColor: colors.dangerSoft,
    transform: [{ scale: 0.985 }]
  },
  collectionEmpty: {
    paddingHorizontal: 22,
    paddingBottom: 24,
    paddingTop: 18
  },
  collectionsEmpty: {
    alignItems: "center",
    flex: 1,
    gap: 18,
    justifyContent: "center",
    paddingBottom: 86
  },
  collectionsEmptyVisual: {
    height: 172,
    position: "relative",
    width: 238
  },
  collectionsEmptyFolderBack: {
    backgroundColor: colors.surfaceContainer,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 0,
    bottom: 20,
    left: 18,
    opacity: 0.78,
    position: "absolute",
    right: 20,
    top: 34,
    transform: [{ rotate: "-4deg" }]
  },
  collectionsEmptyFolder: {
    alignItems: "flex-start",
    backgroundColor: colors.surfaceContainerHigh,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 0,
    bottom: 10,
    gap: 16,
    justifyContent: "center",
    left: 0,
    paddingHorizontal: 22,
    paddingTop: 12,
    position: "absolute",
    right: 0,
    top: 18
  },
  collectionsEmptyFolderTab: {
    backgroundColor: colors.collectionAccentSoft,
    borderColor: colors.collectionAccentLine,
    borderRadius: 8,
    borderWidth: 0,
    height: 28,
    left: 22,
    position: "absolute",
    top: -14,
    width: 84
  },
  collectionsEmptyLines: {
    gap: 9,
    width: "100%"
  },
  collectionsEmptyLineStrong: {
    backgroundColor: colors.collectionAccentLine,
    borderRadius: 6,
    height: 13,
    width: "74%"
  },
  collectionsEmptyLineSoft: {
    backgroundColor: colors.surfaceContainerHighest,
    borderRadius: 6,
    height: 12,
    width: "52%"
  },
  collectionsEmptyBadge: {
    alignItems: "center",
    backgroundColor: colors.collectionAccent,
    borderColor: colors.paper,
    borderRadius: 8,
    borderWidth: 3,
    bottom: 0,
    height: 48,
    justifyContent: "center",
    position: "absolute",
    right: 8,
    width: 48
  },
  collectionsEmptyCopy: {
    alignItems: "center",
    gap: 2,
    maxWidth: 318
  },
  collectionsScreen: {
    flex: 1,
    gap: 14,
    paddingHorizontal: 22,
    paddingTop: 16
  },
  collectionsTitleBlock: {
    gap: 6,
    position: "relative",
    zIndex: 2
  },
  collectionModeRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6
  },
  collectionModeChip: {
    minHeight: 34,
    paddingHorizontal: 10
  },
  collectionsListContent: {
    paddingBottom: 132,
    paddingTop: 1
  },
  collectionsGridRow: {
    marginHorizontal: -5
  },
  collectionsEmptyContent: {
    flexGrow: 1,
    paddingBottom: 132
  },
  collectionSelectorSearchInput: {
    alignItems: "center",
    backgroundColor: colors.surfaceContainer,
    borderRadius: 8,
    flexDirection: "row",
    gap: 8,
    minHeight: 50,
    paddingHorizontal: 12
  },
  collectionChoiceRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    minHeight: 76,
    paddingVertical: 15
  },
  collectionChoiceRowSheet: {
    borderRadius: 16,
    minHeight: 64,
    paddingHorizontal: 12,
    paddingVertical: 11
  },
  // Selected = a calm neutral surface; the bold lime check circle is the accent pop
  // (white card + sharp accent, never a large pale-color wash).
  collectionChoiceRowSelected: {
    backgroundColor: colors.surfaceContainer
  },
  // Press feedback stays calm and neutral so it never flashes a loud accent.
  collectionChoiceRowPressedSheet: {
    backgroundColor: colors.surfaceContainer
  },
  collectionChoiceTitle: {
    color: colors.ink,
    flex: 1,
    fontSize: 17,
    fontWeight: "400",
    ...typefaces.displayMedium,
    lineHeight: 22
  },
  collectionChoiceBody: {
    flex: 1,
    gap: 7,
    minWidth: 0
  },
  collectionSelectionControl: {
    alignItems: "center",
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: 17,
    flexShrink: 0,
    height: 34,
    justifyContent: "center",
    marginRight: 2,
    width: 34
  },
  collectionSelectionControlSelected: {
    backgroundColor: colors.collectionAccent
  },
  collectionSelectionFooter: {
    backgroundColor: colors.paper,
    borderTopColor: colors.line,
    borderTopWidth: 0,
    paddingBottom: Platform.OS === "android" ? 16 : 22,
    paddingHorizontal: 22,
    paddingTop: 10
  },
  // The full-screen collection picker. It rides in on AnimatedBottomSheet (a
  // slide-up "push"), so it fills the screen as an opaque page. The sheet stays
  // padding-less so the reused create composer can overlay edge to edge; the
  // status inset lives on the inner content instead.
  collectionPickerSheet: {
    backgroundColor: colors.paper,
    flex: 1
  },
  collectionPickerContent: {
    flex: 1,
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight ?? 0 : 0
  },
  collectionPickerHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    paddingBottom: 12,
    paddingHorizontal: 22,
    paddingTop: 6
  },
  collectionPickerHeaderCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0
  },
  collectionPickerTitle: {
    color: colors.ink,
    fontSize: 24,
    ...typefaces.appBarTitle,
    lineHeight: 30
  },
  collectionPickerSubtitle: {
    color: colors.muted,
    ...typefaces.medium,
    fontSize: 13,
    lineHeight: 18
  },
  collectionPickerBody: {
    paddingBottom: 6,
    paddingHorizontal: 22
  },
  collectionPickerList: {
    flex: 1
  },
  collectionPickerListContent: {
    paddingBottom: 24,
    paddingHorizontal: 22,
    paddingTop: 8
  },
  // Quiet tonal group label ("Recent" / "All") — separation by type + space, no line.
  collectionPickerSectionLabel: {
    color: colors.muted,
    ...typefaces.displaySemibold,
    fontSize: 12,
    letterSpacing: 0.8,
    marginBottom: 6,
    marginTop: 12,
    textTransform: "uppercase"
  },
  detail: {
    gap: 16,
    padding: 22
  },
  authDetail: {
    alignItems: "stretch",
    flexGrow: 1,
    justifyContent: "center",
    paddingBottom: 82
  },
  authHeaderRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10
  },
  authHeaderCopy: {
    flex: 1,
    gap: 4
  },
  authTitle: {
    marginBottom: 8,
    textAlign: "center"
  },
  authSuccessMark: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: colors.accent,
    borderRadius: 8,
    height: 52,
    justifyContent: "center",
    width: 52
  },
  authGoogleButton: {
    alignItems: "center",
    backgroundColor: colors.ink,
    borderRadius: 8,
    flexDirection: "row",
    gap: 12,
    justifyContent: "center",
    minHeight: 58,
    paddingHorizontal: 16,
    paddingVertical: 14
  },
  authGoogleButtonPressed: {
    backgroundColor: colors.ink,
    transform: [{ scale: 0.99 }]
  },
  authGoogleMark: {
    alignItems: "center",
    backgroundColor: colors.paper,
    borderRadius: 8,
    height: 32,
    justifyContent: "center",
    width: 32
  },
  authGoogleMarkText: {
    color: colors.ink,
    ...typefaces.black,
    fontSize: 18,
    fontWeight: "900"
  },
  authGoogleButtonText: {
    color: colors.paper,
    ...typefaces.bold,
    fontSize: 16,
    fontWeight: "800"
  },
  authDivider: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    marginBottom: 2
  },
  authDividerLine: {
    backgroundColor: colors.line,
    flex: 1,
    height: 0
  },
  authDividerText: {
    color: colors.muted,
    ...typefaces.bold,
    fontSize: 13,
    fontWeight: "700"
  },
  authEmailInput: {
    backgroundColor: colors.surfaceContainer,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 0,
    color: colors.ink,
    ...typefaces.regular,
    fontSize: 16,
    minHeight: 54,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  authEmailButton: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: 8,
    flexDirection: "row",
    gap: 9,
    justifyContent: "center",
    minHeight: 54,
    paddingHorizontal: 14,
    paddingVertical: 13
  },
  authSupportingText: {
    textAlign: "center"
  },
  reviewShell: {
    flex: 1
  },
  reviewScrollLayout: {
    backgroundColor: colors.paper,
    flex: 1,
    minHeight: 0
  },
  reviewMediaStage: {
    backgroundColor: colors.paper,
    marginHorizontal: 0,
    marginTop: 0,
    minHeight: 286,
    overflow: "hidden",
    position: "relative",
    zIndex: 3
  },
  reviewDetailScroller: {
    flex: 1,
    minHeight: 0,
    zIndex: 2
  },
  reviewDetailPlane: {
    backgroundColor: colors.paper,
    gap: 22,
    minHeight: 520,
    paddingHorizontal: 22,
    paddingTop: 26
  },
  reviewDetailContent: {
    backgroundColor: colors.paper,
    paddingBottom: 118
  },
  reviewDetailContentNoFooter: {
    paddingBottom: 44
  },
  detailHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  detailHeaderActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10
  },
  // Circular danger trashcan, matching the capture review screen's delete
  // control (reviewMediaIconButton/reviewMediaDangerButton): white surface,
  // soft shadow, no hairline border.
  detailHeaderDeleteButton: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 22,
    borderWidth: 0,
    height: 44,
    justifyContent: "center",
    width: 44,
    ...bottomControlShadow
  },
  textButton: {
    alignSelf: "flex-start",
    paddingVertical: 8
  },
  textButtonText: {
    color: colors.ink,
    ...typefaces.medium,
    fontSize: 16,
    fontWeight: "600"
  },
  titleInput: {
    color: colors.ink,
    fontSize: 26,
    fontWeight: "700",
    ...typefaces.displaySemibold,
    lineHeight: 33,
    paddingVertical: 6
  },
  reviewMediaHeader: {
    bottom: 0,
    left: 0,
    overflow: "hidden",
    position: "absolute",
    right: 0,
    top: 0
  },
  reviewMediaHeaderImage: {
    backgroundColor: colors.paper,
    borderRadius: 18,
    bottom: 8,
    left: 8,
    right: 8,
    top: Platform.OS === "android" ? (StatusBar.currentHeight ?? 0) + 8 : 8
  },
  reviewEditorialBar: {
    // Links with no preview image have no media hero — just this control bar
    // in normal flow over the paper, aligned to the detail content padding.
    // The title in the detail plane below becomes the visual hero.
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 22,
    paddingTop: (Platform.OS === "android" ? (StatusBar.currentHeight ?? 0) : 0) + 18,
    // The buttons cast a soft 44px glow. paddingBottom gives it room to finish
    // over the paper, and zIndex lifts the bar above the opaque detail plane
    // so the shadow is never clipped by the title beneath it.
    paddingBottom: 16,
    zIndex: 2
  },
  reviewMediaIconButtonInverse: {
    backgroundColor: colors.surface
  },
  reviewMediaImage: {
    height: "100%",
    width: "100%"
  },
  reviewMediaImageFrame: {
    height: "100%",
    width: "100%"
  },
  reviewMediaOverlay: {
    bottom: 34,
    left: 22,
    position: "absolute",
    right: 22
  },
  reviewMediaTopControls: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    left: 24,
    position: "absolute",
    right: 24,
    top: Platform.OS === "android" ? (StatusBar.currentHeight ?? 0) + 18 : 24,
    zIndex: 4
  },
  reviewMediaRightControls: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8
  },
  reviewMediaIconButton: {
    alignItems: "center",
    backgroundColor: colors.mediaControl,
    borderColor: colors.mediaControlLine,
    borderRadius: 24,
    borderWidth: 0,
    height: 48,
    justifyContent: "center",
    width: 48,
    ...bottomControlShadow
  },
  reviewMediaDangerButton: {
    backgroundColor: colors.surface
  },
  reviewMediaStatusPill: {
    backgroundColor: colors.mediaControl,
    borderColor: colors.mediaControlLine,
    borderRadius: 8,
    borderWidth: 0,
    color: colors.onMediaControl,
    ...typefaces.bold,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 16,
    minHeight: 34,
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  reviewMediaSourcePill: {
    alignSelf: "flex-start",
    backgroundColor: colors.mediaControlStrong,
    borderColor: colors.mediaControlLine,
    borderRadius: 8,
    borderWidth: 0,
    maxWidth: "100%",
    minHeight: 34,
    paddingHorizontal: 10,
    paddingVertical: 7
  },
  reviewMediaSourceText: {
    color: colors.onMediaControl,
    ...typefaces.bold,
    fontSize: 13,
    fontWeight: "800"
  },
  imageViewerLayer: {
    backgroundColor: colors.imageViewerBackground,
    flex: 1
  },
  imageViewerSurface: {
    alignItems: "center",
    bottom: 0,
    justifyContent: "center",
    left: 0,
    overflow: "hidden",
    position: "absolute",
    right: 0,
    top: 0
  },
  imageViewerImageWrap: {
    alignItems: "center",
    height: "100%",
    justifyContent: "center",
    width: "100%"
  },
  imageViewerImage: {
    height: "100%",
    width: "100%"
  },
  imageViewerClose: {
    alignItems: "center",
    backgroundColor: colors.mediaControl,
    borderColor: colors.mediaControlLine,
    borderRadius: 22,
    borderWidth: 0,
    height: 44,
    justifyContent: "center",
    position: "absolute",
    right: 18,
    top: Platform.OS === "android" ? (StatusBar.currentHeight ?? 0) + 12 : 18,
    width: 44
  },
  imageViewerCaption: {
    alignItems: "center",
    bottom: 28,
    left: 20,
    position: "absolute",
    right: 20
  },
  imageViewerCaptionText: {
    backgroundColor: colors.mediaControl,
    borderRadius: 8,
    color: colors.onMediaControl,
    ...typefaces.bold,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18,
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 7
  },
  quickEditBlock: {
    gap: 12,
    paddingHorizontal: 2,
    paddingTop: 2
  },
  propertyRowsCard: {
    backgroundColor: colors.reviewCard,
    borderColor: softCardEdgeColor,
    borderRadius: softCardRadius,
    borderWidth: 2,
    overflow: "hidden",
    ...softCardShadow
  },
  propertyRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    minHeight: 58,
    paddingHorizontal: 18,
    paddingVertical: 13
  },
  propertyRowPressed: {
    backgroundColor: colors.surfaceContainer
  },
  propertyRowLabel: {
    color: colors.muted,
    ...typefaces.medium,
    fontSize: 13,
    letterSpacing: 0.1,
    lineHeight: 18,
    width: 96
  },
  propertyRowValue: {
    color: colors.ink,
    flex: 1,
    ...typefaces.displaySemibold,
    fontSize: 16,
    lineHeight: 21
  },
  propertyRowValuePending: {
    color: colors.placeholder,
    ...typefaces.medium
  },
  propertyRowSuggested: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 6
  },
  propertyRowSuggestedValue: {
    color: colors.accentTextStrong,
    flexShrink: 1,
    ...typefaces.displaySemibold,
    fontSize: 16,
    lineHeight: 21
  },
  propertyRowValueColumn: {
    flex: 1,
    gap: 1
  },
  propertyRowValueSub: {
    color: colors.muted,
    ...typefaces.medium,
    fontSize: 13,
    lineHeight: 17
  },
  reviewPrimaryBlock: {
    gap: 12,
    paddingHorizontal: 0
  },
  reviewTitleRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 8,
    minHeight: 44
  },
  reviewTitleText: {
    color: colors.ink,
    flex: 1,
    fontSize: 26,
    fontWeight: "400",
    ...typefaces.displaySemibold,
    lineHeight: 33,
    paddingTop: 3
  },
  reviewTitleTextEmpty: {
    color: colors.placeholder
  },
  reviewTitleEditButton: {
    alignItems: "center",
    borderRadius: 8,
    height: 36,
    justifyContent: "center",
    marginTop: 2,
    width: 36
  },
  reviewMetaRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    minHeight: 34
  },
  reviewSourceCluster: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.reviewCard,
    borderColor: softCardEdgeColor,
    borderRadius: softPillRadius,
    borderWidth: 2,
    flexDirection: "row",
    flexShrink: 1,
    gap: 8,
    minHeight: 38,
    minWidth: 0,
    paddingLeft: 6,
    paddingRight: 6,
    paddingVertical: 5
  },
  reviewSourceName: {
    color: colors.ink,
    ...typefaces.bold,
    flexShrink: 1,
    fontSize: 13.5,
    fontWeight: "700",
    lineHeight: 18
  },
  reviewSourceTime: {
    color: colors.muted,
    ...typefaces.medium,
    fontWeight: "600"
  },
  reviewSourceImageIconPill: {
    alignItems: "center",
    backgroundColor: colors.accentSoft,
    borderColor: colors.accentLine,
    borderRadius: 8,
    borderWidth: 0,
    height: 24,
    justifyContent: "center",
    width: 28
  },
  reviewSourceCopyButton: {
    alignItems: "center",
    borderRadius: 8,
    height: 30,
    justifyContent: "center",
    marginLeft: -4,
    width: 30
  },
  reviewEditRail: {
    alignItems: "stretch",
    borderBottomColor: colors.line,
    borderBottomWidth: 0,
    borderTopColor: colors.line,
    borderTopWidth: 0,
    flexDirection: "row",
    minHeight: 88,
    overflow: "hidden",
    paddingVertical: 7
  },
  reviewEditRailIntent: {
    borderRadius: 6,
    gap: 4,
    justifyContent: "center",
    minHeight: 72,
    minWidth: 98,
    paddingHorizontal: 10,
    width: 108
  },
  reviewEditRailIntentActive: {
    backgroundColor: colors.accentSoft
  },
  reviewEditRailPressed: {
    backgroundColor: colors.surfaceContainerHigh
  },
  reviewEditRailLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0,
    lineHeight: 14
  },
  reviewEditRailIntentValue: {
    color: colors.ink,
    fontSize: 23,
    fontWeight: "800",
    lineHeight: 29
  },
  reviewEditRailDivider: {
    backgroundColor: colors.line,
    marginVertical: 8,
    width: 0
  },
  reviewEditRailDetails: {
    flex: 1,
    justifyContent: "center",
    minWidth: 0,
    paddingLeft: 8
  },
  reviewEditRailDetail: {
    alignItems: "center",
    borderRadius: 6,
    flexDirection: "row",
    gap: 10,
    minHeight: 36,
    minWidth: 0,
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  reviewEditRailDetailLabel: {
    color: colors.muted,
    flexShrink: 0,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0,
    lineHeight: 16,
    width: 68
  },
  reviewEditRailDetailValue: {
    color: colors.ink,
    flex: 1,
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 20,
    minWidth: 0
  },
  reviewEditRailDetailDivider: {
    backgroundColor: colors.line,
    height: 0,
    marginLeft: 8,
    marginRight: 8,
    opacity: 0.72
  },
  reviewEditRailPlaceholder: {
    color: colors.accentText
  },
  editRowPlaceholderText: {
    color: colors.accentText
  },
  reviewSentenceSubtext: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 19
  },
  quickTopRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between"
  },
  quickTopCopy: {
    flex: 1,
    gap: 7
  },
  quickLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700"
  },
  quickSentenceRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6
  },
  quickSentenceText: {
    color: colors.ink,
    fontSize: 19,
    lineHeight: 27
  },
  quickOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingTop: 2
  },
  addCollectionButton: {
    alignSelf: "flex-start",
    backgroundColor: colors.surfaceContainerHigh,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 0,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 12
  },
  collectionInlineActions: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  changeLine: {
    alignItems: "center",
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: 8,
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between",
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  changeText: {
    color: colors.muted,
    flex: 1,
    fontSize: 13,
    fontWeight: "700"
  },
  rationaleBlock: {
    alignItems: "center",
    backgroundColor: colors.reviewCardWell,
    borderRadius: 8,
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  becauseText: {
    color: colors.muted,
    flex: 1,
    fontSize: 14,
    lineHeight: 20
  },
  reviewCallout: {
    backgroundColor: colors.reviewSoft,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  reviewCalloutCopy: {
    gap: 3
  },
  reviewCalloutLabel: {
    color: colors.review,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase"
  },
  reviewCalloutText: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20
  },
  suggestionRail: {
    gap: 8
  },
  collectionPicker: {
    backgroundColor: colors.surfaceContainerHigh,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 0,
    gap: 12,
    padding: 12
  },
  sheetHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between"
  },
  sheetHeaderCopy: {
    flex: 1,
    gap: 3,
    minWidth: 0
  },
  // Title row when the sheet header shows a back affordance (e.g. the create step).
  sheetHeaderTitleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    marginLeft: -6
  },
  sheetHeaderBack: {
    alignItems: "center",
    justifyContent: "center",
    height: 28,
    width: 28
  },
  sheetTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "800",
    ...typefaces.displayBold
  },
  sheetSubtitle: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18
  },
  sheetCloseButton: {
    minHeight: 44,
    justifyContent: "center"
  },
  sheetSection: {
    borderTopColor: colors.line,
    borderTopWidth: 0,
    gap: 8,
    paddingTop: 12
  },
  reminderSheet: {
    gap: 12,
    maxHeight: "92%",
    paddingBottom: Platform.OS === "android" ? 24 : 32,
    paddingTop: 8
  },
  reminderSheetHeaderIcon: {
    backgroundColor: colors.accentSoft
  },
  reminderSheetScroll: {
    flexShrink: 1
  },
  reminderSheetScrollContent: {
    gap: 12,
    paddingBottom: 2
  },
  reminderFieldGroup: {
    backgroundColor: colors.paper,
    borderTopColor: colors.line,
    borderTopWidth: 0,
    borderRadius: 8,
    gap: 2,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  reminderFieldSectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 9,
    justifyContent: "space-between",
    minHeight: 34,
    paddingBottom: 4
  },
  reminderFieldSectionHeaderLead: {
    alignItems: "center",
    flexDirection: "row",
    gap: 9
  },
  reminderAllDayToggle: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8
  },
  reminderAllDayLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 17
  },
  toggleSwitchTrack: {
    borderRadius: 14,
    height: 28,
    justifyContent: "center",
    paddingHorizontal: 3,
    width: 46
  },
  toggleSwitchTrackDisabled: {
    opacity: 0.5
  },
  toggleSwitchThumb: {
    backgroundColor: colors.surface,
    borderRadius: 11,
    elevation: 2,
    height: 22,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.18,
    shadowRadius: 2,
    width: 22
  },
  reminderFieldRow: {
    alignItems: "center",
    borderBottomColor: colors.line,
    borderBottomWidth: 0,
    flexDirection: "row",
    gap: 12,
    minHeight: 52,
    paddingVertical: 8
  },
  reminderFieldCopy: {
    flex: 1,
    gap: 3,
    minWidth: 0
  },
  reminderFieldLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 17
  },
  reminderFieldSectionTitle: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "800",
    ...typefaces.displaySemibold,
    lineHeight: 17
  },
  reminderFieldValue: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 20
  },
  reminderInlineAction: {
    color: colors.accentText,
    fontSize: 13,
    fontWeight: "800",
    marginLeft: "auto"
  },
  reminderNativePickerWrap: {
    backgroundColor: colors.paper,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 0,
    gap: 10,
    overflow: "hidden",
    padding: 10
  },
  reminderSummaryBlock: {
    backgroundColor: colors.surfaceContainerHigh,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 0,
    gap: 3,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  reminderSummaryText: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 20
  },
  reminderDurationBlock: {
    backgroundColor: colors.surfaceContainerHigh,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 0,
    gap: 12,
    padding: 12
  },
  reminderDurationHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 9
  },
  reminderDurationControls: {
    alignItems: "stretch",
    flexDirection: "row",
    gap: 10
  },
  reminderDurationInput: {
    backgroundColor: colors.paper,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 0,
    color: colors.ink,
    fontSize: 18,
    fontWeight: "800",
    minHeight: 48,
    minWidth: 74,
    paddingHorizontal: 12,
    textAlign: "center"
  },
  reminderUnitGrid: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    minWidth: 0
  },
  reminderUnitChip: {
    alignItems: "center",
    backgroundColor: colors.surfaceContainer,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 0,
    flexGrow: 1,
    justifyContent: "center",
    minHeight: 48,
    minWidth: 82,
    paddingHorizontal: 10
  },
  reminderUnitChipSelected: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accentLine
  },
  reminderUnitText: {
    color: colors.secondary,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 17
  },
  reminderUnitTextSelected: {
    color: colors.accentText
  },
  reminderSummary: {
    alignItems: "center",
    flexDirection: "row",
    gap: 18,
    justifyContent: "center",
    paddingBottom: 4,
    paddingTop: 2
  },
  reminderSummaryCol: {
    alignItems: "center",
    gap: 3
  },
  reminderSummaryColSingle: {
    alignItems: "center",
    gap: 3
  },
  reminderSummaryDate: {
    color: colors.ink,
    fontSize: 20,
    ...typefaces.cardTitle
  },
  reminderSummaryTime: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "700"
  },
  reminderSummaryArrow: {
    alignItems: "center",
    justifyContent: "center"
  },
  rangeCalendar: {
    backgroundColor: colors.paper,
    borderRadius: 8,
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 8
  },
  rangeCalendarHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 2
  },
  rangeCalendarMonthLabel: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "800",
    ...typefaces.displaySemibold
  },
  rangeWeekRow: {
    flexDirection: "row"
  },
  rangeWeekday: {
    color: colors.muted,
    flexBasis: "14.2857%",
    fontSize: 12,
    fontWeight: "700",
    paddingVertical: 4,
    textAlign: "center"
  },
  rangeGrid: {
    flexDirection: "row",
    flexWrap: "wrap"
  },
  rangeCell: {
    alignItems: "center",
    aspectRatio: 1,
    flexBasis: "14.2857%",
    justifyContent: "center"
  },
  rangeTrack: {
    backgroundColor: colors.accentSoft,
    bottom: 4,
    left: 0,
    position: "absolute",
    right: 0,
    top: 4
  },
  rangeTrackStart: {
    borderBottomLeftRadius: 999,
    borderTopLeftRadius: 999,
    left: 4
  },
  rangeTrackEnd: {
    borderBottomRightRadius: 999,
    borderTopRightRadius: 999,
    right: 4
  },
  rangeTrackSingle: {
    borderRadius: 999,
    left: 4,
    right: 4
  },
  rangeEndpoint: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: 999,
    height: 40,
    justifyContent: "center",
    width: 40
  },
  rangeEndpointText: {
    color: colors.onAccent,
    fontSize: 15,
    fontWeight: "800"
  },
  rangeDayText: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "700"
  },
  rangeDayOutside: {
    color: colors.placeholder,
    fontWeight: "600"
  },
  rangeDayToday: {
    color: colors.accentTextStrong,
    fontWeight: "800"
  },
  rangeDayDisabled: {
    color: colors.placeholder,
    opacity: 0.45
  },
  timeSlider: {
    alignItems: "center",
    flexDirection: "row",
    gap: 14,
    minHeight: 48
  },
  timeSliderLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "800",
    width: 38
  },
  timeSliderTrackWrap: {
    flex: 1,
    height: 44,
    justifyContent: "center"
  },
  timeSliderTrack: {
    backgroundColor: colors.surfaceContainerHighest,
    borderRadius: 999,
    height: 6,
    left: 0,
    position: "absolute",
    right: 0,
    top: 19
  },
  timeSliderFill: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    height: 6,
    left: 0,
    position: "absolute",
    top: 19
  },
  timeSliderThumb: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 999,
    elevation: 3,
    height: 34,
    justifyContent: "center",
    position: "absolute",
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.16,
    shadowRadius: 5,
    top: 5,
    width: 92
  },
  timeSliderThumbText: {
    color: colors.accentTextStrong,
    fontSize: 14,
    fontWeight: "800"
  },
  reminderWarningSlot: {
    justifyContent: "center",
    marginTop: 2,
    minHeight: 38
  },
  reminderWarning: {
    backgroundColor: colors.dangerSoft,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  reminderWarningText: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: "700"
  },
  rationaleSheetHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12
  },
  rationaleSheetHeaderIcon: {
    alignItems: "center",
    backgroundColor: colors.accentSoft,
    borderRadius: 16,
    height: 52,
    justifyContent: "center",
    width: 52
  },
  rationaleSheetHeaderCopy: {
    flex: 1,
    gap: 3,
    minWidth: 0
  },
  rationaleSheetKicker: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18
  },
  currentChoiceRow: {
    alignItems: "center",
    backgroundColor: colors.accentSoft,
    borderRadius: 8,
    flexDirection: "row",
    gap: 10,
    minHeight: 58,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  collectionPickerRow: {
    alignItems: "center",
    borderTopColor: colors.line,
    borderTopWidth: 0,
    flexDirection: "row",
    gap: 10,
    minHeight: 50,
    paddingTop: 10
  },
  collectionCreateBox: {
    borderTopColor: colors.line,
    borderTopWidth: 0,
    gap: 8,
    paddingTop: 10
  },
  suggestionPill: {
    alignItems: "center",
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: 8,
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 9
  },
  suggestionPillChanged: {
    backgroundColor: colors.reviewSoft
  },
  suggestionLabelColumn: {
    gap: 2,
    minWidth: 72
  },
  suggestionLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    minWidth: 72,
    textTransform: "uppercase"
  },
  suggestionState: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "700"
  },
  suggestionStateChanged: {
    color: colors.ink
  },
  suggestionValue: {
    flex: 1
  },
  suggestionText: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 20
  },
  suggestionTextMuted: {
    color: colors.muted,
    textDecorationLine: "line-through"
  },
  suggestionAction: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "700"
  },
  suggestionActions: {
    alignItems: "flex-end",
    gap: 6
  },
  editBlock: {
    gap: 8
  },
  fieldLabel: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "700"
  },
  intentGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  intentChip: {
    backgroundColor: colors.surfaceContainer,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  intentChipSelected: {
    backgroundColor: colors.accent
  },
  intentChipText: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "700"
  },
  intentChipTextSelected: {
    color: colors.onAccent
  },
  noteInput: {
    backgroundColor: colors.reviewCardWell,
    borderRadius: 8,
    color: colors.ink,
    fontSize: 15,
    minHeight: 104,
    padding: 14,
    textAlignVertical: "top"
  },
  detailInput: {
    backgroundColor: colors.reviewCardWell,
    borderRadius: 8,
    color: colors.ink,
    fontSize: 16,
    lineHeight: 22,
    minHeight: 56,
    padding: 14,
    textAlignVertical: "top"
  },
  sourceBlock: {
    borderTopColor: colors.line,
    borderTopWidth: 0,
    gap: 8,
    paddingTop: 16
  },
  reviewActionBlock: {
    gap: 10,
    paddingTop: 6
  },
  reviewSuggestionBlock: {
    paddingTop: 16
  },
  reviewActionLabel: {
    color: colors.muted,
    ...typefaces.medium,
    fontSize: 12,
    fontWeight: "500",
    letterSpacing: 0.7,
    lineHeight: 16,
    paddingLeft: 2,
    textTransform: "uppercase"
  },
  reviewActionGroup: {
    backgroundColor: colors.surfaceContainer,
    borderColor: colors.lineStrong,
    borderRadius: 8,
    borderWidth: 0,
    overflow: "hidden"
  },
  reviewActionRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    minHeight: 60,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  reviewActionRowDivided: {
    borderTopColor: colors.line,
    borderTopWidth: 0
  },
  reviewActionIconWell: {
    alignItems: "center",
    backgroundColor: colors.surfaceContainerHigh,
    borderColor: colors.line,
    borderWidth: 0,
    borderRadius: 8,
    height: 34,
    justifyContent: "center",
    width: 34
  },
  reviewActionIconWellDanger: {
    backgroundColor: colors.dangerSoft
  },
  noteActionCard: {
    alignItems: "center",
    backgroundColor: colors.reviewCard,
    borderColor: softCardEdgeColor,
    borderRadius: softCardRadius,
    borderWidth: 2,
    flexDirection: "row",
    gap: 12,
    minHeight: 82,
    paddingHorizontal: 14,
    paddingVertical: 14,
    ...softCardShadow
  },
  noteActionCardIcon: {
    alignItems: "center",
    // Soft-lime accent tint so the green note glyph reads as one mark, matching the
    // AI-insight icon and the rest of the icon chips — the old gray fill clashed with it.
    backgroundColor: colors.accentSoft,
    borderRadius: 10,
    height: 42,
    justifyContent: "center",
    width: 42
  },
  compactActionRow: {
    alignItems: "center",
    borderRadius: 8,
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
    minHeight: 50,
    paddingVertical: 4
  },
  compactActionText: {
    color: colors.ink,
    ...typefaces.bold,
    flex: 1,
    fontSize: 16,
    fontWeight: "700"
  },
  noteActionCopy: {
    flex: 1,
    gap: 3,
    minWidth: 0
  },
  noteActionHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between"
  },
  noteActionTitle: {
    color: colors.ink,
    flex: 1,
    fontSize: 17,
    fontWeight: "700",
    ...typefaces.displaySemibold,
    lineHeight: 22
  },
  noteActionPreview: {
    color: colors.muted,
    ...typefaces.medium,
    fontSize: 14,
    lineHeight: 20
  },
  noteSheetInput: {
    fontSize: 16,
    lineHeight: 22,
    maxHeight: 260,
    minHeight: 170
  },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  inlineAction: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "700"
  },
  hintText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase"
  },
  noteSaveState: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700"
  },
  noteSaveStateError: {
    color: colors.danger
  },
  sourceText: {
    color: colors.ink,
    fontSize: 15,
    lineHeight: 22
  },
  supportingText: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21
  },
  collectionActionRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between"
  },
  collectionActionText: {
    flex: 1,
    gap: 2
  },
  suggestionBlock: {
    gap: 6,
    paddingBottom: 10
  },
  smallButton: {
    alignSelf: "flex-start",
    backgroundColor: colors.accent,
    borderRadius: 8,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  smallButtonText: {
    color: colors.onAccent,
    fontSize: 13,
    fontWeight: "700"
  },
  errorText: {
    color: colors.danger,
    fontSize: 14,
    lineHeight: 21
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: 8,
    justifyContent: "center",
    minHeight: 50,
    paddingVertical: 14
  },
  primaryButtonContent: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "center"
  },
  primaryButtonPressed: {
    backgroundColor: colors.accentPressed,
    transform: [{ scale: 0.99 }]
  },
  disabledButton: {
    opacity: 0.45
  },
  primaryButtonText: {
    color: colors.onAccent,
    fontSize: 16,
    fontWeight: "700"
  },
  destructiveButton: {
    backgroundColor: colors.danger
  },
  destructiveButtonText: {
    color: colors.onDanger,
    fontSize: 16,
    fontWeight: "800"
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: colors.surfaceContainer,
    borderRadius: 8,
    justifyContent: "center",
    minHeight: 50,
    paddingVertical: 14
  },
  secondaryButtonText: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "700"
  },
  dangerButtonText: {
    color: colors.danger,
    ...typefaces.bold,
    fontSize: 15.5,
    fontWeight: "700"
  },
  toast: {
    alignItems: "center",
    backgroundColor: colors.reviewCard,
    borderRadius: 16,
    bottom: Platform.OS === "android" ? 16 : 22,
    elevation: 14,
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
    left: 22,
    minHeight: 62,
    paddingHorizontal: 14,
    paddingVertical: 12,
    position: "absolute",
    right: 22,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.22,
    shadowRadius: 22,
    zIndex: 32
  },
  toastAboveBottomNav: {
    bottom: Platform.OS === "android" ? 100 : 104
  },
  toastAboveFooter: {
    bottom: Platform.OS === "android" ? 94 : 104
  },
  toastIconWell: {
    alignItems: "center",
    borderRadius: 10,
    height: 36,
    justifyContent: "center",
    width: 36
  },
  toastIconWellNeutral: {
    backgroundColor: colors.surfaceContainerHigh
  },
  toastIconWellSuccess: {
    backgroundColor: colors.accentSoft
  },
  toastIconWellError: {
    backgroundColor: colors.dangerSoft
  },
  toastIconWellProcessing: {
    backgroundColor: colors.processingSoft
  },
  toastText: {
    color: colors.ink,
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 19
  },
  toastActionButton: {
    alignItems: "center",
    backgroundColor: colors.accentSoft,
    borderRadius: 10,
    justifyContent: "center",
    minHeight: 36,
    paddingHorizontal: 12
  },
  toastAction: {
    color: colors.accentTextStrong,
    fontSize: 14,
    fontWeight: "800"
  },
  toastActionDestructive: {
    color: colors.danger
  }
});
