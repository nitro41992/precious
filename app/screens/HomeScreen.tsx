import type { ReactElement, ReactNode, RefObject } from "react";
import {
  Animated,
  Pressable,
  StatusBar,
  View
} from "react-native";
import type { TextInput as NativeTextInput } from "react-native";
import { FlashList } from "@shopify/flash-list";
import type { FlashListProps, ListRenderItemInfo } from "@shopify/flash-list";
import {
  Camera,
  Check,
  ImageSquare as ImageIcon,
  Link as Link2,
  MagnifyingGlass as Search,
  Plus
} from "phosphor-react-native";

import type { CaptureComposerMode, HomeListRow } from "../types";
import { normalizeCaptureLink } from "../captureLogic";
import { appTheme, colors } from "../ui/theme";
import { styles } from "../ui/styles";
import { HeaderContentGradient, IconButton, KeyboardSheet, MotionPressable, SheetHeader, keyboardSheetMetrics } from "../ui/components";
import { Text, TextInput } from "../ui/typography";

type HomeScreenProps = {
  data: {
    appSheets: ReactNode;
    bottomAppBar: ReactNode;
    captureComposerMotion: Animated.Value;
    captureKeyboardInset: Animated.Value;
    homeCaptureTotalCount: number | null;
    homeCaptures: HomeListRow[];
    listPerfProps: Partial<FlashListProps<HomeListRow>>;
    toast: ReactNode;
    sourceInputRef: RefObject<NativeTextInput | null>;
    visibleHomeRows: HomeListRow[];
    windowHeight: number;
  };
  state: {
    captureMode: CaptureComposerMode;
    capturesError: string;
    capturesLoading: boolean;
    capturesNextCursor: string | null;
    activeCapturesLoadedOnce: boolean;
    homeColdSkeletonVisible: boolean;
    homeInitialLoading: boolean;
    keyboardHeight: number;
    pickingCaptureImage: boolean;
    savingCapture: boolean;
    sessionActive: boolean;
    showCaptureComposer: boolean;
    sourceDraft: string;
  };
  actions: {
    chooseCaptureMode: (mode: CaptureComposerMode) => void;
    closeCaptureComposer: (options?: { keyboardHidden?: boolean }) => void;
    loadCaptures: () => void;
    loadMoreActiveCaptures: () => void;
    openCaptureComposer: () => void;
    openSearch: () => void;
    pickCaptureImage: () => void;
    renderCaptureSkeletonRows: (count?: number, withRemoveAction?: boolean) => ReactElement | null;
    renderHomeRow: (input: ListRenderItemInfo<HomeListRow>) => ReactElement | null;
    renderListLoadingFooter: (variant?: "captures" | "collectionCaptures" | "collections") => ReactElement | null;
    saveCaptureSource: () => void;
    setSourceDraft: (value: string) => void;
    takeCapturePhoto: () => void;
  };
};

