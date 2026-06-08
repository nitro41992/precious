import type { ReactElement, ReactNode } from "react";
import { Pressable, StatusBar, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import type { FlashListProps, ListRenderItemInfo } from "@shopify/flash-list";
import { Folder, MagnifyingGlass as Search, Plus, Sparkle } from "phosphor-react-native";

import type { Collection, LoadPhase } from "../types";
import { appTheme, colors } from "../ui/theme";
import { styles } from "../ui/styles";
import { HeaderContentGradient, IconButton } from "../ui/components";
import { CollectionSuggestionGridCard } from "../ui/rows";
import { Text } from "../ui/typography";

type CollectionsScreenProps = {
  data: {
    appSheets: ReactNode;
    bottomAppBar: ReactNode;
    collectionComposerSheet: ReactNode;
    collections: Collection[];
    collectionsColdSkeletonVisible: boolean;
    collectionsError: string;
    collectionsListPerfProps: Partial<FlashListProps<Collection>>;
    suggestions: Collection[];
    toast: ReactNode;
  };
  state: {
    collectionsLoadPhase: LoadPhase;
    collectionsLoading: boolean;
    showCollectionForm: boolean;
    suggestionBusyId: string | null;
  };
  actions: {
    loadMoreCollections: () => void;
    openCollectionComposer: () => void;
    openCollectionSearch: () => void;
    openSuggestion: (collectionId: string) => void;
    persistSuggestion: (collectionId: string) => void;
    renderCollection: (input: ListRenderItemInfo<Collection>) => ReactElement | null;
    renderCollectionSkeletonRows: (
      count?: number,
      withSelectionControl?: boolean,
      skeletonCollections?: Collection[]
    ) => ReactElement | null;
    renderListLoadingFooter: (variant?: "captures" | "collectionCaptures" | "collections") => ReactElement | null;
  };
};

export function CollectionsScreen({ actions, data, state }: CollectionsScreenProps) {
  const {
    appSheets,
    bottomAppBar,
    collectionComposerSheet,
    collections,
    collectionsColdSkeletonVisible,
    collectionsError,
    collectionsListPerfProps,
    suggestions,
    toast
  } = data;
  const { collectionsLoadPhase, collectionsLoading, suggestionBusyId } = state;
  const {
    loadMoreCollections,
    openCollectionComposer,
    openCollectionSearch,
    openSuggestion,
    persistSuggestion,
    renderCollection,
    renderCollectionSkeletonRows,
    renderListLoadingFooter
  } = actions;

  const collectionsBlockingLoading = collectionsLoadPhase === "cold" && collectionsLoading && !collectionsError && !collections.length;
  const visibleManagedCollections = collections;
  const suggestionsHeader = suggestions.length ? (
    <View style={styles.suggestionSection}>
      <View style={styles.suggestionSectionHeader}>
        <Sparkle color={colors.accentTextStrong} size={14} weight="fill" />
        <Text style={styles.suggestionSectionTitle}>Suggested</Text>
      </View>
      <View style={styles.suggestionSectionGrid}>
        {suggestions.map((suggestion) => (
          <CollectionSuggestionGridCard
            busy={suggestionBusyId === suggestion.id}
            item={suggestion}
            key={suggestion.id}
            onPersist={() => persistSuggestion(suggestion.id)}
            onPress={() => openSuggestion(suggestion.id)}
          />
        ))}
      </View>
    </View>
  ) : null;

  return (
    <View style={styles.edgeToEdgeSafe}>
      <StatusBar backgroundColor={colors.transparent} barStyle={appTheme.statusBarStyle} translucent />
      <View style={styles.topAppBarScreen}>
        <View style={[styles.header, styles.topAppBarOverlay]}>
          <HeaderContentGradient density="compact" />
          <View style={styles.headerRow}>
            <View style={styles.headerCopy}>
              <View style={styles.headerTitleLine}>
                <Text style={styles.title}>Collections</Text>
              </View>
            </View>
            <IconButton
              Icon={Search}
              label="Search collections"
              onPress={openCollectionSearch}
              testID="pc.collections.search"
            />
          </View>
        </View>
        {collectionsError ? <Text style={styles.errorText}>{collectionsError}</Text> : null}
        <FlashList
          {...collectionsListPerfProps}
          data={visibleManagedCollections}
          keyExtractor={(item) => item.id}
          renderItem={renderCollection}
          numColumns={2}
          ListHeaderComponent={suggestionsHeader}
          ListEmptyComponent={
            collectionsBlockingLoading && collectionsColdSkeletonVisible ? (
              renderCollectionSkeletonRows(collections.length ? Math.min(collections.length, 7) : 7, false, collections)
            ) : collectionsBlockingLoading ? (
              <View style={styles.loadingQuietSpace} />
            ) : (
              <View style={styles.collectionsEmpty}>
                <View
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  pointerEvents="none"
                  style={styles.collectionsEmptyVisual}
                >
                  <View style={styles.collectionsEmptyFolderBack} />
                  <View style={styles.collectionsEmptyFolder}>
                    <View style={styles.collectionsEmptyFolderTab} />
                    <Folder color={colors.collectionAccentText} size={28} weight="regular" />
                    <View style={styles.collectionsEmptyLines}>
                      <View style={styles.collectionsEmptyLineStrong} />
                      <View style={styles.collectionsEmptyLineSoft} />
                    </View>
                  </View>
                  <View style={styles.collectionsEmptyBadge}>
                    <Plus color={colors.onCollectionAccent} size={18} weight="bold" />
                  </View>
                </View>
                <View style={styles.collectionsEmptyCopy}>
                  <Text style={[styles.emptyTitle, styles.homeEmptyTitle]}>No collections yet.</Text>
                  <Text style={[styles.emptyText, styles.homeEmptyText]}>
                    Create one when a group of captures starts to have a purpose.
                  </Text>
                </View>
                <Pressable
                  onPress={openCollectionComposer}
                  style={({ pressed }) => [styles.homeEmptyPrimary, pressed && styles.homeEmptyPrimaryPressed]}
                  testID="pc.collections.empty.create"
                >
                  <Plus color={colors.onAccent} size={20} weight="bold" />
                  <Text style={styles.homeEmptyPrimaryText}>Create collection</Text>
                </Pressable>
              </View>
            )
          }
          contentContainerStyle={
            [
              visibleManagedCollections.length || (collectionsBlockingLoading && collectionsColdSkeletonVisible)
                ? styles.collectionsListContent
                : styles.collectionsEmptyContent,
              styles.topAppBarListInset
            ]
          }
          onEndReached={loadMoreCollections}
          onEndReachedThreshold={0.35}
          ListFooterComponent={
            visibleManagedCollections.length && collectionsLoading && collectionsLoadPhase === "append"
              ? renderListLoadingFooter("collections")
              : null
          }
        />
      </View>
      {appSheets}
      {bottomAppBar}
      {collectionComposerSheet}
      {toast}
    </View>
  );
}
