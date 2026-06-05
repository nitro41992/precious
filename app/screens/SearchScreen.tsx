import type { ReactElement, ReactNode } from "react";
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
import { ArrowLeft, MagnifyingGlass as Search, X } from "phosphor-react-native";

import type { Capture } from "../types";
import { SEARCH_PROMPTS } from "../capturePresentation";
import { IconButton } from "../ui/components";
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
            {searchProgressLabel ? renderSearchProgress(searchProgressLabel) : null}
          </View>
          <FlatList
            {...listPerfProps}
            data={searchResults}
            keyExtractor={(item) => item.id}
            renderItem={renderSearchResult}
            onEndReached={() => {}}
            onEndReachedThreshold={0.35}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
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
        </KeyboardAvoidingView>
      </Animated.View>
      {appSheets}
      {toast}
    </View>
  );
}
