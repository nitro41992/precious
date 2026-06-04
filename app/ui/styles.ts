import { Platform, StatusBar, StyleSheet } from "react-native";

import { colors, fonts, radii, type as typeScale } from "./theme";

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
    paddingTop: 18
  },
  keyboardScreen: {
    flex: 1
  },
  header: {
    gap: 10,
    paddingBottom: 18
  },
  headerRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between"
  },
  headerCopy: {
    flex: 1,
    gap: 2
  },
  kicker: {
    ...typeScale.label,
    color: colors.muted,
    textTransform: "uppercase"
  },
  title: {
    ...typeScale.display,
    color: colors.ink,
  },
  iconButton: {
    alignItems: "center",
    backgroundColor: colors.surfaceContainerHigh,
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: "center",
    minHeight: 46,
    minWidth: 46
  },
  iconButtonSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent
  },
  iconButtonDisabled: {
    opacity: 0.42
  },
  reviewQueueFilter: {
    alignItems: "center",
    alignSelf: "stretch",
    backgroundColor: colors.surfaceContainer,
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
    minHeight: 62,
    paddingHorizontal: 10,
    paddingVertical: 9,
    ...radii.archive
  },
  reviewQueueFilterActive: {
    backgroundColor: colors.reviewSoft
  },
  reviewQueueMark: {
    alignItems: "center",
    backgroundColor: colors.review,
    height: 38,
    justifyContent: "center",
    width: 38,
    ...radii.stamp
  },
  reviewQueueCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0
  },
  reviewQueueTitle: {
    color: colors.ink,
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 19
  },
  reviewQueueMeta: {
    color: colors.muted,
    fontFamily: fonts.bodySemi,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 16
  },
  reviewQueueAction: {
    color: colors.accent,
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 17
  },
  search: {
    backgroundColor: colors.surfaceContainerHigh,
    borderColor: colors.line,
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
    color: colors.ink,
    fontFamily: fonts.body,
    fontSize: 16,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  bottomNavLayer: {
    bottom: 0,
    left: 0,
    paddingBottom: Platform.OS === "android" ? 34 : 28,
    paddingHorizontal: 26,
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
    backgroundColor: "#15161b",
    borderColor: "#474b56",
    borderRadius: 30,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    flexDirection: "row",
    gap: 6,
    justifyContent: "space-between",
    minHeight: 64,
    paddingHorizontal: 8,
    paddingVertical: 7
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
    height: 44,
    justifyContent: "center",
    minWidth: 54,
    paddingHorizontal: 12
  },
  bottomNavFab: {
    alignItems: "center",
    backgroundColor: colors.create,
    borderRadius: 30,
    justifyContent: "center",
    height: 62,
    width: 62
  },
  bottomNavFabPressed: {
    backgroundColor: "#ff7a63",
    transform: [{ scale: 0.965 }]
  },
  searchScreen: {
    flex: 1
  },
  searchTop: {
    paddingHorizontal: 22,
    paddingTop: 16,
    paddingBottom: 10
  },
  searchBarRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12
  },
  searchInputWrap: {
    alignItems: "center",
    backgroundColor: colors.ink,
    borderRadius: radii.pill,
    flex: 1,
    flexDirection: "row",
    gap: 8,
    minHeight: 54,
    paddingHorizontal: 16
  },
  searchInputNative: {
    color: colors.paper,
    flex: 1,
    fontFamily: fonts.bodySemi,
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
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 15
  },
  searchProgressRow: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.processingSoft,
    borderColor: "#256983",
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
    minHeight: 34,
    paddingHorizontal: 10
  },
  searchProgressText: {
    color: colors.processing,
    fontFamily: fonts.bodyBold,
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
    borderRadius: radii.xs,
    justifyContent: "center",
    minHeight: 28,
    paddingHorizontal: 7
  },
  scopeChipSelected: {
    backgroundColor: colors.soft
  },
  scopeChipText: {
    color: colors.muted,
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    fontWeight: "700"
  },
  scopeChipTextSelected: {
    color: colors.ink
  },
  captureInput: {
    backgroundColor: colors.paper,
    borderColor: colors.line,
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
    color: colors.ink,
    fontFamily: fonts.body,
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
    backgroundColor: colors.surfaceContainerHigh,
    borderColor: colors.line,
    borderRadius: radii.sm,
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
    backgroundColor: colors.ink,
    borderColor: colors.ink
  },
  captureModeText: {
    color: colors.ink,
    fontFamily: fonts.bodyBold,
    flexShrink: 1,
    fontSize: 14,
    fontWeight: "800"
  },
  captureModeTextSelected: {
    color: colors.paper
  },
  captureImagePanel: {
    alignItems: "stretch"
  },
  captureImageButton: {
    alignItems: "center",
    alignSelf: "stretch",
    backgroundColor: colors.surfaceContainerHighest,
    borderColor: colors.line,
    borderRadius: radii.sm,
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
    fontFamily: fonts.bodyBold,
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
    backgroundColor: colors.surface,
    borderTopColor: "#454955",
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 12,
    paddingBottom: Platform.OS === "android" ? 20 : 28,
    paddingHorizontal: 22,
    paddingTop: 10
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
    backgroundColor: colors.surface,
    borderTopColor: "#454955",
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 14,
    paddingBottom: Platform.OS === "android" ? 18 : 26,
    paddingHorizontal: 22,
    paddingTop: 10
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
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    fontWeight: "800"
  },
  sheetActionDanger: {
    color: colors.danger
  },
  sheetActionText: {
    color: colors.muted,
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18
  },
  destructiveSheetIcon: {
    alignItems: "center",
    backgroundColor: colors.dangerSoft,
    borderColor: "#704038",
    borderRadius: radii.sm,
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
    ...typeScale.label,
    color: colors.muted,
    paddingBottom: 2,
    paddingTop: 18,
    textTransform: "uppercase"
  },
  captureRow: {
    alignItems: "flex-start",
    backgroundColor: colors.surfaceContainer,
    flexDirection: "row",
    gap: 12,
    minHeight: 92,
    paddingHorizontal: 12,
    paddingVertical: 13,
    ...radii.archive
  },
  captureRowPressed: {
    backgroundColor: colors.surfaceContainerHigh,
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
    backgroundColor: colors.accent,
    height: 60,
    justifyContent: "center",
    marginTop: 2,
    overflow: "hidden",
    width: 60,
    ...radii.stamp
  },
  sourceMarkDetail: {
    alignItems: "center",
    backgroundColor: colors.accentSoft,
    height: 28,
    justifyContent: "center",
    overflow: "hidden",
    width: 28,
    ...radii.stamp
  },
  sourceMarkProcessing: {
    backgroundColor: colors.processing,
    borderColor: colors.processing
  },
  sourceMarkReview: {
    backgroundColor: colors.review,
    borderColor: colors.review
  },
  sourceMarkFailed: {
    backgroundColor: colors.danger,
    borderColor: colors.danger
  },
  sourceFavicon: {
    height: 22,
    width: 22
  },
  sourceFaviconDetail: {
    height: 16,
    width: 16
  },
  sourceMarkText: {
    color: colors.onAccent,
    fontFamily: fonts.display,
    fontSize: 17,
    fontWeight: "900",
    lineHeight: 22
  },
  sourceMarkTextLong: {
    fontSize: 14,
    lineHeight: 18
  },
  captureThumbnailFrame: {
    backgroundColor: colors.surfaceContainer,
    height: 64,
    marginTop: 1,
    overflow: "hidden",
    width: 64,
    ...radii.stamp
  },
  captureThumbnailImage: {
    height: "100%",
    width: "100%"
  },
  thumbnailRevealSlot: {
    height: 66,
    position: "relative",
    width: 64
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
    flexShrink: 0,
    height: 28,
    justifyContent: "center",
    width: 28,
    ...radii.stamp
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
    fontFamily: fonts.bodyBold,
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
  rowTitleActions: {
    alignItems: "center",
    flexDirection: "row",
    flexShrink: 0,
    gap: 6
  },
  captureTitle: {
    color: colors.ink,
    flex: 1,
    fontFamily: fonts.bodyBold,
    fontSize: 18,
    fontWeight: "800",
    lineHeight: 23
  },
  status: {
    color: colors.ink,
    fontFamily: fonts.bodyBold,
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
    fontFamily: fonts.bodySemi,
    fontSize: 13,
    lineHeight: 18
  },
  notePreview: {
    color: colors.ink,
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 21
  },
  summaryPreview: {
    color: colors.muted,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20
  },
  supportPreview: {
    color: colors.muted,
    fontFamily: fonts.bodySemi,
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
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17
  },
  collectionMeaningToken: {
    backgroundColor: colors.surfaceContainerHigh,
    minHeight: 26,
    paddingLeft: 7,
    paddingRight: 8,
    paddingVertical: 4,
    ...radii.stamp
  },
  collectionMeaningTokenMulti: {
    backgroundColor: colors.accentSoft,
    paddingRight: 4
  },
  collectionMeaningTokenText: {
    color: colors.secondary
  },
  collectionOverflowBadge: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: radii.xs,
    flexShrink: 0,
    justifyContent: "center",
    minHeight: 18,
    minWidth: 24,
    paddingHorizontal: 5
  },
  collectionOverflowText: {
    color: colors.onAccent,
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 14
  },
  searchMatchText: {
    color: colors.cyan,
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18
  },
  separator: {
    backgroundColor: "transparent",
    height: 8
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
    borderRadius: radii.sm,
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
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden"
  },
  homeEmptyTilePrimary: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    minHeight: 88,
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
    backgroundColor: colors.cyanSoft
  },
  homeEmptyIconMark: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: radii.sm,
    height: 48,
    justifyContent: "center",
    width: 48
  },
  homeEmptyLineGroup: {
    flex: 1,
    gap: 9,
    minWidth: 0
  },
  homeEmptyLineStrong: {
    backgroundColor: colors.ink,
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
    backgroundColor: "rgba(148, 235, 255, 0.18)",
    borderColor: "rgba(148, 235, 255, 0.34)",
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    minHeight: 34
  },
  homeEmptySearchHint: {
    alignItems: "center",
    backgroundColor: colors.ink,
    borderColor: colors.ink,
    borderRadius: radii.pill,
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
    fontFamily: fonts.display,
    color: colors.ink,
    fontSize: 27,
    fontWeight: "800",
    lineHeight: 32,
    marginBottom: 8
  },
  emptyText: {
    color: colors.muted,
    fontFamily: fonts.body,
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
    backgroundColor: colors.surfaceContainerHigh,
    borderColor: colors.line,
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 12
  },
  promptChipText: {
    color: colors.ink,
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    fontWeight: "700"
  },
  emptyCue: {
    color: colors.muted,
    fontFamily: fonts.bodySemi,
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    maxWidth: 280
  },
  homeEmptyPrimary: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: colors.accent,
    borderRadius: radii.sm,
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
    backgroundColor: "#e8ff77",
    transform: [{ scale: 0.99 }]
  },
  homeEmptyPrimaryText: {
    color: colors.onAccent,
    fontFamily: fonts.bodyBold,
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
    backgroundColor: "#30333d",
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
    backgroundColor: colors.surfaceContainer,
    flexDirection: "row",
    gap: 12,
    minHeight: 132,
    paddingHorizontal: 12,
    paddingVertical: 16,
    ...radii.archive
  },
  collectionCaptureSkeletonRow: {
    alignItems: "stretch",
    flexDirection: "column",
    gap: 8,
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
    backgroundColor: colors.surfaceContainer,
    flexDirection: "row",
    gap: 12,
    minHeight: 92,
    paddingHorizontal: 12,
    paddingVertical: 14,
    ...radii.archive
  },
  collectionCaptureSkeletonInline: {
    alignItems: "stretch",
    flexDirection: "column",
    gap: 8,
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
    ...radii.stamp,
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
    height: 52,
    marginTop: 2,
    width: 52,
    ...radii.stamp
  },
  loadingThumbnailMark: {
    height: 64,
    marginTop: 1,
    width: 64,
    ...radii.stamp
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
    marginLeft: "auto",
    width: 128
  },
  collectionLoadingActionInline: {
    alignSelf: "flex-start",
    borderRadius: 6,
    flexShrink: 0,
    height: 30,
    marginLeft: 4,
    width: 72
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
    alignItems: "stretch",
    flexDirection: "column",
    paddingVertical: 10
  },
  collectionCaptureMain: {
    gap: 7,
    width: "100%"
  },
  collectionRow: {
    backgroundColor: colors.surfaceContainer,
    gap: 7,
    minHeight: 92,
    paddingHorizontal: 12,
    paddingVertical: 14,
    ...radii.archive
  },
  collectionRowTop: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10
  },
  collectionIconMark: {
    alignItems: "center",
    backgroundColor: colors.cyan,
    height: 42,
    justifyContent: "center",
    width: 42,
    ...radii.stamp
  },
  collectionInitialMark: {
    alignItems: "center",
    height: 48,
    justifyContent: "center",
    width: 48,
    ...radii.stamp
  },
  collectionInitialText: {
    fontFamily: fonts.display,
    fontSize: 16,
    fontWeight: "900",
    lineHeight: 20
  },
  collectionNoCollectionIconMark: {
    alignItems: "center",
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: radii.sm,
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
  collectionRowRemoveAction: {
    alignItems: "center",
    backgroundColor: colors.createSoft,
    justifyContent: "center",
    minHeight: 32,
    paddingHorizontal: 9,
    paddingVertical: 5,
    ...radii.stamp
  },
  collectionRowRemoveActionText: {
    color: colors.create,
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    fontWeight: "900",
    lineHeight: 16
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
    borderRadius: radii.sm,
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
    backgroundColor: colors.review,
    borderColor: colors.review,
    borderRadius: radii.sm,
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
    backgroundColor: colors.create,
    borderColor: colors.create,
    borderRadius: radii.sm,
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
    backgroundColor: colors.ink,
    borderColor: colors.paper,
    borderRadius: radii.pill,
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
    gap: 16,
    paddingHorizontal: 22,
    paddingTop: 18
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
    backgroundColor: colors.surfaceContainerHigh,
    borderColor: colors.line,
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
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
    borderRadius: radii.sm,
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
    paddingBottom: 82,
    paddingTop: 38
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
    fontSize: 42,
    lineHeight: 45,
    marginBottom: 8,
    textAlign: "center"
  },
  authSuccessMark: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: colors.accent,
    borderRadius: radii.sm,
    height: 58,
    justifyContent: "center",
    width: 58
  },
  authGoogleButton: {
    alignItems: "center",
    backgroundColor: colors.ink,
    borderRadius: radii.sm,
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
    borderRadius: radii.sm,
    height: 32,
    justifyContent: "center",
    width: 32
  },
  authGoogleMarkText: {
    color: colors.ink,
    fontFamily: fonts.display,
    fontSize: 18,
    fontWeight: "900"
  },
  authGoogleButtonText: {
    color: colors.paper,
    fontFamily: fonts.bodyBold,
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
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    fontWeight: "700"
  },
  authEmailInput: {
    backgroundColor: colors.surfaceContainerHigh,
    borderColor: colors.line,
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
    color: colors.ink,
    fontFamily: fonts.body,
    fontSize: 16,
    minHeight: 54,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  authEmailButton: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: radii.sm,
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
    fontFamily: fonts.bodySemi,
    fontSize: 16,
    fontWeight: "600"
  },
  titleInput: {
    color: colors.ink,
    fontFamily: fonts.display,
    fontSize: 28,
    fontWeight: "700",
    lineHeight: 34,
    paddingVertical: 6
  },
  reviewMediaHeader: {
    backgroundColor: colors.surfaceContainer,
    overflow: "hidden",
    ...radii.archive
  },
  reviewMediaHeaderImage: {
    aspectRatio: 1.55
  },
  reviewMediaHeaderFallback: {
    backgroundColor: colors.surfaceContainerHigh,
    minHeight: 118,
    padding: 18
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
    maxWidth: "100%",
    minHeight: 34,
    paddingHorizontal: 10,
    paddingVertical: 7,
    ...radii.stamp
  },
  reviewMediaSourceText: {
    color: colors.ink,
    fontFamily: fonts.bodyBold,
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
    borderRadius: radii.sm,
    color: colors.ink,
    fontFamily: fonts.bodyBold,
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
    fontFamily: fonts.bodyBold,
    fontSize: 17,
    fontWeight: "800"
  },
  reviewMediaFallbackText: {
    color: colors.muted,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20
  },
  quickEditBlock: {
    gap: 10,
    paddingHorizontal: 2
  },
  reviewDecisionDock: {
    backgroundColor: colors.surfaceContainer,
    gap: 12,
    padding: 10,
    ...radii.archive
  },
  reviewDecisionDockReview: {
    backgroundColor: colors.reviewSoft
  },
  reviewDecisionHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    minHeight: 52
  },
  reviewDecisionSignal: {
    alignItems: "center",
    backgroundColor: colors.accent,
    height: 42,
    justifyContent: "center",
    width: 42,
    ...radii.stamp
  },
  reviewDecisionSignalReview: {
    backgroundColor: colors.review
  },
  reviewDecisionHeaderCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0
  },
  reviewDecisionEyebrow: {
    color: colors.ink,
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 17
  },
  reviewDecisionSummary: {
    color: colors.muted,
    fontFamily: fonts.bodySemi,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18
  },
  reviewInsightButton: {
    alignItems: "center",
    backgroundColor: colors.paper,
    justifyContent: "center",
    minHeight: 44,
    minWidth: 54,
    paddingHorizontal: 12,
    ...radii.stamp
  },
  reviewInsightButtonText: {
    color: colors.accent,
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 17
  },
  reviewInlineSaveButton: {
    alignItems: "center",
    backgroundColor: colors.accent,
    justifyContent: "center",
    minHeight: 44,
    minWidth: 92,
    paddingHorizontal: 12,
    ...radii.stamp
  },
  reviewInlineSaveText: {
    color: colors.onAccent,
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 17
  },
  reviewDecisionTiles: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  reviewDecisionTile: {
    backgroundColor: colors.surfaceContainerHigh,
    flex: 1,
    gap: 4,
    justifyContent: "center",
    minHeight: 68,
    minWidth: 118,
    paddingHorizontal: 10,
    paddingVertical: 9,
    ...radii.stamp
  },
  reviewDecisionTilePrimary: {
    backgroundColor: colors.accent,
    flexBasis: "100%",
    minHeight: 76
  },
  reviewDecisionTileLabel: {
    color: colors.muted,
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    fontWeight: "900",
    lineHeight: 14,
    textTransform: "uppercase"
  },
  reviewDecisionTileValue: {
    color: colors.ink,
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 20
  },
  reviewDecisionTileValuePrimary: {
    color: colors.onAccent,
    fontFamily: fonts.display,
    fontSize: 27,
    fontWeight: "900",
    lineHeight: 32
  },
  reviewPrimaryBlock: {
    gap: 8,
    paddingHorizontal: 2
  },
  reviewTitleInput: {
    color: colors.ink,
    fontFamily: fonts.display,
    fontSize: 34,
    fontWeight: "800",
    lineHeight: 39,
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
    fontFamily: fonts.bodySemi,
    fontSize: 13,
    lineHeight: 18
  },
  reviewEditRail: {
    alignItems: "stretch",
    backgroundColor: colors.surfaceContainer,
    flexDirection: "row",
    minHeight: 96,
    overflow: "hidden",
    padding: 8,
    ...radii.archive
  },
  reviewEditRailIntent: {
    backgroundColor: colors.accent,
    gap: 4,
    justifyContent: "center",
    minHeight: 78,
    minWidth: 112,
    paddingHorizontal: 10,
    width: 118,
    ...radii.stamp
  },
  reviewEditRailIntentActive: {
    backgroundColor: colors.cyan
  },
  reviewEditRailPressed: {
    backgroundColor: colors.surfaceContainerHigh
  },
  reviewEditRailLabel: {
    color: colors.onAccent,
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0,
    lineHeight: 14
  },
  reviewEditRailIntentValue: {
    color: colors.onAccent,
    fontFamily: fonts.display,
    fontSize: 22,
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
    flexDirection: "row",
    gap: 10,
    minHeight: 36,
    minWidth: 0,
    paddingHorizontal: 8,
    paddingVertical: 4,
    ...radii.stamp
  },
  reviewEditRailDetailLabel: {
    color: colors.muted,
    flexShrink: 0,
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0,
    lineHeight: 16,
    width: 68
  },
  reviewEditRailDetailValue: {
    color: colors.ink,
    flex: 1,
    fontFamily: fonts.bodyBold,
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
    color: colors.cyan
  },
  editRowPlaceholderText: {
    color: colors.accent
  },
  reviewSentenceSubtext: {
    color: colors.muted,
    fontFamily: fonts.bodySemi,
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
    fontFamily: fonts.bodySemi,
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
    borderRadius: radii.sm,
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between",
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  changeText: {
    color: colors.muted,
    fontFamily: fonts.bodySemi,
    flex: 1,
    fontSize: 13,
    fontWeight: "700"
  },
  rationaleBlock: {
    alignItems: "center",
    backgroundColor: colors.soft,
    borderRadius: radii.sm,
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  becauseText: {
    color: colors.muted,
    fontFamily: fonts.body,
    flex: 1,
    fontSize: 14,
    lineHeight: 20
  },
  reviewCallout: {
    backgroundColor: colors.reviewSoft,
    borderRadius: radii.sm,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  reviewCalloutCopy: {
    gap: 3
  },
  reviewCalloutLabel: {
    color: colors.review,
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase"
  },
  reviewCalloutText: {
    color: colors.ink,
    fontFamily: fonts.bodyBold,
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
    borderRadius: radii.sm,
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
    fontFamily: fonts.display,
    color: colors.ink,
    fontSize: 22,
    fontWeight: "800"
  },
  sheetSubtitle: {
    color: colors.muted,
    fontFamily: fonts.body,
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
    paddingTop: 10
  },
  reminderSheet: {
    gap: 14,
    maxHeight: "92%",
    paddingBottom: Platform.OS === "android" ? 34 : 42,
    paddingTop: 8
  },
  reminderSheetHeaderIcon: {
    backgroundColor: colors.cyan
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
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 17
  },
  reminderFieldValue: {
    color: colors.ink,
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 21
  },
  reminderInlineAction: {
    color: colors.accent,
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    fontWeight: "800",
    marginLeft: "auto"
  },
  reminderNativePickerWrap: {
    backgroundColor: colors.surfaceContainerHigh,
    borderColor: colors.line,
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 10,
    overflow: "hidden",
    padding: 10
  },
  reminderSummaryBlock: {
    backgroundColor: colors.surfaceContainerHigh,
    borderColor: colors.line,
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 4,
    padding: 12
  },
  reminderSummaryText: {
    color: colors.ink,
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 21
  },
  reminderDurationBlock: {
    backgroundColor: colors.surfaceContainerHigh,
    borderColor: colors.line,
    borderRadius: radii.sm,
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
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
    color: colors.ink,
    fontFamily: fonts.bodyBold,
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
    borderRadius: radii.sm,
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
    fontFamily: fonts.bodyBold,
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
    paddingBottom: 20
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
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 17
  },
  reviewChecklistCount: {
    alignItems: "center",
    backgroundColor: colors.reviewSoft,
    borderRadius: radii.sm,
    justifyContent: "center",
    minHeight: 24,
    minWidth: 24,
    paddingHorizontal: 7
  },
  reviewChecklistCountText: {
    color: colors.review,
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 16
  },
  reviewChecklistTask: {
    alignItems: "flex-start",
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 8,
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
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 21
  },
  reviewChecklistActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: 2
  },
  reviewChecklistDecisionRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    paddingTop: 4
  },
  reviewDecisionButton: {
    alignItems: "center",
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: "center",
    minHeight: 44,
    minWidth: 54
  },
  reviewDecisionButtonYes: {
    backgroundColor: colors.accent,
    borderColor: colors.accent
  },
  reviewDecisionButtonText: {
    color: colors.secondary,
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 19
  },
  reviewDecisionButtonYesText: {
    color: colors.onAccent,
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 19
  },
  reviewTaskAction: {
    alignItems: "center",
    borderRadius: radii.sm,
    justifyContent: "center",
    minHeight: 44,
    minWidth: 38
  },
  reviewTaskActionPrimary: {
    backgroundColor: "transparent"
  },
  reviewTaskActionDanger: {
    backgroundColor: "transparent"
  },
  rationaleIntentOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingTop: 8
  },
  rationaleIntentOption: {
    alignItems: "center",
    backgroundColor: colors.surfaceContainerHigh,
    borderColor: colors.line,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.sm,
    justifyContent: "center",
    minHeight: 42,
    paddingHorizontal: 15,
    paddingVertical: 8
  },
  rationaleIntentOptionSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent
  },
  rationaleIntentOptionText: {
    color: colors.ink,
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 19,
    textAlign: "center"
  },
  rationaleIntentOptionTextSelected: {
    color: colors.onAccent
  },
  rationaleSheetHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12
  },
  rationaleSheetHeaderIcon: {
    alignItems: "center",
    backgroundColor: colors.accentSoft,
    borderRadius: radii.sm,
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
    fontFamily: fonts.bodySemi,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18
  },
  rationaleSheetLead: {
    color: colors.ink,
    fontFamily: fonts.bodySemi,
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
    fontFamily: fonts.bodyBold,
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
    borderRadius: radii.sm,
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
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 17
  },
  rationaleSheetText: {
    color: colors.secondary,
    fontFamily: fonts.bodySemi,
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 21
  },
  currentChoiceRow: {
    alignItems: "center",
    backgroundColor: colors.accentSoft,
    borderRadius: radii.sm,
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
    borderRadius: radii.sm,
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
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    fontWeight: "700",
    minWidth: 72,
    textTransform: "uppercase"
  },
  suggestionState: {
    color: colors.muted,
    fontFamily: fonts.bodyBold,
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
    fontFamily: fonts.bodyBold,
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
    fontFamily: fonts.bodyBold,
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
    fontFamily: fonts.bodyBold,
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
    borderRadius: radii.sm,
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
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    fontWeight: "700"
  },
  intentChipTextSelected: {
    color: colors.onAccent
  },
  noteInput: {
    backgroundColor: colors.surfaceContainerHigh,
    borderColor: colors.line,
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
    color: colors.ink,
    fontFamily: fonts.body,
    fontSize: 15,
    minHeight: 104,
    padding: 14,
    textAlignVertical: "top"
  },
  detailInput: {
    backgroundColor: colors.surfaceContainerHigh,
    borderColor: colors.line,
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
    color: colors.ink,
    fontFamily: fonts.body,
    fontSize: 16,
    lineHeight: 22,
    minHeight: 56,
    padding: 14,
    textAlignVertical: "top"
  },
  sourceBlock: {
    backgroundColor: colors.surfaceContainer,
    gap: 8,
    padding: 14,
    ...radii.archive
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
    borderRadius: radii.sm,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 2
  },
  compactActionRow: {
    alignItems: "center",
    borderRadius: radii.sm,
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
    minHeight: 50,
    paddingVertical: 4
  },
  compactActionText: {
    color: colors.ink,
    flex: 1,
    fontFamily: fonts.bodyBold,
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
    fontFamily: fonts.body,
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
    color: colors.accent,
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    fontWeight: "700"
  },
  hintText: {
    color: colors.muted,
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase"
  },
  noteSaveState: {
    color: colors.muted,
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    fontWeight: "700"
  },
  noteSaveStateError: {
    color: colors.danger
  },
  sourceText: {
    color: colors.ink,
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 22
  },
  supportingText: {
    color: colors.muted,
    fontFamily: fonts.body,
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
    borderRadius: radii.sm,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  smallButtonText: {
    color: colors.onAccent,
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    fontWeight: "700"
  },
  errorText: {
    color: colors.danger,
    fontFamily: fonts.bodySemi,
    fontSize: 14,
    lineHeight: 21
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: radii.sm,
    justifyContent: "center",
    minHeight: 54,
    paddingHorizontal: 16,
    paddingVertical: 14
  },
  primaryButtonContent: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "center"
  },
  primaryButtonPressed: {
    backgroundColor: "#e8ff77",
    transform: [{ scale: 0.99 }]
  },
  disabledButton: {
    opacity: 0.45
  },
  primaryButtonText: {
    color: colors.onAccent,
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    fontWeight: "800"
  },
  destructiveButton: {
    backgroundColor: colors.danger
  },
  destructiveButtonText: {
    color: "#2d0b08",
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    fontWeight: "800"
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: colors.surfaceContainerHigh,
    borderColor: colors.line,
    borderRadius: radii.sm,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 50,
    paddingVertical: 14
  },
  secondaryButtonText: {
    color: colors.ink,
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    fontWeight: "700"
  },
  dangerButtonText: {
    color: colors.danger,
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    fontWeight: "700"
  },
  toast: {
    alignItems: "center",
    backgroundColor: colors.surfaceContainer,
    borderColor: "#474b56",
    borderRadius: radii.sm,
    bottom: Platform.OS === "android" ? 16 : 22,
    borderWidth: StyleSheet.hairlineWidth,
    elevation: 4,
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
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
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
    borderRadius: radii.sm,
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
    fontFamily: fonts.bodySemi,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 19
  },
  toastActionButton: {
    alignItems: "center",
    borderRadius: radii.sm,
    justifyContent: "center",
    minHeight: 36,
    paddingHorizontal: 8
  },
  toastAction: {
    color: colors.accent,
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    fontWeight: "800"
  },
  toastActionDestructive: {
    color: colors.danger
  }
});
