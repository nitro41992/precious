import type { ReactElement, ReactNode } from "react";
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StatusBar,
  View
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import type { FlashListProps, ListRenderItemInfo } from "@shopify/flash-list";
import { ArrowLeft, MagnifyingGlass as Search, X } from "phosphor-react-native";

import type { Collection } from "../types";
import { IconButton } from "../ui/components";
import { appTheme, colors } from "../ui/theme";
import { styles } from "../ui/styles";
import { Text, TextInput } from "../ui/typography";

type CollectionSearchScreenProps = {
  data: {
    appSheets: ReactNode;
    collectionSearchMotion: Animated.Value;
    collectionSearchResults: Collection[];
    listPerfProps: Partial<FlashListProps<Collection>>;
    toast: ReactNode;
  };
  state: {
    collectionSearchQuery: string;
  };
  actions: {
    closeCollectionSearch: () => void;
    renderCollection: (input: ListRenderItemInfo<Collection>) => ReactElement | null;
    setCollectionSearchQuery: (value: string) => void;
  };
};

export function CollectionSearchScreen({ actions, data, state }: CollectionSearchScreenProps) {
  const {
    appSheets,
    collectionSearchMotion,
    collectionSearchResults,
    listPerfProps,
    toast
  } = data;
  const { collectionSearchQuery } = state;
  const {
    closeCollectionSearch,
    renderCollection,
    setCollectionSearchQuery
  } = actions;
  const searchTerm = collectionSearchQuery.trim();
  const emptyTitle = searchTerm ? "No matching collections." : "Search collections";
  const emptyText = searchTerm
    ? "Try the collection title or description."
    : "Search your active collections by title or description.";

  return (
    <View style={styles.safe}>
      <StatusBar barStyle={appTheme.statusBarStyle} />
      <Animated.View
        style={[
          styles.searchScreen,
          {
            opacity: collectionSearchMotion,
            transform: [
              {
                translateY: collectionSearchMotion.interpolate({
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
              <IconButton Icon={ArrowLeft} label="Back" onPress={closeCollectionSearch} />
              <View style={styles.searchInputWrap}>
                <Search color={colors.muted} size={19} weight="bold" />
                <TextInput
                  autoFocus
                  onChangeText={setCollectionSearchQuery}
                  placeholder="Search collections"
                  placeholderTextColor={colors.placeholder}
                  returnKeyType="search"
                  style={styles.searchInputNative}
                  testID="pc.collections.search.input"
                  value={collectionSearchQuery}
                />
                {collectionSearchQuery ? (
                  <Pressable
                    accessibilityLabel="Clear collection search"
                    accessibilityRole="button"
                    hitSlop={8}
                    onPress={() => setCollectionSearchQuery("")}
                  >
                    <X color={colors.muted} size={18} weight="bold" />
                  </Pressable>
                ) : null}
              </View>
            </View>
          </View>
          <FlashList
            {...listPerfProps}
            data={collectionSearchResults}
            keyExtractor={(item) => item.id}
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
            keyboardShouldPersistTaps="handled"
            renderItem={renderCollection}
            numColumns={2}
            ListEmptyComponent={
              <View style={styles.searchEmpty}>
                <Text style={styles.emptyTitle}>{emptyTitle}</Text>
                <Text style={styles.emptyText}>{emptyText}</Text>
              </View>
            }
            contentContainerStyle={
              collectionSearchResults.length ? styles.collectionSearchResultsContent : styles.searchEmptyContent
            }
          />
        </KeyboardAvoidingView>
      </Animated.View>
      {appSheets}
      {toast}
    </View>
  );
}
