import type { ReactElement, ReactNode } from "react";
import {
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StatusBar,
  Text,
  TextInput,
  View
} from "react-native";
import type { FlatListProps, ListRenderItemInfo } from "react-native";
import { ArrowLeft, Search, SlidersHorizontal, X } from "lucide-react-native";

import type { Capture, SearchScope } from "../types";
import { SEARCH_PROMPTS } from "../capturePresentation";
import { IconButton } from "../ui/components";
import { colors } from "../ui/theme";
import { styles } from "../ui/styles";

type SearchScreenProps = {
  data: {
    appSheets: ReactNode;
    archivedCapturesError: string;
    emptyText: string;
    emptyTitle: string;
    listPerfProps: Partial<FlatListProps<Capture>>;
    searchIsLoading: boolean;
    searchProgressLabel: string;
    searchResults: Capture[];
    searchMotion: Animated.Value;
    showSearchScopes: boolean;
    snackbar: ReactNode;
  };
  state: {
    remoteSearchActive: boolean;
    searchQuery: string;
    searchScope: SearchScope;
    searchScopeOpen: boolean;
  };
  actions: {
    closeSearch: () => void;
    loadMoreArchivedCaptures: () => void;
    renderSearchProgress: (label: string) => ReactNode;
    renderSearchResult: (input: ListRenderItemInfo<Capture>) => ReactElement | null;
    setSearchQuery: (value: string) => void;
    setSearchScope: (scope: SearchScope) => void;
    toggleSearchScopeOpen: () => void;
  };
};

export function SearchScreen({ actions, data, state }: SearchScreenProps) {
  const {
    appSheets,
    archivedCapturesError,
    emptyText,
    emptyTitle,
    listPerfProps,
    searchIsLoading,
    searchMotion,
    searchProgressLabel,
    searchResults,
    showSearchScopes,
    snackbar
  } = data;
  const {
    remoteSearchActive,
    searchQuery,
    searchScope,
    searchScopeOpen
  } = state;
  const {
    closeSearch,
    loadMoreArchivedCaptures,
    renderSearchProgress,
    renderSearchResult,
    setSearchQuery,
    setSearchScope,
    toggleSearchScopeOpen
  } = actions;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />
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
                <Search color={colors.muted} size={19} strokeWidth={2.3} />
                <TextInput
                  autoFocus
                  onChangeText={setSearchQuery}
                  placeholder="Search saved things"
                  placeholderTextColor={colors.muted}
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
                    <X color={colors.muted} size={18} strokeWidth={2.4} />
                  </Pressable>
                ) : null}
              </View>
              <IconButton
                Icon={SlidersHorizontal}
                label="Search filters"
                onPress={toggleSearchScopeOpen}
                selected={searchScopeOpen}
              />
            </View>
            {showSearchScopes ? (
              <View style={styles.searchAssistRow}>
                <Text style={styles.searchScopeLabel}>
                  {searchScope === "active"
                    ? "Active captures"
                    : searchScope === "archived"
                      ? "Archived captures"
                      : "All captures"}
                </Text>
                <View style={styles.scopeRow}>
                  {(["active", "archived", "all"] as const).map((scope) => (
                    <Pressable
                      key={scope}
                      onPress={() => setSearchScope(scope)}
                      style={({ pressed }) => [
                        styles.scopeChip,
                        searchScope === scope && styles.scopeChipSelected,
                        pressed && styles.subtlePressed
                      ]}
                      testID={`pc.search.scope.${scope}`}
                    >
                      <Text style={[styles.scopeChipText, searchScope === scope && styles.scopeChipTextSelected]}>
                        {scope === "active" ? "Active" : scope === "archived" ? "Archived" : "All"}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}
            {archivedCapturesError && searchScope !== "active" ? (
              <Text style={styles.errorText}>{archivedCapturesError}</Text>
            ) : null}
            {searchProgressLabel ? renderSearchProgress(searchProgressLabel) : null}
          </View>
          <FlatList
            {...listPerfProps}
            data={searchResults}
            keyExtractor={(item) => item.id}
            renderItem={renderSearchResult}
            onEndReached={() => {
              if (!remoteSearchActive && searchScope === "archived") loadMoreArchivedCaptures();
            }}
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
                  {!searchQuery.trim() && searchScope === "active" ? (
                    <View style={styles.promptChips}>
                      {SEARCH_PROMPTS.map(({ label, query, Icon }) => (
                        <Pressable
                          key={query}
                          onPress={() => setSearchQuery(query)}
                          style={({ pressed }) => [styles.promptChip, pressed && styles.subtlePressed]}
                        >
                          <Icon color={colors.muted} size={15} strokeWidth={2.2} />
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
      {snackbar}
    </SafeAreaView>
  );
}
