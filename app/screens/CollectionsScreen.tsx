import type { ReactElement, ReactNode } from "react";
import { Pressable, StatusBar, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import type { FlashListProps, ListRenderItemInfo } from "@shopify/flash-list";
import { Folder, Plus } from "phosphor-react-native";

import type { Collection, LoadPhase } from "../types";
import { colors } from "../ui/theme";
import { styles } from "../ui/styles";
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
    toast: ReactNode;
  };
  state: {
    collectionsLoadPhase: LoadPhase;
    collectionsLoading: boolean;
    showCollectionForm: boolean;
  };
  actions: {
    loadMoreCollections: () => void;
    openCollectionComposer: () => void;
    renderCollection: (input: ListRenderItemInfo<Collection>) => ReactElement | null;
    renderCollectionSkeletonRows: (
      count?: number,
      withSelectionControl?: boolean,
      skeletonCollections?: Collection[]
    ) => ReactElement | null;
    renderListLoadingFooter: (label?: string) => ReactElement | null;
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
    toast
  } = data;
  const { collectionsLoadPhase, collectionsLoading } = state;
  const {
    loadMoreCollections,
    openCollectionComposer,
    renderCollection,
    renderCollectionSkeletonRows,
    renderListLoadingFooter
  } = actions;

  const collectionsBlockingLoading = collectionsLoadPhase === "cold" && collectionsLoading && !collectionsError;
  const visibleManagedCollections = collectionsBlockingLoading ? [] : collections;

  return (
    <View style={styles.safe}>
      <StatusBar barStyle="light-content" />
      <View style={styles.collectionsScreen}>
        <View style={styles.collectionsTitleBlock}>
          <Text style={styles.title}>Collections</Text>
        </View>
        {collectionsError ? <Text style={styles.errorText}>{collectionsError}</Text> : null}
        <FlashList
          {...collectionsListPerfProps}
          data={visibleManagedCollections}
          keyExtractor={(item) => item.id}
          renderItem={renderCollection}
          numColumns={2}
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
                    <Folder color={colors.accent} size={28} weight="regular" />
                    <View style={styles.collectionsEmptyLines}>
                      <View style={styles.collectionsEmptyLineStrong} />
                      <View style={styles.collectionsEmptyLineSoft} />
                    </View>
                  </View>
                  <View style={styles.collectionsEmptyBadge}>
                    <Plus color={colors.onAccent} size={18} weight="bold" />
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
            visibleManagedCollections.length || (collectionsBlockingLoading && collectionsColdSkeletonVisible)
              ? styles.collectionsListContent
              : styles.collectionsEmptyContent
          }
          onEndReached={loadMoreCollections}
          onEndReachedThreshold={0.35}
          ListFooterComponent={
            visibleManagedCollections.length && collectionsLoading && collectionsLoadPhase === "append"
              ? renderListLoadingFooter("Loading more collections...")
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
