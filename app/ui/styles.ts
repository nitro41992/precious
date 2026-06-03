import { Platform, StatusBar, StyleSheet } from "react-native";

import { colors } from "./theme";

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
    paddingTop: 16
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
    gap: 4
  },
  kicker: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0
  },
  title: {
    color: colors.ink,
    fontSize: 26,
    fontWeight: "700",
    letterSpacing: 0,
    lineHeight: 31
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
  quickLookSummary: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.reviewSoft,
    borderRadius: 8,
    flexDirection: "row",
    gap: 6,
    marginTop: 10,
    minHeight: 36,
    paddingHorizontal: 10
  },
  quickLookSummaryText: {
    color: colors.review,
    fontSize: 13,
    fontWeight: "700"
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
    paddingBottom: Platform.OS === "android" ? 34 : 28,
    paddingHorizontal: 40,
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
    borderRadius: 30,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    flexDirection: "row",
    gap: 6,
    justifyContent: "space-between",
    minHeight: 60,
    paddingHorizontal: 8,
    paddingVertical: 6
  },
  bottomNavItem: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    minHeight: 48,
    minWidth: 0,
    paddingHorizontal: 2
  },
  bottomNavItemPressed: {
    transform: [{ scale: 0.985 }]
  },
  bottomNavIconWrap: {
    alignItems: "center",
    borderRadius: 22,
    height: 42,
    justifyContent: "center",
    minWidth: 54,
    paddingHorizontal: 12
  },
  bottomNavIconWrapSelected: {},
  bottomNavFab: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: 30,
    justifyContent: "center",
    height: 60,
    width: 60
  },
  bottomNavFabPressed: {
    backgroundColor: "#96e5bf",
    transform: [{ scale: 0.965 }]
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
    gap: 10,
    minHeight: 76,
    paddingHorizontal: 0,
    paddingVertical: 14
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
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    height: 52,
    justifyContent: "center",
    marginTop: 2,
    overflow: "hidden",
    width: 52
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
  sourceMarkProcessing: {
    backgroundColor: colors.processingSoft,
    borderColor: "#2b526b"
  },
  sourceMarkReview: {
    backgroundColor: colors.reviewSoft,
    borderColor: "#6c5324"
  },
  sourceMarkFailed: {
    backgroundColor: colors.dangerSoft,
    borderColor: "#704038"
  },
  sourceFavicon: {
    height: 22,
    width: 22
  },
  sourceFaviconDetail: {
    height: 16,
    width: 16
  },
  sourceFaviconOverlay: {
    position: "absolute"
  },
  captureThumbnailFrame: {
    backgroundColor: colors.surfaceContainer,
    borderColor: colors.line,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    height: 58,
    marginTop: 1,
    overflow: "hidden",
    width: 58
  },
  captureThumbnailImage: {
    height: "100%",
    width: "100%"
  },
  thumbnailRevealSlot: {
    height: 60,
    position: "relative",
    width: 58
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
  statusGlyphReview: {
    backgroundColor: colors.reviewSoft
  },
  statusGlyphFailed: {
    backgroundColor: colors.dangerSoft
  },
  rowContent: {
    flex: 1,
    gap: 4,
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
    fontSize: 17,
    fontWeight: "600",
    lineHeight: 22
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
    gap: 8,
    paddingTop: 1
  },
  meaningToken: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
    maxWidth: "100%",
    minWidth: 0
  },
  meaningTokenText: {
    color: colors.muted,
    flexShrink: 1,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17
  },
  collectionMeaningToken: {
    backgroundColor: colors.surfaceContainer,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 26,
    paddingLeft: 7,
    paddingRight: 8,
    paddingVertical: 4
  },
  collectionMeaningTokenMulti: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accentLine,
    paddingRight: 4
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
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 8
  },
  emptyText: {
    color: colors.muted,
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
    minHeight: 132,
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
    gap: 10,
    minHeight: 76,
    paddingVertical: 14
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
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    height: 52,
    marginTop: 2,
    width: 52
  },
  loadingThumbnailMark: {
    borderColor: colors.line,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    height: 58,
    marginTop: 1,
    width: 58
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
    paddingBottom: 132
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
    fontSize: 18,
    fontWeight: "900"
  },
  authGoogleButtonText: {
    color: colors.paper,
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
    fontSize: 13,
    fontWeight: "700"
  },
  authEmailInput: {
    backgroundColor: colors.surfaceContainer,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    color: colors.ink,
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
    fontSize: 16,
    fontWeight: "600"
  },
  titleInput: {
    color: colors.ink,
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
    fontSize: 17,
    fontWeight: "800"
  },
  reviewMediaFallbackText: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20
  },
  quickEditBlock: {
    gap: 10,
    paddingHorizontal: 2
  },
  reviewInsightCard: {
    alignItems: "center",
    borderRadius: 8,
    flexDirection: "row",
    gap: 10,
    minHeight: 56,
    paddingHorizontal: 2,
    paddingVertical: 8
  },
  reviewInsightCardReview: {
    backgroundColor: colors.reviewSoft,
    minHeight: 68,
    paddingHorizontal: 12,
    paddingVertical: 12
  },
  reviewInsightIcon: {
    alignItems: "center",
    backgroundColor: "transparent",
    borderRadius: 8,
    height: 32,
    justifyContent: "center",
    width: 32
  },
  reviewInsightIconReview: {
    backgroundColor: colors.surfaceContainerHigh
  },
  reviewInsightCopy: {
    flex: 1,
    gap: 4,
    minWidth: 0
  },
  reviewInsightHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between"
  },
  reviewInsightTitle: {
    color: colors.ink,
    flex: 1,
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 19
  },
  reviewInsightAction: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 16
  },
  reviewInsightCountBadge: {
    alignItems: "center",
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: 8,
    justifyContent: "center",
    minHeight: 24,
    minWidth: 24,
    paddingHorizontal: 7
  },
  reviewInsightCountText: {
    color: colors.review,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 16
  },
  reviewInsightSummary: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 19
  },
  reviewPrimaryBlock: {
    gap: 8,
    paddingHorizontal: 2
  },
  reviewTitleInput: {
    color: colors.ink,
    fontSize: 27,
    fontWeight: "800",
    lineHeight: 33,
    padding: 0,
    paddingVertical: 2
  },
  reviewSourceRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    minHeight: 30
  },
  reviewSourceMeta: {
    color: colors.muted,
    flex: 1,
    fontSize: 13,
    lineHeight: 18
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
  reviewInsightSheet: {
    gap: 15,
    maxHeight: "90%",
    paddingBottom: Platform.OS === "android" ? 36 : 44,
    paddingTop: 8
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
  reviewInsightScroll: {
    flexGrow: 0
  },
  reviewInsightScrollContent: {
    gap: 18,
    paddingBottom: 2
  },
  reviewChecklist: {
    gap: 0,
    paddingTop: 2
  },
  reviewChecklistHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 32,
    paddingBottom: 4
  },
  reviewChecklistLabel: {
    color: colors.review,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 17
  },
  reviewChecklistCount: {
    alignItems: "center",
    backgroundColor: colors.reviewSoft,
    borderRadius: 8,
    justifyContent: "center",
    minHeight: 24,
    minWidth: 24,
    paddingHorizontal: 7
  },
  reviewChecklistCountText: {
    color: colors.review,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 16
  },
  reviewChecklistTask: {
    alignItems: "flex-start",
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 6,
    minHeight: 88,
    paddingVertical: 14
  },
  reviewChecklistCopy: {
    flex: 1,
    gap: 6,
    minWidth: 0
  },
  reviewChecklistTaskTop: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between"
  },
  reviewChecklistTaskText: {
    flex: 1,
    gap: 3,
    minWidth: 0
  },
  reviewChecklistValue: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 21
  },
  reviewChecklistActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4
  },
  rationaleIntentOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingTop: 4
  },
  rationaleIntentOption: {
    alignItems: "center",
    backgroundColor: colors.surfaceContainer,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: "center",
    minHeight: 40,
    paddingHorizontal: 11,
    paddingVertical: 7
  },
  rationaleIntentOptionSelected: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent
  },
  rationaleIntentOptionText: {
    color: colors.secondary,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 17
  },
  rationaleIntentOptionTextSelected: {
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
  rationaleSheetHeaderIconReview: {
    backgroundColor: colors.reviewSoft
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
  rationaleSheetLead: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 23,
    paddingHorizontal: 2,
    paddingTop: 2
  },
  rationaleSheetSections: {
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 0,
    marginTop: 0
  },
  rationaleSheetSectionHeader: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 17,
    paddingTop: 12,
    paddingBottom: 2
  },
  rationaleSheetSection: {
    alignItems: "flex-start",
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 5,
    minHeight: 72,
    paddingVertical: 14
  },
  rationaleSheetSectionIcon: {
    alignItems: "center",
    borderRadius: 14,
    height: 42,
    justifyContent: "center",
    marginRight: 8,
    width: 42
  },
  rationaleSheetSectionIconIntent: {
    backgroundColor: colors.accentSoft
  },
  rationaleSheetSectionIconCollection: {
    backgroundColor: colors.processingSoft
  },
  rationaleSheetSectionIconReminder: {
    backgroundColor: colors.reviewSoft
  },
  rationaleSheetSectionIconAnalysis: {
    backgroundColor: colors.surfaceContainerHigh
  },
  rationaleSheetSectionCopy: {
    flex: 1,
    gap: 5,
    minWidth: 0
  },
  rationaleSheetLabel: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 17
  },
  rationaleSheetText: {
    color: colors.secondary,
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 21
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
  mapTargetRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    minHeight: 46,
    paddingVertical: 2
  },
  mapTargetCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0
  },
  mapActionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  mapActionButton: {
    alignSelf: "flex-start",
    borderRadius: 8,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 2
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
  sourceDisclosureRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
    minHeight: 50
  },
  sourceDisclosureCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0
  },
  sourceDisclosureActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: 2
  },
  destructiveRow: {
    alignItems: "center",
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 10,
    minHeight: 52,
    paddingTop: 12
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
  primaryButtonPressed: {
    backgroundColor: "#9be6c2",
    transform: [{ scale: 0.99 }]
  },
  reviewConfirmButton: {
    minHeight: 56
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
