import type { ReactElement, ReactNode, RefObject } from "react";
import {
  FlatList,
  type FlatListProps,
  type ListRenderItemInfo,
  Platform,
  Pressable,
  StatusBar,
  View
} from "react-native";
import { ArrowLeft, PencilSimple, Plus, Sparkle, Trash } from "phosphor-react-native";

import type { Capture, Collection, CollectionCapturesLoadPhase } from "../types";
import { appTheme, colors } from "../ui/theme";
import { styles } from "../ui/styles";
import { IconButton, MotionPressable } from "../ui/components";
import { Text } from "../ui/typography";

type CollectionDetailScreenProps = {
  data: {
    appSheets: ReactNode;
    collectionCaptures: Capture[];
    collectionCapturesColdSkeletonVisible: boolean;
    collectionCapturesError: string;
    collectionCapturesForId: string | null;
    collectionCapturesLoadPhase: CollectionCapturesLoadPhase;
    collectionCapturesLoading: boolean;
    collectionDetailListRef: RefObject<FlatList<Capture> | null>;
    listPerfProps: Partial<FlatListProps<Capture>>;
    selectedCollection: Collection;
    suggestionBusy: boolean;
    toast: ReactNode;
  };
  actions: {
    closeCollectionDetail: () => void;
    loadMoreCollectionCaptures: () => void;
    onDeleteCollection: () => void;
    onPersistSuggestion: () => void;
    openCollectionEditor: () => void;
    renderCollectionCapture: (input: ListRenderItemInfo<Capture>) => ReactElement | null;
    renderCollectionCaptureSkeletonRows: (count?: number) => ReactElement | null;
    renderListLoadingFooter: (variant?: "captures" | "collectionCaptures" | "collections") => ReactElement | null;
    retryLoadCollectionCaptures: () => void;
  };
};

export function CollectionDetailScreen({ actions, data }: CollectionDetailScreenProps) {
  const {
    appSheets,
    collectionCaptures,
    collectionCapturesColdSkeletonVisible,
    collectionCapturesError,
    collectionCapturesForId,
    collectionCapturesLoadPhase,
    collectionCapturesLoading,
    collectionDetailListRef,
    listPerfProps,
    selectedCollection,
    suggestionBusy,
    toast
  } = data;
  const {
    closeCollectionDetail,
    loadMoreCollectionCaptures,
    onDeleteCollection,
    onPersistSuggestion,
    openCollectionEditor,
    renderCollectionCapture,
    renderCollectionCaptureSkeletonRows,
    renderListLoadingFooter,
    retryLoadCollectionCaptures
  } = actions;
  const isSuggested = selectedCollection.status === "suggested";

  const capturesReadyForCollection = collectionCapturesForId === selectedCollection.id;
  const collectionCapturesBlockingLoading =
    collectionCapturesLoading && collectionCapturesLoadPhase !== "append";
  const visibleCollectionCaptures =
    capturesReadyForCollection && (!collectionCapturesBlockingLoading || collectionCaptures.length)
      ? collectionCaptures
      : [];
  const collectionCapturesInitialLoading =
    !collectionCapturesError &&
    (!capturesReadyForCollection ||
      collectionCapturesBlockingLoading ||
      (collectionCapturesLoadPhase === "initial" && !visibleCollectionCaptures.length));
  const collectionCapturesAppending = collectionCapturesLoadPhase === "append";
  const collectionCaptureSkeletonCount =
    selectedCollection.captureCount > 0 ? Math.min(selectedCollection.captureCount, 4) : 2;

  return (
    <View style={styles.safe}>
      <StatusBar barStyle={appTheme.statusBarStyle} />
      <FlatList
        {...listPerfProps}
        data={visibleCollectionCaptures}
        keyExtractor={(item) => item.id}
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        keyboardShouldPersistTaps="handled"
        ref={collectionDetailListRef}
        renderItem={renderCollectionCapture}
        onEndReached={loadMoreCollectionCaptures}
        onEndReachedThreshold={0.35}
        ItemSeparatorComponent={() => <View style={styles.collectionCaptureSeparator} />}
        ListHeaderComponent={
          <View style={styles.collectionDetailTop}>
            <View style={styles.detailHeader}>
              <IconButton Icon={ArrowLeft} label="Back" onPress={closeCollectionDetail} />
              <View style={styles.detailHeaderActions}>
                <Text style={styles.status}>{selectedCollection.captureCount} captures</Text>
                {isSuggested ? (
                  <View style={styles.detailSuggestedTag}>
                    <Sparkle color={colors.accentTextStrong} size={13} weight="fill" />
                    <Text style={styles.detailSuggestedTagText}>Suggested</Text>
                  </View>
                ) : (
                  <>
                    <IconButton
                      Icon={PencilSimple}
                      label="Edit collection"
                      onPress={openCollectionEditor}
                      testID="pc.collection.detail.edit"
                    />
                    <MotionPressable
                      accessibilityLabel="Delete collection"
                      accessibilityRole="button"
                      hitSlop={8}
                      onPress={onDeleteCollection}
                      style={({ pressed }) => [
                        styles.detailHeaderDeleteButton,
                        pressed && styles.subtlePressed
                      ]}
                      testID="pc.collection.detail.delete"
                    >
                      <Trash color={colors.danger} size={21} weight="regular" />
                    </MotionPressable>
                  </>
                )}
              </View>
            </View>
            <Text style={styles.title} testID="pc.collection.detail.title">
              {selectedCollection.title}
            </Text>
            <Text style={styles.sourceText}>{selectedCollection.description}</Text>
            {isSuggested ? (
              <MotionPressable
                accessibilityLabel={`Add collection: ${selectedCollection.title}`}
                accessibilityRole="button"
                disabled={suggestionBusy}
                onPress={onPersistSuggestion}
                style={({ pressed }) => [
                  styles.detailPersistButton,
                  suggestionBusy && styles.suggestionDisabled,
                  pressed && styles.subtlePressed
                ]}
                testID="pc.collection.detail.persist"
              >
                <Plus color={colors.onAccent} size={17} weight="bold" />
                <Text style={styles.detailPersistText}>Add to collections</Text>
              </MotionPressable>
            ) : null}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{isSuggested ? "Captures in this suggestion" : "Captures"}</Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          collectionCapturesInitialLoading && collectionCapturesColdSkeletonVisible ? (
            renderCollectionCaptureSkeletonRows(collectionCaptureSkeletonCount)
          ) : collectionCapturesInitialLoading ? (
            <View style={styles.loadingQuietSpace} />
          ) : collectionCapturesError ? (
            <View style={styles.collectionEmpty}>
              <Text style={styles.emptyTitle}>Could not load collection captures.</Text>
              <Text style={styles.emptyText}>{collectionCapturesError}</Text>
              <Pressable onPress={retryLoadCollectionCaptures} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Try again</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.collectionEmpty}>
              <Text style={styles.emptyTitle}>No captures in this collection.</Text>
              <Text style={styles.emptyText}>Linked captures will appear here.</Text>
            </View>
          )
        }
        ListFooterComponent={
          visibleCollectionCaptures.length && collectionCapturesAppending
            ? renderListLoadingFooter("collectionCaptures")
            : null
        }
        contentContainerStyle={styles.collectionDetailContent}
      />
      {appSheets}
      {toast}
    </View>
  );
}
