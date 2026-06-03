import type { ReactElement, ReactNode } from "react";
import { Animated, FlatList, Platform, Pressable, SafeAreaView, StatusBar, Text, TextInput, View } from "react-native";
import type { FlatListProps } from "react-native";
import { ArrowLeft, Check, Folder, Search, X } from "lucide-react-native";

import type { Capture, Collection, LoadPhase } from "../types";
import { collectionSelectionActionState } from "../captureLogic";
import { collectionCountLabel } from "../capturePresentation";
import { colors } from "../ui/theme";
import { styles } from "../ui/styles";
import { IconButton } from "../ui/components";

type CollectionSelectorScreenProps = {
  data: {
    collections: Collection[];
    collectionsColdSkeletonVisible: boolean;
    collectionsListPerfProps: Partial<FlatListProps<Collection>>;
    collectionListFade: Animated.Value;
    selected: Capture;
    toast: ReactNode;
  };
  state: {
    activeCollectionsLoadedOnce: boolean;
    collectionChoiceSaving: string | null;
    collectionPickerQuery: string;
    collectionSelectionIds: string[];
    collectionsLoadPhase: LoadPhase;
    collectionsLoading: boolean;
  };
  actions: {
    closeCollectionPicker: () => void;
    renderCollectionSkeletonRows: (
      count?: number,
      withSelectionControl?: boolean,
      skeletonCollections?: Collection[]
    ) => ReactElement | null;
    saveCollectionSelection: () => void;
    setCollectionPickerQuery: (value: string) => void;
    setCollectionSelectionIds: (ids: string[]) => void;
    toggleCollectionSelection: (collectionId: string) => void;
  };
};

