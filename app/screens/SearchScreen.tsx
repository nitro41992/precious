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
import type { FlatListProps, ListRenderItemInfo } from "react-native";
import Reanimated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
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
    renderSkeletonRows: (count?: number) => ReactNode;
    searchPending: boolean;
    searchResults: Capture[];
    searchMotion: Animated.Value;
    toast: ReactNode;
  };
  state: {
    searchQuery: string;
  };
  actions: {
    closeSearch: () => void;
    renderSearchResult: (input: ListRenderItemInfo<Capture>) => ReactElement | null;
    setSearchQuery: (value: string) => void;
  };
};

// Show a transient flag only when it has been active long enough to matter, and
// keep it up for a minimum once shown. Fast/cached responses never trip the
// appear delay, so the search feels instant and consistent; genuinely slow
// passes get a steady cue that does not flicker. This is the perceived-
// performance trick behind a premium search.
function useDeferredVisible(active: boolean, appearDelay: number, minDuration: number) {
  const [visible, setVisible] = useState(false);
  const shownAtRef = useRef(0);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (active) {
      if (!visible) {
        timer = setTimeout(() => {
          shownAtRef.current = Date.now();
          setVisible(true);
        }, appearDelay);
      }
    } else if (visible) {
      const remaining = Math.max(0, minDuration - (Date.now() - shownAtRef.current));
      timer = setTimeout(() => setVisible(false), remaining);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [active, appearDelay, minDuration, visible]);
  return visible;
}

// A small three-dot "thinking" wave for the background refine pass. Lives in the
// search field, so it never shifts the result list. Reanimated-driven (the outer
// screen uses RN Animated, but on a different node, so the drivers never mix).
function RefiningDots() {
  const dotA = useSharedValue(0);
  const dotB = useSharedValue(0);
  const dotC = useSharedValue(0);
  useEffect(() => {
    const pulse = () =>
      withRepeat(
        withSequence(
          withTiming(1, { duration: 440, easing: motionEasing.standard, reduceMotion: motionReduceMotion }),
          withTiming(0, { duration: 440, easing: motionEasing.standard, reduceMotion: motionReduceMotion })
        ),
        -1
      );
    dotA.value = pulse();
    dotB.value = withDelay(150, pulse());
    dotC.value = withDelay(300, pulse());
    return () => {
      cancelAnimation(dotA);
      cancelAnimation(dotB);
      cancelAnimation(dotC);
    };
  }, [dotA, dotB, dotC]);
  const styleA = useAnimatedStyle(() => ({ opacity: 0.35 + dotA.value * 0.65, transform: [{ scale: 0.7 + dotA.value * 0.3 }] }));
  const styleB = useAnimatedStyle(() => ({ opacity: 0.35 + dotB.value * 0.65, transform: [{ scale: 0.7 + dotB.value * 0.3 }] }));
  const styleC = useAnimatedStyle(() => ({ opacity: 0.35 + dotC.value * 0.65, transform: [{ scale: 0.7 + dotC.value * 0.3 }] }));
  return (
    <View accessibilityLabel="Refining results" accessibilityRole="progressbar" style={styles.searchRefineDots}>
      <Reanimated.View style={[styles.searchRefineDot, styleA]} />
      <Reanimated.View style={[styles.searchRefineDot, styleB]} />
      <Reanimated.View style={[styles.searchRefineDot, styleC]} />
    </View>
  );
}

export function SearchScreen({ actions, data, state }: SearchScreenProps) {
  const {
    appSheets,
    emptyText,
    emptyTitle,
    listPerfProps,
    renderSkeletonRows,
    searchMotion,
    searchPending,
    searchResults,
    toast
  } = data;
  const { searchQuery } = state;
  const { closeSearch, renderSearchResult, setSearchQuery } = actions;

  const hasQuery = searchQuery.trim().length > 0;
  const hasResults = searchResults.length > 0;
  // Inline cue: invisible for instant/cached passes, steady for slow ones.
  const refineVisible = useDeferredVisible(searchPending && hasQuery, 220, 520);
  // Cold skeleton (only when there is nothing to show yet). A short appear delay
  // skips it for instant responses; a brief blank covers the gap so the empty
  // state never flashes before results land.
  const skeletonVisible = useDeferredVisible(searchPending && hasQuery && !hasResults, 90, 420);
  const showSkeleton = skeletonVisible && hasQuery && !hasResults;
  const showCardSurface = hasResults || showSkeleton;

  // Reveal: results glide in (fade + slight rise) when they first appear, and
  // settle (subtle fade) when a background refine swaps them in place. One
  // orchestrated moment, opacity/transform only on the wrapper — no relayout,
  // so it stays keyboard-safe.
  const revealOpacity = useSharedValue(1);
  const revealRise = useSharedValue(0);
  const hadResults = useRef(hasResults);
  const wasPending = useRef(searchPending);
  useEffect(() => {
    const appeared = !hadResults.current && hasResults;
    const settledInPlace = hadResults.current && hasResults && wasPending.current && !searchPending;
    hadResults.current = hasResults;
    wasPending.current = searchPending;
    if (appeared) {
      revealOpacity.value = 0;
      revealRise.value = 14;
      revealOpacity.value = withTiming(1, { duration: motionDuration.enter, easing: motionEasing.decelerate, reduceMotion: motionReduceMotion });
      revealRise.value = withTiming(0, { duration: motionDuration.settle, easing: motionEasing.decelerate, reduceMotion: motionReduceMotion });
    } else if (settledInPlace) {
      revealOpacity.value = 0.78;
      revealOpacity.value = withTiming(1, { duration: motionDuration.settle, easing: motionEasing.standard, reduceMotion: motionReduceMotion });
    }
  }, [hasResults, revealOpacity, revealRise, searchPending]);
  const revealStyle = useAnimatedStyle(() => ({
    opacity: revealOpacity.value,
    transform: [{ translateY: revealRise.value }]
  }));

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
                {refineVisible ? <RefiningDots /> : null}
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
          </View>
          <Reanimated.View style={[styles.searchListWrap, revealStyle]}>
            <FlatList
              {...listPerfProps}
              data={searchResults}
              keyExtractor={(item) => item.id}
              renderItem={renderSearchResult}
              onEndReached={() => {}}
              onEndReachedThreshold={0.35}
              ListEmptyComponent={
                showSkeleton ? (
                  <>{renderSkeletonRows(6)}</>
                ) : !hasQuery ? (
                  <View style={styles.searchEmpty}>
                    <Text style={styles.emptyTitle}>{emptyTitle}</Text>
                    <Text style={styles.emptyText}>{emptyText}</Text>
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
                  </View>
                ) : searchPending ? (
                  // A search is still in flight — stay blank rather than
                  // flashing "no matches" before the results arrive.
                  null
                ) : (
                  <View style={styles.searchEmpty}>
                    <Text style={styles.emptyTitle}>{emptyTitle}</Text>
                    <Text style={styles.emptyText}>{emptyText}</Text>
                  </View>
                )
              }
              contentContainerStyle={showCardSurface ? styles.searchResultsContent : styles.searchEmptyContent}
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
