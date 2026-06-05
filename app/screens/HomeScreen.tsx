import type { ReactElement, ReactNode, RefObject } from "react";
import {
  Animated,
  Dimensions,
  FlatList,
  KeyboardAvoidingView,
  Pressable,
  SafeAreaView,
  StatusBar,
  Text,
  TextInput,
  View
} from "react-native";
import type { FlatListProps, ListRenderItemInfo } from "react-native";
import {
  Check,
  ImageSquare as ImageIcon,
  Link as Link2,
  MagnifyingGlass as Search,
  Note as StickyNote,
  Plus,
  X
} from "phosphor-react-native";

import type { CaptureComposerMode, HomeListRow } from "../types";
import { colors } from "../ui/theme";
import { styles } from "../ui/styles";
import { IconButton } from "../ui/components";

type HomeScreenProps = {
  data: {
    appSheets: ReactNode;
    bottomAppBar: ReactNode;
    captureComposerMotion: Animated.Value;
    captureKeyboardInset: Animated.Value;
    homeCaptures: HomeListRow[];
    listPerfProps: Partial<FlatListProps<HomeListRow>>;
    toast: ReactNode;
    sourceInputRef: RefObject<TextInput | null>;
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
    closeCaptureComposer: () => void;
    loadCaptures: () => void;
    loadMoreActiveCaptures: () => void;
    openCaptureComposer: () => void;
    openSearch: () => void;
    renderCaptureSkeletonRows: (count?: number, withRemoveAction?: boolean) => ReactElement | null;
    renderHomeRow: (input: ListRenderItemInfo<HomeListRow>) => ReactElement | null;
    renderListLoadingFooter: (label?: string) => ReactElement | null;
    saveCaptureSource: () => void;
    setSourceDraft: (value: string) => void;
  };
};

