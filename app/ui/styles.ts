import { Platform, StatusBar, StyleSheet } from "react-native";

import { colors, typefaces } from "./theme";

export const styles = StyleSheet.create({
  safe: {
    backgroundColor: colors.paper,
    flex: 1,
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight ?? 0 : 0
  },
  screenStack: {
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
  container: {
    flex: 1,
    paddingHorizontal: 22,
    paddingTop: 14
  },
  keyboardScreen: {
    flex: 1
  },
  header: {
    gap: 4,
    paddingBottom: 14
  },
  headerRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between"
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
  kicker: {
    color: colors.muted,
    ...typefaces.bold,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0
  },
  title: {
    color: colors.ink,
    ...typefaces.black,
    fontSize: 30,
    fontWeight: "900",
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
    backgroundColor: "transparent",
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
    backgroundColor: colors.soft,
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
    paddingHorizontal: 48,
    position: "absolute",
    right: 0,
    zIndex: 24
  },
  bottomNavDock: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between"
  },
  bottomNavBar: {
    alignItems: "center",
    backgroundColor: colors.surfaceContainer,
    borderColor: colors.line,
    borderRadius: 26,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    flexDirection: "row",
    gap: 6,
    justifyContent: "space-between",
    minHeight: 54,
    paddingHorizontal: 7,
    paddingVertical: 5
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
    height: 36,
    justifyContent: "center",
    minWidth: 46,
    paddingHorizontal: 10
  },
  bottomNavIconWrapSelected: {},
  bottomNavIconWrapSelectedCollection: {
    backgroundColor: colors.collectionAccentSoft
  },
  bottomNavFab: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: 26,
    justifyContent: "center",
    height: 52,
    width: 52
  },
  bottomNavFabPressed: {
    backgroundColor: "#96e5bf",
    transform: [{ scale: 0.965 }]
  },
  bottomNavFabCollection: {
    backgroundColor: colors.collectionAccent
  },
  bottomNavFabCollectionPressed: {
    backgroundColor: "#e4cf92"
  },
  searchScreen: {
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
  searchProgressRow: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.processingSoft,
    borderRadius: 8,
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
    minHeight: 34,
    paddingHorizontal: 10
  },
  searchProgressText: {
    color: colors.processing,
    ...typefaces.bold,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 16
  },
  searchActivityMark: {
    alignItems: "center",
    flexDirection: "row",
    height: 18,
    justifyContent: "center",
    width: 24
  },
  searchActivityDot: {
    backgroundColor: colors.processing,
    borderRadius: 5,
    height: 10,
    width: 10
  },
  searchActivityDotTrailing: {
    backgroundColor: colors.accent,
    marginLeft: -3
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
    backgroundColor: colors.soft
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
    backgroundColor: colors.soft,
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
  collectionSheetTitleInput: {
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
    borderWidth: StyleSheet.hairlineWidth,
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
    alignItems: "stretch"
  },
  captureImageButton: {
    alignItems: "center",
    alignSelf: "stretch",
    backgroundColor: colors.surfaceContainerHighest,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 56,
    paddingHorizontal: 14
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
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 12,
    paddingBottom: Platform.OS === "android" ? 20 : 28,
    paddingHorizontal: 22,
    paddingTop: 8
  },
  purposeSheet: {
    gap: 14,
    paddingBottom: Platform.OS === "android" ? 34 : 42
  },
  fieldRationaleBox: {
    backgroundColor: colors.surfaceContainerHigh,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  fieldRationaleTitle: {
    color: colors.secondary,
    ...typefaces.bold,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 16
  },
  fieldRationaleText: {
    color: colors.ink,
    ...typefaces.medium,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 19
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
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    flexGrow: 1,
    justifyContent: "center",
    minHeight: 48,
    minWidth: 96,
    paddingHorizontal: 12
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
  collectionSelectorSheet: {
    gap: 12,
    maxHeight: "88%",
    paddingBottom: Platform.OS === "android" ? 34 : 42
  },
  collectionSelectorSheetList: {
    flexGrow: 0,
    maxHeight: 430
  },
  collectionSelectorSheetListContent: {
    paddingBottom: 8,
    paddingRight: 2
  },
  sheetBackdrop: {
    backgroundColor: colors.scrim,
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
    borderTopWidth: StyleSheet.hairlineWidth,
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
    backgroundColor: colors.line,
    borderRadius: 3,
    height: 5,
    width: 44
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
    gap: 10
  },
  sheetActionRow: {
    alignItems: "center",
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
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
    borderColor: "#704038",
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    height: 46,
    justifyContent: "center",
    width: 46
  },
  listContent: {
    paddingBottom: 132,
    paddingTop: 0
  },
  searchResultsContent: {
    paddingBottom: 180,
    paddingTop: 4,
    paddingHorizontal: 22
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
    paddingBottom: 2,
    paddingTop: 16
  },
  captureRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    minHeight: 104,
    paddingHorizontal: 0,
    paddingVertical: 16
  },
  captureRowPressed: {
    backgroundColor: colors.surfaceContainer,
    borderRadius: 8,
    transform: [{ scale: 0.995 }]
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
    backgroundColor: colors.accentSoft,
    borderColor: colors.accentLine,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    height: 74,
    justifyContent: "center",
    overflow: "hidden",
    width: 74
  },
  sourceMarkDetail: {
    alignItems: "center",
    backgroundColor: colors.accentSoft,
    borderColor: colors.accentLine,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
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
  sourceMarkProcessing: {
    backgroundColor: colors.processingSoft,
    borderColor: "#2b526b"
  },
  sourceMarkFailed: {
    backgroundColor: colors.dangerSoft,
    borderColor: "#704038"
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
  captureThumbnailFrame: {
    backgroundColor: colors.surfaceContainer,
    borderColor: colors.line,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    height: 74,
    overflow: "hidden",
    width: 74
  },
  captureThumbnailImage: {
    height: "100%",
    width: "100%"
  },
  thumbnailRevealSlot: {
    height: 74,
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
    backgroundColor: colors.soft,
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
    ...typefaces.bold,
    flex: 1,
    fontSize: 17.5,
    fontWeight: "700",
    lineHeight: 22.5
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
    color: colors.secondary
  },
  collectionOverflowBadge: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: 6,
    flexShrink: 0,
    justifyContent: "center",
    minHeight: 18,
    minWidth: 24,
    paddingHorizontal: 5
  },
  collectionOverflowText: {
    color: colors.onAccent,
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 14
  },
  searchMatchText: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18
  },
  separator: {
    backgroundColor: colors.line,
    height: StyleSheet.hairlineWidth
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
    borderWidth: StyleSheet.hairlineWidth,
    height: 16,
    width: 16
  },
  homeEmptyRailLine: {
    backgroundColor: colors.line,
    flex: 1,
    marginVertical: 8,
    width: StyleSheet.hairlineWidth
  },
  homeEmptyRailDot: {
    backgroundColor: colors.surfaceContainerHigh,
    borderColor: colors.line,
    borderRadius: 7,
    borderWidth: StyleSheet.hairlineWidth,
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
    borderWidth: StyleSheet.hairlineWidth,
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
    backgroundColor: colors.secondary,
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
    backgroundColor: "rgba(159, 198, 227, 0.18)",
    borderColor: "rgba(159, 198, 227, 0.32)",
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    minHeight: 34
  },
  homeEmptySearchHint: {
    alignItems: "center",
    backgroundColor: colors.surfaceContainerHigh,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
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
    ...typefaces.bold,
    fontSize: 22,
    fontWeight: "700",
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
    backgroundColor: colors.soft,
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
    backgroundColor: "#9be6c2",
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
    backgroundColor: "rgba(245, 251, 247, 0.10)",
    bottom: -14,
    position: "absolute",
    top: -14,
    width: 38
  },
  captureSkeletonRow: {
    alignItems: "flex-start",
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 12,
    minHeight: 136,
    paddingVertical: 16
  },
  collectionCaptureSkeletonRow: {
    alignItems: "flex-start",
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 12,
    minHeight: 156,
    paddingVertical: 16
  },
  collectionCaptureSkeletonMain: {
    alignItems: "flex-start",
    flex: 1,
    flexDirection: "row",
    gap: 10,
    minWidth: 0
  },
  collectionCaptureSkeletonCopy: {
    flex: 1,
    gap: 8,
    minWidth: 0,
    paddingTop: 3
  },
  captureRowSkeletonInline: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    minHeight: 104,
    paddingVertical: 16
  },
  collectionCaptureSkeletonInline: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    minHeight: 108,
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
    borderColor: colors.line,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    height: 74,
    width: 74
  },
  loadingThumbnailMark: {
    borderColor: colors.line,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    height: 74,
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
    borderRadius: 6,
    height: 16,
    marginTop: 9,
    width: 58
  },
  listLoadingFooter: {
    alignItems: "center",
    paddingBottom: 12,
    paddingTop: 12
  },
  collectionDetailContent: {
    paddingBottom: 40,
    paddingHorizontal: 22,
    paddingTop: 18
  },
  collectionDetailTop: {
    gap: 12,
    paddingBottom: 8
  },
  collectionCaptureRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    paddingVertical: 16
  },
  collectionCaptureMain: {
    flex: 1,
    gap: 7
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
    backgroundColor: colors.accentSoft,
    borderRadius: 8,
    height: 36,
    justifyContent: "center",
    width: 36
  },
  collectionNoCollectionIconMark: {
    alignItems: "center",
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: 8,
    height: 36,
    justifyContent: "center",
    width: 36
  },
  collectionNoCollectionIconMarkSelected: {
    backgroundColor: colors.accentSoft
  },
  collectionRowCopy: {
    flex: 1,
    minWidth: 0
  },
  collectionCardWrap: {
    flex: 1,
    padding: 5
  },
  collectionCard: {
    gap: 9,
    minHeight: 0
  },
  collectionCardPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.985 }]
  },
  collectionCollageFrame: {
    aspectRatio: 1,
    backgroundColor: colors.surfaceContainer,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    width: "100%"
  },
  collectionCollageEmpty: {
    backgroundColor: colors.surfaceContainer,
    borderColor: colors.surfaceContainerHigh
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
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 19
  },
  collectionCardMeta: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18
  },
  removeButton: {
    paddingVertical: 4
  },
  collectionEmpty: {
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
    borderWidth: StyleSheet.hairlineWidth,
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
    borderWidth: StyleSheet.hairlineWidth,
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
    backgroundColor: colors.accentSoft,
    borderColor: colors.accentLine,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
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
    backgroundColor: colors.secondary,
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
    backgroundColor: colors.accent,
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
  collectionSettings: {
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 10,
    marginTop: 8,
    paddingTop: 16
  },
  collectionsScreen: {
    flex: 1,
    gap: 14,
    paddingHorizontal: 22,
    paddingTop: 16
  },
  collectionsTitleBlock: {
    gap: 6
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
  collectionSelectorScreen: {
    flex: 1,
    paddingHorizontal: 22,
    paddingTop: 14
  },
  collectionSelectorHeader: {
    gap: 12,
    paddingBottom: 12
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
  collectionSelectorList: {
    flex: 1
  },
  collectionSelectorListContent: {
    paddingBottom: 118,
    paddingRight: 2
  },
  collectionChoiceRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    minHeight: 76,
    paddingVertical: 15
  },
  collectionChoiceBody: {
    flex: 1,
    gap: 7,
    minWidth: 0
  },
  collectionSelectionControl: {
    alignItems: "center",
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    flexShrink: 0,
    height: 34,
    justifyContent: "center",
    marginRight: 2,
    width: 34
  },
  collectionSelectionControlSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent
  },
  collectionSelectionFooter: {
    backgroundColor: colors.paper,
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingBottom: Platform.OS === "android" ? 16 : 22,
    paddingHorizontal: 22,
    paddingTop: 10
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
    backgroundColor: colors.secondary,
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
    height: StyleSheet.hairlineWidth
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
    borderWidth: StyleSheet.hairlineWidth,
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
  reviewDetail: {
    paddingBottom: 118
  },
  reviewDetailNoFooter: {
    paddingBottom: 44
  },
  reviewFooter: {
    backgroundColor: colors.paper,
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingBottom: Platform.OS === "android" ? 16 : 22,
    paddingHorizontal: 22,
    paddingTop: 10
  },
  detailHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
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
    ...typefaces.bold,
    fontSize: 28,
    fontWeight: "700",
    lineHeight: 34,
    paddingVertical: 6
  },
  reviewMediaHeader: {
    backgroundColor: colors.surfaceContainer,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden"
  },
  reviewMediaHeaderImage: {
    aspectRatio: 1.72
  },
  reviewMediaHeaderFallback: {
    minHeight: 94,
    padding: 16
  },
  reviewMediaImage: {
    height: "100%",
    width: "100%"
  },
  reviewMediaOverlay: {
    bottom: 10,
    left: 10,
    position: "absolute",
    right: 10
  },
  reviewMediaSourcePill: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(3, 7, 5, 0.68)",
    borderColor: "rgba(238, 245, 239, 0.18)",
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: "100%",
    minHeight: 34,
    paddingHorizontal: 10,
    paddingVertical: 7
  },
  reviewMediaSourceText: {
    color: colors.ink,
    ...typefaces.bold,
    fontSize: 13,
    fontWeight: "800"
  },
  imageViewerLayer: {
    backgroundColor: "#000000",
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
    backgroundColor: "rgba(16, 20, 17, 0.72)",
    borderColor: "rgba(238, 245, 239, 0.18)",
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
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
    backgroundColor: "rgba(16, 20, 17, 0.72)",
    borderRadius: 8,
    color: colors.ink,
    ...typefaces.bold,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18,
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 7
  },
  reviewMediaFallbackContent: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12
  },
  reviewMediaFallbackCopy: {
    flex: 1,
    gap: 4,
    minWidth: 0
  },
  reviewMediaFallbackTitle: {
    color: colors.ink,
    ...typefaces.bold,
    fontSize: 17,
    fontWeight: "800"
  },
  reviewMediaFallbackText: {
    color: colors.muted,
    ...typefaces.regular,
    fontSize: 14,
    lineHeight: 20
  },
  quickEditBlock: {
    gap: 12,
    paddingHorizontal: 2
  },
  inlineMeaningBlock: {
    gap: 10,
    paddingHorizontal: 2,
    paddingVertical: 6
  },
  inlineMeaningSentence: {
    gap: 3
  },
  inlineMeaningLine: {
    color: colors.secondary,
    ...typefaces.black,
    fontSize: 26,
    fontWeight: "900",
    lineHeight: 35
  },
  inlineMeaningText: {
    color: colors.secondary,
    ...typefaces.black,
    fontSize: 26,
    fontWeight: "900",
    lineHeight: 35
  },
  inlineMeaningChipText: {
    color: colors.accent,
    ...typefaces.black,
    fontSize: 26,
    fontWeight: "900",
    lineHeight: 35
  },
  inlineMeaningChipTextPending: {
    color: colors.review
  },
  reviewPrimaryBlock: {
    gap: 10,
    paddingHorizontal: 2
  },
  reviewTitleInput: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: "700",
    lineHeight: 28,
    padding: 0,
    paddingVertical: 2
  },
  reviewMetaRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    minHeight: 36
  },
  reviewSourceCluster: {
    alignItems: "center",
    flexDirection: "row",
    flexShrink: 1,
    gap: 8,
    minWidth: 0
  },
  reviewSourceName: {
    color: colors.secondary,
    flexShrink: 1,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 19
  },
  reviewSourceTime: {
    color: colors.muted,
    fontWeight: "600"
  },
  reviewSourceImageIconPill: {
    alignItems: "center",
    backgroundColor: colors.accentSoft,
    borderColor: colors.accentLine,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    height: 24,
    justifyContent: "center",
    width: 28
  },
  reviewSourceCopyButton: {
    alignItems: "center",
    borderRadius: 8,
    height: 34,
    justifyContent: "center",
    marginLeft: -4,
    width: 34
  },
  reviewEditRail: {
    alignItems: "stretch",
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
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
    width: StyleSheet.hairlineWidth
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
    height: StyleSheet.hairlineWidth,
    marginLeft: 8,
    marginRight: 8,
    opacity: 0.72
  },
  reviewEditRailPlaceholder: {
    color: colors.accent
  },
  editRowPlaceholderText: {
    color: colors.accent
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
    borderWidth: StyleSheet.hairlineWidth,
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
    backgroundColor: colors.soft,
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
    borderWidth: StyleSheet.hairlineWidth,
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
    gap: 3
  },
  sheetTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "800"
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
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
    paddingTop: 12
  },
  reminderSheet: {
    gap: 14,
    maxHeight: "92%",
    paddingBottom: Platform.OS === "android" ? 34 : 42,
    paddingTop: 8
  },
  reminderSheetHeaderIcon: {
    backgroundColor: colors.accentSoft
  },
  reminderSheetScroll: {
    flexShrink: 1
  },
  reminderSheetScrollContent: {
    gap: 14,
    paddingBottom: 2
  },
  reminderFieldGroup: {
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth
  },
  reminderFieldSectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 9,
    minHeight: 44,
    paddingTop: 10,
    paddingBottom: 6
  },
  reminderFieldRow: {
    alignItems: "center",
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 12,
    minHeight: 64,
    paddingVertical: 12
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
  reminderFieldValue: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 21
  },
  reminderInlineAction: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: "800",
    marginLeft: "auto"
  },
  reminderNativePickerWrap: {
    backgroundColor: colors.surfaceContainerHigh,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 10,
    overflow: "hidden",
    padding: 10
  },
  reminderSummaryBlock: {
    backgroundColor: colors.surfaceContainerHigh,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 4,
    padding: 12
  },
  reminderSummaryText: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 21
  },
  reminderDurationBlock: {
    backgroundColor: colors.surfaceContainerHigh,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
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
    borderWidth: StyleSheet.hairlineWidth,
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
    borderWidth: StyleSheet.hairlineWidth,
    flexGrow: 1,
    justifyContent: "center",
    minHeight: 48,
    minWidth: 82,
    paddingHorizontal: 10
  },
  reminderUnitChipSelected: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent
  },
  reminderUnitText: {
    color: colors.secondary,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 17
  },
  reminderUnitTextSelected: {
    color: colors.accent
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
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 10,
    minHeight: 50,
    paddingTop: 10
  },
  collectionCreateBox: {
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
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
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  intentChipSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent
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
    backgroundColor: colors.soft,
    borderRadius: 8,
    color: colors.ink,
    fontSize: 15,
    minHeight: 104,
    padding: 14,
    textAlignVertical: "top"
  },
  detailInput: {
    backgroundColor: colors.soft,
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
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
    paddingTop: 16
  },
  reviewActionBlock: {
    gap: 6,
    paddingTop: 2
  },
  reviewActionGroup: {
    backgroundColor: "transparent",
    borderColor: colors.line,
    borderRadius: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    overflow: "visible"
  },
  reviewActionRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 14,
    minHeight: 54,
    paddingVertical: 12
  },
  reviewActionRowDivided: {
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth
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
    flex: 1,
    fontSize: 15,
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
  noteActionPreview: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18
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
    backgroundColor: "#9be6c2",
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
    color: "#2d0b08",
    fontSize: 16,
    fontWeight: "800"
  },
  secondaryButton: {
    alignItems: "center",
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
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
    fontSize: 16,
    fontWeight: "700"
  },
  toast: {
    alignItems: "center",
    backgroundColor: colors.surfaceContainerHighest,
    borderRadius: 12,
    bottom: Platform.OS === "android" ? 16 : 22,
    elevation: 10,
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
    left: 22,
    minHeight: 58,
    paddingHorizontal: 12,
    paddingVertical: 11,
    position: "absolute",
    right: 22,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.28,
    shadowRadius: 18,
    zIndex: 32
  },
  toastAboveBottomNav: {
    bottom: Platform.OS === "android" ? 124 : 128
  },
  toastAboveFooter: {
    bottom: Platform.OS === "android" ? 94 : 104
  },
  toastIconWell: {
    alignItems: "center",
    borderRadius: 8,
    height: 34,
    justifyContent: "center",
    width: 34
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
    borderRadius: 8,
    justifyContent: "center",
    minHeight: 36,
    paddingHorizontal: 8
  },
  toastAction: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: "800"
  },
  toastActionDestructive: {
    color: colors.danger
  }
});