export function CollectionSelectorScreen({ actions, data, state }: CollectionSelectorScreenProps) {
  const {
    collections,
    collectionsColdSkeletonVisible,
    collectionsListPerfProps,
    collectionListFade,
    selected,
    toast
  } = data;
  const {
    activeCollectionsLoadedOnce,
    collectionChoiceSaving,
    collectionPickerQuery,
    collectionSelectionIds,
    collectionsLoadPhase,
    collectionsLoading
  } = state;
  const {
    closeCollectionPicker,
    renderCollectionSkeletonRows,
    saveCollectionSelection,
    setCollectionPickerQuery,
    setCollectionSelectionIds,
    toggleCollectionSelection
  } = actions;

  const currentCollectionIds = (selected.linkedCollections || []).map((collection) => collection.id);
  const selectedCollectionIds = new Set(collectionSelectionIds);
  const selectionAction = collectionSelectionActionState(selected, collectionSelectionIds, currentCollectionIds);
  const selectionSaving = collectionChoiceSaving === "set-collections";
  const selectionTerm = collectionPickerQuery.trim().toLowerCase();
  const collectionSelectorColdLoading =
    collectionsLoadPhase === "cold" && collectionsLoading && !activeCollectionsLoadedOnce && !collections.length;
  const visibleCollections = collectionSelectorColdLoading
    ? []
    : collections
        .filter((collection) => collection.status === "active")
        .filter(
          (collection) =>
            !selectionTerm ||
            [collection.title, collection.description].join(" ").toLowerCase().includes(selectionTerm)
        );
  const selectionCountText = collectionSelectionIds.length ? `${collectionSelectionIds.length} selected` : "No collection";

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />
      <View style={styles.collectionSelectorScreen}>
        <View style={styles.collectionSelectorHeader}>
          <View style={styles.detailHeader}>
            <IconButton Icon={ArrowLeft} label="Back" onPress={closeCollectionPicker} />
            <Text style={styles.status}>{selectionCountText}</Text>
          </View>
          <Text style={styles.title}>Collections</Text>
          <Text style={styles.sourceText}>Choose from your existing collections for this capture.</Text>
          <View style={styles.collectionSelectorSearchInput}>
            <Search color={colors.muted} size={18} strokeWidth={2.2} />
            <TextInput
              onChangeText={setCollectionPickerQuery}
              placeholder="Search collections"
              placeholderTextColor={colors.muted}
              style={styles.searchInputNative}
              testID="pc.collection.select.search"
              value={collectionPickerQuery}
            />
          </View>
        </View>
        <FlatList
          {...collectionsListPerfProps}
          data={visibleCollections}
          keyExtractor={(item) => item.id}
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const selectedRow = selectedCollectionIds.has(item.id);
            return (
              <Animated.View style={{ opacity: collectionListFade }}>
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selectedRow }}
                  onPress={() => toggleCollectionSelection(item.id)}
                  style={({ pressed }) => [styles.collectionChoiceRow, pressed && styles.captureRowPressed]}
                  testID={`pc.collection.select.${item.id}`}
                >
                  <View style={styles.collectionChoiceBody}>
                    <View style={styles.collectionRowTop}>
                      <View style={styles.collectionIconMark}>
                        <Folder color={colors.accent} size={18} strokeWidth={2.2} />
                      </View>
                      <View style={styles.collectionRowCopy}>
                        <Text numberOfLines={1} style={styles.captureTitle}>
                          {item.title}
                        </Text>
                        <Text style={styles.meta}>{collectionCountLabel(item.captureCount)}</Text>
                      </View>
                    </View>
                    {item.description ? (
                      <Text numberOfLines={2} style={styles.summaryPreview}>
                        {item.description}
                      </Text>
                    ) : null}
                  </View>
                  <View style={[styles.collectionSelectionControl, selectedRow && styles.collectionSelectionControlSelected]}>
                    {selectedRow ? <Check color={colors.paper} size={15} strokeWidth={3} /> : null}
                  </View>
                </Pressable>
              </Animated.View>
            );
          }}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListHeaderComponent={
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: collectionSelectionIds.length === 0 }}
              onPress={() => setCollectionSelectionIds([])}
              style={({ pressed }) => [styles.collectionChoiceRow, pressed && styles.captureRowPressed]}
              testID="pc.collection.select.none"
            >
              <View style={styles.collectionChoiceBody}>
                <View style={styles.collectionRowTop}>
                  <View
                    style={[
                      styles.collectionNoCollectionIconMark,
                      collectionSelectionIds.length === 0 && styles.collectionNoCollectionIconMarkSelected
                    ]}
                  >
                    <X
                      color={collectionSelectionIds.length === 0 ? colors.accent : colors.muted}
                      size={18}
                      strokeWidth={2.2}
                    />
                  </View>
                  <View style={styles.collectionRowCopy}>
                    <Text numberOfLines={1} style={styles.captureTitle}>
                      No collection
                    </Text>
                    <Text style={styles.meta}>Leave this capture ungrouped.</Text>
                  </View>
                </View>
              </View>
              <View
                style={[
                  styles.collectionSelectionControl,
                  collectionSelectionIds.length === 0 && styles.collectionSelectionControlSelected
                ]}
              >
                {collectionSelectionIds.length === 0 ? <Check color={colors.paper} size={15} strokeWidth={3} /> : null}
              </View>
            </Pressable>
          }
          ListEmptyComponent={
            collectionSelectorColdLoading && collectionsColdSkeletonVisible ? (
              renderCollectionSkeletonRows(4, true, collections.filter((collection) => collection.status === "active"))
            ) : collectionSelectorColdLoading ? (
              <View style={styles.loadingQuietSpace} />
            ) : (
              <View style={styles.collectionEmpty}>
                <Text style={styles.emptyTitle}>
                  {selectionTerm ? "No matching collections." : "No active collections yet."}
                </Text>
                <Text style={styles.emptyText}>Create collections from the Collections tab.</Text>
              </View>
            )
          }
          contentContainerStyle={styles.collectionSelectorListContent}
          style={styles.collectionSelectorList}
        />
      </View>
      <View style={styles.collectionSelectionFooter}>
        <Pressable
          disabled={selectionSaving}
          onPress={() => {
            if (selectionAction.shouldSave) saveCollectionSelection();
            else closeCollectionPicker();
          }}
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && !selectionSaving && styles.primaryButtonPressed,
            selectionSaving && styles.disabledButton
          ]}
          testID="pc.collection.select.save"
        >
          <View style={styles.primaryButtonContent}>
            {!selectionSaving && selectionAction.shouldSave ? (
              <Check color={colors.onAccent} size={18} strokeWidth={2.8} />
            ) : null}
            <Text style={styles.primaryButtonText}>
              {selectionSaving ? "Saving..." : selectionAction.label}
            </Text>
          </View>
        </Pressable>
      </View>
      {toast}
    </SafeAreaView>
  );
}