export function HomeScreen({ actions, data, state }: HomeScreenProps) {
  const {
    appSheets,
    bottomAppBar,
    captureComposerMotion,
    captureKeyboardInset,
    homeCaptureTotalCount,
    homeCaptures,
    listPerfProps,
    toast,
    sourceInputRef,
    visibleHomeRows,
    windowHeight
  } = data;
  const {
    captureMode,
    capturesError,
    capturesLoading,
    capturesNextCursor,
    activeCapturesLoadedOnce,
    homeColdSkeletonVisible,
    homeInitialLoading,
    keyboardHeight,
    pickingCaptureImage,
    savingCapture,
    sessionActive,
    showCaptureComposer,
    sourceDraft
  } = state;
  const {
    chooseCaptureMode,
    closeCaptureComposer,
    loadCaptures,
    loadMoreActiveCaptures,
    openCaptureComposer,
    openSearch,
    pickCaptureImage,
    renderCaptureSkeletonRows,
    renderHomeRow,
    renderListLoadingFooter,
    saveCaptureSource,
    setSourceDraft,
    takeCapturePhoto
  } = actions;

  const homeCaptureRows = homeCaptures.flatMap((row) => row.type === "capture" ? [row.capture] : []);
  const homeKnownEmpty = activeCapturesLoadedOnce && !capturesLoading && !capturesError && !homeCaptureRows.length;
  const homeAwaitingCaptures = !capturesError && !homeCaptureRows.length && !homeKnownEmpty;
  const homeCaptureCount = homeCaptureTotalCount ?? (capturesNextCursor ? null : homeCaptureRows.length);
  const homeCountLabel = homeAwaitingCaptures
    ? ""
    : typeof homeCaptureCount === "number"
      ? `${homeCaptureCount} ${homeCaptureCount === 1 ? "capture" : "captures"}`
      : "";
  const {
    keyboardVisible: composerKeyboardVisible,
    screenHeight,
    maxHeight: captureSheetMaxHeight,
    bottomInset: captureSheetBottomInset
  } = keyboardSheetMetrics({
    active: showCaptureComposer,
    keyboardHeight,
    windowHeight,
    keyboardInset: captureKeyboardInset,
    maxWithKeyboard: 430,
    maxWithoutKeyboard: 560,
    withoutKeyboardScale: 0.72
  });
  const normalizedCaptureLink = normalizeCaptureLink(sourceDraft);
  const captureLinkHasText = Boolean(sourceDraft.trim());
  const captureLinkInvalid = captureMode === "link" && captureLinkHasText && !normalizedCaptureLink;

  return (
    <View style={styles.edgeToEdgeSafe}>
      <StatusBar backgroundColor={colors.transparent} barStyle={appTheme.statusBarStyle} translucent />
      <View style={styles.topAppBarScreen}>
        <View style={[styles.header, styles.topAppBarOverlay]} testID="pc.home.captures">
          <HeaderContentGradient density="compact" />
          <View style={styles.headerRow}>
            <View style={styles.headerCopy}>
              <View style={styles.headerTitleLine}>
                <Text style={styles.title}>Recents</Text>
                {homeCountLabel ? (
                  <Text numberOfLines={1} style={styles.titleCount}>
                    {homeCountLabel}
                  </Text>
                ) : null}
              </View>
            </View>
            {sessionActive ? (
              <IconButton Icon={Search} label="Search saved things" onPress={openSearch} testID="pc.home.search" />
            ) : null}
          </View>
        </View>
        <FlashList
          {...listPerfProps}
          data={visibleHomeRows}
          keyExtractor={(item) => item.id}
          renderItem={renderHomeRow}
          getItemType={(item) => item.type}
          // FlashList v2 enables maintain-visible-content-position by default,
          // which strands the rows above the scroll anchor when an item is
          // deleted mid-scroll (blank feed, can't scroll up until remount).
          // Disable it so an optimistic in-place deletion reflows cleanly.
          maintainVisibleContentPosition={{ disabled: true }}
          style={styles.homeList}
          onEndReached={loadMoreActiveCaptures}
          onEndReachedThreshold={0.35}
          ListEmptyComponent={
            homeAwaitingCaptures && (homeInitialLoading || capturesLoading) && homeColdSkeletonVisible ? (
              renderCaptureSkeletonRows(5)
            ) : homeAwaitingCaptures ? (
              <View style={styles.loadingQuietSpace} />
            ) : capturesError ? (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>Could not load captures.</Text>
                <Text style={styles.emptyText}>{capturesError}</Text>
                <Pressable onPress={loadCaptures} style={styles.secondaryButton}>
                  <Text style={styles.secondaryButtonText}>Try again</Text>
                </Pressable>
              </View>
            ) : homeKnownEmpty ? (
              <View style={styles.homeEmpty}>
                <View
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  pointerEvents="none"
                  style={styles.homeEmptyVisual}
                >
                  <View style={styles.homeEmptyRail}>
                    <View style={styles.homeEmptyRailDotActive} />
                    <View style={styles.homeEmptyRailLine} />
                    <View style={styles.homeEmptyRailDot} />
                  </View>
                  <View style={styles.homeEmptyTileStack}>
                    <View style={[styles.homeEmptyTile, styles.homeEmptyTilePrimary]}>
                      <View style={styles.homeEmptyIconMark}>
                        <Link2 color={colors.accentText} size={19} weight="regular" />
                      </View>
                      <View style={styles.homeEmptyLineGroup}>
                        <View style={styles.homeEmptyLineStrong} />
                        <View style={styles.homeEmptyLineSoft} />
                      </View>
                    </View>
                    <View style={styles.homeEmptyTileRow}>
                      <View style={[styles.homeEmptyTile, styles.homeEmptyTileSmall]}>
                        <Camera color={colors.secondary} size={20} weight="regular" />
                        <View style={styles.homeEmptyMiniLines}>
                          <View style={styles.homeEmptyMiniLine} />
                          <View style={styles.homeEmptyMiniLineShort} />
                        </View>
                      </View>
                      <View style={[styles.homeEmptyTile, styles.homeEmptyTileSmall, styles.homeEmptyTileImage]}>
                        <ImageIcon color={colors.processing} size={20} weight="regular" />
                        <View style={styles.homeEmptyImageFrame} />
                      </View>
                    </View>
                  </View>
                  <View style={styles.homeEmptySearchHint}>
                    <Search color={colors.muted} size={16} weight="regular" />
                  </View>
                </View>
                <View style={styles.homeEmptyCopy}>
                  <Text style={[styles.emptyTitle, styles.homeEmptyTitle]}>Share something in.</Text>
                  <Text style={[styles.emptyText, styles.homeEmptyText]}>
                    Use the share sheet from a browser, message, notes app, or photos.
                  </Text>
                </View>
                <MotionPressable
                  onPress={openCaptureComposer}
                  style={({ pressed }) => [styles.homeEmptyPrimary, pressed && styles.homeEmptyPrimaryPressed]}
                  testID="pc.capture.empty.open"
                >
                  <Plus color={colors.onAccent} size={20} weight="bold" />
                  <Text style={styles.homeEmptyPrimaryText}>Add link or image</Text>
                </MotionPressable>
                <View style={styles.homeEmptyCue}>
                  <Check color={colors.accentText} size={16} weight="bold" />
                  <Text style={[styles.emptyCue, styles.homeEmptyCueText]}>
                    You can review details after the capture is saved.
                  </Text>
                </View>
              </View>
            ) : null
          }
          ListFooterComponent={
            visibleHomeRows.length && capturesLoading && capturesNextCursor
              ? renderListLoadingFooter()
              : null
          }
          contentContainerStyle={[
            visibleHomeRows.length ? styles.listContent : styles.emptyContent,
            styles.topAppBarListInset
          ]}
          keyboardShouldPersistTaps="handled"
        />
      </View>
      {showCaptureComposer ? (
        <KeyboardSheet
          backdropLabel="Close capture composer"
          bottomInset={captureSheetBottomInset}
          compact={composerKeyboardVisible}
          maxHeight={captureSheetMaxHeight}
          motion={captureComposerMotion}
          onBackdropPress={() => closeCaptureComposer()}
          screenHeight={screenHeight}
        >
          <View style={styles.sheetGrabber} />
              <SheetHeader
                closeLabel="Close"
                confirmDisabled={savingCapture || !normalizedCaptureLink}
                confirmLabel={savingCapture ? "Saving capture" : "Save capture"}
                confirmTestID="pc.capture.save"
                onClose={() => closeCaptureComposer()}
                onConfirm={captureMode === "link" ? () => void saveCaptureSource() : undefined}
                title="New capture"
              />
              <View style={styles.captureModeRow}>
                {([
                  { mode: "link", label: "Link", Icon: Link2 },
                  { mode: "image", label: "Image", Icon: ImageIcon }
                ] as const).map(({ mode, label, Icon }) => {
                  const selectedMode = captureMode === mode;
                  return (
                    <MotionPressable
                      accessibilityRole="button"
                      key={mode}
                      onPress={() => chooseCaptureMode(mode)}
                      style={({ pressed }) => [
                        styles.captureModeChip,
                        selectedMode && styles.captureModeChipSelected,
                        pressed && styles.subtlePressed
                      ]}
                      testID={`pc.capture.mode.${mode}`}
                    >
                      <Icon color={selectedMode ? colors.onAccent : colors.muted} size={16} weight={selectedMode ? "fill" : "regular"} />
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.captureModeText,
                          selectedMode && styles.captureModeTextSelected
                        ]}
                      >
                        {label}
                      </Text>
                    </MotionPressable>
                  );
                })}
              </View>
              <View
                style={[
                  styles.captureSheetBody,
                  styles.captureSheetBodyContent,
                  composerKeyboardVisible && styles.captureSheetBodyContentCompact
                ]}
              >
                {captureMode === "link" ? (
                  <>
                    <TextInput
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="url"
                      multiline
                      ref={sourceInputRef}
                      onChangeText={setSourceDraft}
                      placeholder="Paste a link"
                      placeholderTextColor={colors.placeholder}
                      style={[styles.captureInput, composerKeyboardVisible && styles.captureInputCompact]}
                      testID="pc.capture.source"
                      value={sourceDraft}
                    />
                    <Text style={[styles.captureHelperText, captureLinkInvalid && styles.captureHelperTextError]}>
                      Paste a valid link, like https://example.com.
                    </Text>
                  </>
                ) : (
                  <View style={styles.captureImagePanel}>
                    <MotionPressable
                      accessibilityRole="button"
                      disabled={pickingCaptureImage}
                      onPress={takeCapturePhoto}
                      style={({ pressed }) => [
                        styles.captureImageButton,
                        pickingCaptureImage && styles.captureImageButtonDisabled,
                        pressed && styles.subtlePressed
                      ]}
                      testID="pc.capture.image.camera"
                    >
                      <View style={styles.captureImageButtonIcon}>
                        <Camera color={colors.accentTextStrong} size={21} weight="bold" />
                      </View>
                      <Text style={styles.captureImageButtonText}>Take photo</Text>
                    </MotionPressable>
                    <MotionPressable
                      accessibilityRole="button"
                      disabled={pickingCaptureImage}
                      onPress={pickCaptureImage}
                      style={({ pressed }) => [
                        styles.captureImageButton,
                        pickingCaptureImage && styles.captureImageButtonDisabled,
                        pressed && styles.subtlePressed
                      ]}
                      testID="pc.capture.image.upload"
                    >
                      <View style={styles.captureImageButtonIcon}>
                        <ImageIcon color={colors.accentTextStrong} size={21} weight="bold" />
                      </View>
                      <Text style={styles.captureImageButtonText}>Choose from photos</Text>
                    </MotionPressable>
                  </View>
                )}
              </View>
        </KeyboardSheet>
      ) : null}
      {appSheets}
      {bottomAppBar}
      {toast}
    </View>
  );
}
