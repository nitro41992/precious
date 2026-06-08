import { useEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import {
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StatusBar,
  View
} from "react-native";
import type { FlatListProps, LayoutChangeEvent, ListRenderItemInfo } from "react-native";
import Reanimated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming
} from "react-native-reanimated";
import { ArrowLeft, MagnifyingGlass as Search, X } from "phosphor-react-native";

import type { Capture } from "../types";
import { SEARCH_PROMPTS } from "../capturePresentation";
import { IconButton } from "../ui/components";
import { motionEasing, motionDuration, motionReduceMotion } from "../ui/motion";
import { appTheme, colors } from "../ui/theme";
import { styles } from "../ui/styles";
import { Text, TextInput } from "../ui/typography";

type SearchScreenProps = {
  data: {
    appSheets: ReactNode;
    emptyText: string;
    emptyTitle: string;
    listPerfProps: Partial<FlatListProps<Capture>>;
    searchIsLoading: boolean;
    searchProgressLabel: string;
    searchResults: Capture[];
    searchMotion: Animated.Value;
    toast: ReactNode;
  };
  state: {
    remoteSearchActive: boolean;
    searchQuery: string;
  };
  actions: {
    closeSearch: () => void;
    renderSearchProgress: (label: string) => ReactNode;
    renderSearchResult: (input: ListRenderItemInfo<Capture>) => ReactElement | null;
    setSearchQuery: (value: string) => void;
  };
};

export function SearchScreen({ actions, data, state }: SearchScreenProps) {
  const {
    appSheets,
    emptyText,
    emptyTitle,
    listPerfProps,
    searchIsLoading,
    searchMotion,
    searchProgressLabel,
    searchResults,
    toast
  } = data;
  const {
    remoteSearchActive,
    searchQuery
  } = state;
  const {
    closeSearch,
    renderSearchProgress,
    renderSearchResult,
    setSearchQuery
  } = actions;

  // The progress pill collapses its real height (not just a fade) so the list
  // below slides up smoothly instead of snapping when the status clears. Height
  // is animated via useAnimatedStyle — a genuine relayout each frame — rather
  // than a LinearTransition, which (under adjustResize) would also re-run on
  // every keyboard show/hide and scroll-to-dismiss. The label lingers through
  // the collapse so the text fades out with the space.
  const pillVisible = Boolean(searchProgressLabel);
  const [lingeringProgressLabel, setLingeringProgressLabel] = useState(searchProgressLabel);
  const pillProgress = useSharedValue(pillVisible ? 1 : 0);
  const pillContentHeight = useSharedValue(0);
  useEffect(() => {
    if (pillVisible) setLingeringProgressLabel(searchProgressLabel);
    pillProgress.value = withTiming(pillVisible ? 1 : 0, {
      duration: motionDuration.quick,
      easing: motionEasing.standard,
      reduceMotion: motionReduceMotion
    });
    if (!pillVisible) {
      const timer = setTimeout(() => setLingeringProgressLabel(""), motionDuration.quick + 60);
      return () => clearTimeout(timer);
    }
  }, [pillProgress, pillVisible, searchProgressLabel]);
  const pillSlotStyle = useAnimatedStyle(() => ({
    height: pillContentHeight.value * pillProgress.value,
    opacity: pillProgress.value
  }));
  const onPillContentLayout = (event: LayoutChangeEvent) => {
    const measured = event.nativeEvent.layout.height;
    if (measured > 0) pillContentHeight.value = measured;
  };

  // When the pill clears (was showing, now gone), the refined (hybrid) result
  // set has swapped in. Ease it in with a brief opacity dip-to-full so the new
  // matches settle rather than popping. Opacity only on the list wrapper (no
  // relayout), so it never interferes with the keyboard.
  const listReveal = useSharedValue(1);
  const pillWasVisible = useRef(pillVisible);
  useEffect(() => {
    const settledFromRemote = pillWasVisible.current && !pillVisible;
    pillWasVisible.current = pillVisible;
    if (settledFromRemote) {
      listReveal.value = 0.6;
      listReveal.value = withTiming(1, {
        duration: motionDuration.settle,
        easing: motionEasing.standard,
        reduceMotion: motionReduceMotion
      });
    }
  }, [listReveal, pillVisible]);
  const listRevealStyle = useAnimatedStyle(() => ({ opacity: listReveal.value }));

  return (
    <View style={styles.safe}>
      <StatusBar barStyle={appTheme.statusBarStyle} />
      <Animated.View
        style={[
          styles.searchScreen,
          {
            opacity: searchMotion,
            transform: [
              {
                translateY: searchMotion.interpolate({
                  inputRange: [0, 1],
                  outputRange: [12, 0]
                })
              }
            ]
          }
        ]}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.searchScreen}
        >
          <View style={styles.searchTop}>
            <View style={styles.searchBarRow}>
              <IconButton Icon={ArrowLeft} label="Back" onPress={closeSearch} />
              <View style={styles.searchInputWrap}>
                <Search color={colors.muted} size={19} weight="regular" />
                <TextInput
                  autoFocus
                  onChangeText={setSearchQuery}
                  placeholder="Search saved things"
                  placeholderTextColor={colors.placeholder}
                  returnKeyType="search"
                  style={styles.searchInputNative}
                  testID="pc.search.input"
                  value={searchQuery}
                />
                {searchQuery ? (
                  <Pressable
                    accessibilityLabel="Clear search"
                    accessibilityRole="button"
                    hitSlop={8}
                    onPress={() => setSearchQuery("")}
                  >
                    <X color={colors.muted} size={18} weight="bold" />
                  </Pressable>
                ) : null}
              </View>
            </View>
            <Reanimated.View style={[styles.searchProgressSlot, pillSlotStyle]}>
              <View onLayout={onPillContentLayout}>
                {lingeringProgressLabel ? renderSearchProgress(lingeringProgressLabel) : null}
              </View>
            </Reanimated.View>
          </View>
          <Reanimated.View style={[styles.searchListWrap, listRevealStyle]}>
          <FlatList
            {...listPerfProps}
            data={searchResults}
            keyExtractor={(item) => item.id}
            renderItem={renderSearchResult}
            onEndReached={() => {}}
            onEndReachedThreshold={0.35}
            ListEmptyComponent={
              searchIsLoading && searchQuery.trim() ? (
                <View style={styles.searchEmpty}>
                  <Text style={styles.emptyTitle}>Searching saved things...</Text>
                  <Text style={styles.emptyText}>Checking titles, notes, sources, Collections, and saved details.</Text>
                </View>
              ) : (
                <View style={styles.searchEmpty}>
                  <Text style={styles.emptyTitle}>{emptyTitle}</Text>
                  <Text style={styles.emptyText}>{emptyText}</Text>
                  {!searchQuery.trim() ? (
                    <View style={styles.promptChips}>
                      {SEARCH_PROMPTS.map(({ label, query, Icon }) => (
                        <Pressable
                          key={query}
                          onPress={() => setSearchQuery(query)}
                          style={({ pressed }) => [styles.promptChip, pressed && styles.subtlePressed]}
                        >
                          <Icon color={colors.muted} size={15} weight="regular" />
                          <Text style={styles.promptChipText}>{label}</Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                </View>
              )
            }
            contentContainerStyle={searchResults.length ? styles.searchResultsContent : styles.searchEmptyContent}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
          />
          </Reanimated.View>
        </KeyboardAvoidingView>
      </Animated.View>
      {appSheets}
      {toast}
    </View>
  );
}
