import type { ReactElement, ReactNode, RefObject } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StatusBar,
  Text,
  TextInput,
  View
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import type { FlashListProps, FlashListRef, ListRenderItemInfo } from "@shopify/flash-list";
import { ArrowLeft } from "phosphor-react-native";

import type { Capture, Collection, CollectionCapturesLoadPhase } from "../types";
import { colors } from "../ui/theme";
import { styles } from "../ui/styles";
import { IconButton } from "../ui/components";

type CollectionDetailScreenProps = {
  data: {
    appSheets: ReactNode;
    collectionCaptures: Capture[];
    collectionCapturesColdSkeletonVisible: boolean;
    collectionCapturesError: string;
    collectionCapturesForId: string | null;
    collectionCapturesLoadPhase: CollectionCapturesLoadPhase;
    collectionCapturesLoading: boolean;
    collectionDetailListRef: RefObject<FlashListRef<Capture> | null>;
    keyboardHeight: number;
    listPerfProps: Partial<FlashListProps<Capture>>;
    selectedCollection: Collection;
    toast: ReactNode;
  };
  state: {
    collectionDescription: string;
    collectionTitle: string;
  };
  actions: {
    deleteCollection: (collection: Collection) => void;
    loadMoreCollectionCaptures: () => void;
    renderCollectionCapture: (input: ListRenderItemInfo<Capture>) => ReactElement | null;
    renderCollectionCaptureSkeletonRows: (count?: number) => ReactElement | null;
    renderListLoadingFooter: (label?: string) => ReactElement | null;
    retryLoadCollectionCaptures: () => void;
    saveCollection: () => void;
    scrollCollectionSettingsIntoView: () => void;
    selectCollection: (id: string | null) => void;
    setCollectionDescription: (value: string) => void;
    setCollectionDraftDirty: (value: boolean) => void;
    setCollectionTitle: (value: string) => void;
  };
};

export function CollectionDetailScreen({ actions, data, state }: CollectionDetailScreenProps) {
  const {
    appSheets,
    collectionCaptures,
    collectionCapturesColdSkeletonVisible,
    collectionCapturesError,
    collectionCapturesForId,
    collectionCapturesLoadPhase,
    collectionCapturesLoading,
    collectionDetailListRef,
    keyboardHeight,
    listPerfProps,
    selectedCollection,
    toast
  } = data;
  const { collectionDescription, collectionTitle } = state;
  const {
    deleteCollection,
    loadMoreCollectionCaptures,
    renderCollectionCapture,
    renderCollectionCaptureSkeletonRows,
    renderListLoadingFooter,
    retryLoadCollectionCaptures,
    saveCollection,
    scrollCollectionSettingsIntoView,
    selectCollection,
    setCollectionDescription,
    setCollectionDraftDirty,
    setCollectionTitle
  } = actions;

  const saveDisabled = !collectionTitle.trim() || !collectionDescription.trim();
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
  const collectionDetailBottomPadding =
    keyboardHeight > 0 ? Math.min(Math.max(keyboardHeight + 72, 180), 380) : 40;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "android" ? StatusBar.currentHeight ?? 0 : 0}
        style={styles.keyboardScreen}
      >
        <FlashList
          {...listPerfProps}
          data={visibleCollectionCaptures}
          keyExtractor={(item) => item.id}
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          keyboardShouldPersistTaps="handled"
          ref={collectionDetailListRef}
          renderItem={renderCollectionCapture}
          onEndReached={loadMoreCollectionCaptures}
          onEndReachedThreshold={0.35}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListHeaderComponent={
            <View style={styles.collectionDetailTop}>
              <View style={styles.detailHeader}>
                <IconButton Icon={ArrowLeft} label="Back" onPress={() => selectCollection(null)} />
                <Text style={styles.status}>{selectedCollection.captureCount} captures</Text>
              </View>
              <Text style={styles.kicker}>Collection</Text>
              <Text style={styles.title}>{selectedCollection.title}</Text>
              <Text style={styles.sourceText}>{selectedCollection.description}</Text>
              <View style={styles.sectionHeader}>
                <Text style={styles.meta}>Captures</Text>
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
            <>
              {visibleCollectionCaptures.length && collectionCapturesAppending
                ? renderListLoadingFooter("Loading more captures...")
                : null}
              <View style={styles.collectionSettings}>
                <Text style={styles.meta}>Collection settings</Text>
                <TextInput
                  onChangeText={(value) => {
                    setCollectionDraftDirty(true);
                    setCollectionTitle(value);
                  }}
                  onFocus={scrollCollectionSettingsIntoView}
                  placeholder="Title"
                  placeholderTextColor={colors.muted}
                  style={styles.search}
                  testID="pc.collection.detail.title"
                  value={collectionTitle}
                />
                <TextInput
                  multiline
                  onChangeText={(value) => {
                    setCollectionDraftDirty(true);
                    setCollectionDescription(value);
                  }}
                  onFocus={scrollCollectionSettingsIntoView}
                  placeholder="What belongs in this collection"
                  placeholderTextColor={colors.muted}
                  style={styles.noteInput}
                  testID="pc.collection.detail.description"
                  value={collectionDescription}
                />
                <Pressable
                  disabled={saveDisabled}
                  onPress={saveCollection}
                  style={[styles.primaryButton, saveDisabled && styles.disabledButton]}
                  testID="pc.collection.detail.save"
                >
                  <Text style={styles.primaryButtonText}>Save collection</Text>
                </Pressable>
                <Pressable
                  onPress={() => deleteCollection(selectedCollection)}
                  style={styles.secondaryButton}
                  testID="pc.collection.delete"
                >
                  <Text style={styles.dangerButtonText}>Delete collection</Text>
                </Pressable>
              </View>
            </>
          }
          contentContainerStyle={[styles.collectionDetailContent, { paddingBottom: collectionDetailBottomPadding }]}
        />
      </KeyboardAvoidingView>
      {appSheets}
      {toast}
    </SafeAreaView>
  );
}