export function HomeScreen({ actions, data, state }: HomeScreenProps) {
  const {
    appSheets,
    bottomAppBar,
    captureComposerMotion,
    captureKeyboardInset,
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
    renderCaptureSkeletonRows,
    renderHomeRow,
    renderListLoadingFooter,
    saveCaptureSource,
    setSourceDraft
  } = actions;

  const homeCaptureRows = homeCaptures.flatMap((row) => row.type === "capture" ? [row.capture] : []);
  const homeKnownEmpty = activeCapturesLoadedOnce && !capturesLoading && !capturesError && !homeCaptureRows.length;
  const homeAwaitingCaptures = !capturesError && !homeCaptureRows.length && !homeKnownEmpty;
  const homeCountLabel = homeAwaitingCaptures
    ? ""
    : `${homeCaptureRows.length} ${homeCaptureRows.length === 1 ? "capture" : "captures"}`;
  const composerKeyboardVisible = showCaptureComposer && keyboardHeight > 0;
  const screenHeight = Dimensions.get("screen").height;
  const windowAlreadyKeyboardSized =
    composerKeyboardVisible && Math.abs(windowHeight + keyboardHeight - screenHeight) < 96;
  const composerVisibleHeight = composerKeyboardVisible && !windowAlreadyKeyboardSized
    ? windowHeight - keyboardHeight
    : windowHeight;
  const composerAvailableHeight = composerKeyboardVisible
    ? Math.max(320, composerVisibleHeight - 24)
    : Math.max(360, windowHeight * 0.72);
  const captureSheetMaxHeight = composerKeyboardVisible
    ? Math.min(430, composerAvailableHeight)
    : Math.min(560, Math.max(340, windowHeight * 0.72));
  const captureSourcePlaceholder = captureMode === "link" ? "Paste a link" : "Write a note";
  const captureSheetBottomInset = windowAlreadyKeyboardSized ? 0 : captureKeyboardInset;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />
      <View style={styles.container}>
        <View style={styles.header} testID="pc.home.captures">
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
        <FlatList
          {...listPerfProps}
          data={visibleHomeRows}
          keyExtractor={(item) => item.id}
          renderItem={renderHomeRow}
          onEndReached={loadMoreActiveCaptures}
          onEndReachedThreshold={0.35}
          ItemSeparatorComponent={({ leadingItem }) =>
            leadingItem?.type === "section" ? null : <View style={styles.separator} />
          }
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
                        <Link2 color={colors.accent} size={19} weight="regular" />
                      </View>
                      <View style={styles.homeEmptyLineGroup}>
                        <View style={styles.homeEmptyLineStrong} />
                        <View style={styles.homeEmptyLineSoft} />
                      </View>
                    </View>
                    <View style={styles.homeEmptyTileRow}>
                      <View style={[styles.homeEmptyTile, styles.homeEmptyTileSmall]}>
                        <StickyNote color={colors.secondary} size={20} weight="regular" />
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
                <Pressable
                  onPress={openCaptureComposer}
                  style={({ pressed }) => [styles.homeEmptyPrimary, pressed && styles.homeEmptyPrimaryPressed]}
                  testID="pc.capture.empty.open"
                >
                  <Plus color={colors.onAccent} size={20} weight="bold" />
                  <Text style={styles.homeEmptyPrimaryText}>Paste link or note</Text>
                </Pressable>
                <View style={styles.homeEmptyCue}>
                  <Check color={colors.accent} size={16} weight="bold" />
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
          contentContainerStyle={visibleHomeRows.length ? styles.listContent : styles.emptyContent}
          keyboardShouldPersistTaps="handled"
        />
      </View>
      {showCaptureComposer ? (
        <View style={styles.sheetLayer} pointerEvents="box-none">
          <Pressable
            accessibilityLabel="Close capture composer"
            onPress={closeCaptureComposer}
            style={styles.sheetBackdrop}
          />
          <KeyboardAvoidingView pointerEvents="box-none" style={styles.sheetKeyboard}>
            <Animated.View
              style={[
                styles.captureSheet,
                composerKeyboardVisible && styles.captureSheetCompact,
                {
                  marginBottom: captureSheetBottomInset,
                  maxHeight: captureSheetMaxHeight,
                  opacity: captureComposerMotion,
                  transform: [
                    {
                      translateY: captureComposerMotion.interpolate({
                        inputRange: [0, 1],
                        outputRange: [28, 0]
                      })
                    }
                  ]
                }
              ]}
            >
              <View style={styles.sheetGrabber} />
              <View style={styles.captureSheetHeader}>
                <View style={styles.sheetHeaderCopy}>
                  <Text style={styles.sheetTitle}>New capture</Text>
                </View>
                <View style={styles.sheetActions}>
                  <IconButton Icon={X} label="Close" onPress={closeCaptureComposer} />
                  <IconButton
                    Icon={Check}
                    label={savingCapture ? "Saving capture" : "Save capture"}
                    disabled={savingCapture || !sourceDraft.trim()}
                    onPress={() => void saveCaptureSource()}
                    tone="primary"
                    testID="pc.capture.save"
                  />
                </View>
              </View>
              <View style={styles.captureModeRow}>
                {([
                  { mode: "link", label: "Link", Icon: Link2 },
                  { mode: "note", label: "Note", Icon: StickyNote },
                  { mode: "image", label: "Image", Icon: ImageIcon }
                ] as const).map(({ mode, label, Icon }) => {
                  const imageAction = mode === "image";
                  const selectedMode = !imageAction && captureMode === mode;
                  return (
                    <Pressable
                      accessibilityRole="button"
                      disabled={imageAction && pickingCaptureImage}
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
                    </Pressable>
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
                <TextInput
                  autoCapitalize={captureMode === "link" ? "none" : "sentences"}
                  autoCorrect={captureMode !== "link"}
                  keyboardType={captureMode === "link" ? "url" : "default"}
                  multiline
                  ref={sourceInputRef}
                  onChangeText={setSourceDraft}
                  placeholder={captureSourcePlaceholder}
                  placeholderTextColor={colors.muted}
                  style={[styles.captureInput, composerKeyboardVisible && styles.captureInputCompact]}
                  testID="pc.capture.source"
                  value={sourceDraft}
                />
              </View>
            </Animated.View>
          </KeyboardAvoidingView>
        </View>
      ) : null}
      {appSheets}
      {bottomAppBar}
      {toast}
    </SafeAreaView>
  );
}
