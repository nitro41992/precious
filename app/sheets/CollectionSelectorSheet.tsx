import type { ReactElement, ReactNode } from "react";
import { Animated, FlatList, Platform, Pressable, View } from "react-native";
import type { FlatListProps } from "react-native";
import { Check, Folder, MagnifyingGlass as Search, X } from "phosphor-react-native";

import type { Capture, Collection, LoadPhase } from "../types";
import { collectionSelectionActionState } from "../captureLogic";
import { captureFieldRationale, collectionCountLabel } from "../capturePresentation";
import { AiFieldInsight, AnimatedBottomSheet, SheetHeader } from "../ui/components";
import { styles } from "../ui/styles";
import { colors } from "../ui/theme";
import { Text, TextInput } from "../ui/typography";

type CollectionSelectorSheetProps = {
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
    collectionPickerOpen: boolean;
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

export function CollectionSelectorSheet({ actions, data, state }: CollectionSelectorSheetProps) {
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
    collectionPickerOpen,
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
  const rationale = captureFieldRationale(selected, "collection", { collectionSelectionIds });
  const completeSelection = () => {
    if (selectionAction.shouldSave) saveCollectionSelection();
    else closeCollectionPicker();
  };

  return (
    <AnimatedBottomSheet
      closeLabel="Close Collection selection"
      onClose={closeCollectionPicker}
      sheetStyle={[styles.actionSheet, styles.collectionSelectorSheet]}
      visible={collectionPickerOpen}
    >
        <View style={styles.sheetGrabber} />
        <SheetHeader
          closeLabel="Close Collection selection"
          confirmDisabled={selectionSaving}
          confirmLabel={selectionSaving ? "Saving collections" : selectionAction.label}
          confirmTestID="pc.collection.select.save"
          onClose={closeCollectionPicker}
          onConfirm={completeSelection}
          subtitle={selectionCountText}
          title="Collection"
        />
        <View style={[styles.collectionSelectorSearchInput, styles.collectionSelectorSearchInputSheet]}>
          <Search color={colors.muted} size={18} weight="regular" />
          <TextInput
            onChangeText={setCollectionPickerQuery}
            placeholder="Search collections"
            placeholderTextColor={colors.placeholder}
            style={styles.searchInputNative}
            testID="pc.collection.select.search"
            value={collectionPickerQuery}
          />
        </View>
        {rationale.visible ? (
          <AiFieldInsight insight={rationale} />
        ) : null}
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
                  style={({ pressed }) => [
                    styles.collectionChoiceRow,
                    styles.collectionChoiceRowSheet,
                    pressed && styles.captureRowPressed
                  ]}
                  testID={`pc.collection.select.${item.id}`}
                >
                  <View style={styles.collectionChoiceBody}>
                    <View style={styles.collectionRowTop}>
                      <View style={styles.collectionIconMark}>
                        <Folder color={colors.collectionAccentText} size={18} weight="regular" />
                      </View>
                      <View style={styles.collectionRowCopy}>
                        <Text numberOfLines={1} style={styles.collectionChoiceTitle}>
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
                    {selectedRow ? <Check color={colors.onAccent} size={15} weight="bold" /> : null}
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
              style={({ pressed }) => [
                styles.collectionChoiceRow,
                styles.collectionChoiceRowSheet,
                pressed && styles.captureRowPressed
              ]}
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
                      color={collectionSelectionIds.length === 0 ? colors.accentText : colors.muted}
                      size={18}
                      weight={collectionSelectionIds.length === 0 ? "bold" : "regular"}
                    />
                  </View>
                  <View style={styles.collectionRowCopy}>
                    <Text numberOfLines={1} style={styles.collectionChoiceTitle}>No collection</Text>
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
                {collectionSelectionIds.length === 0 ? <Check color={colors.onAccent} size={15} weight="bold" /> : null}
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
          contentContainerStyle={styles.collectionSelectorSheetListContent}
          style={styles.collectionSelectorSheetList}
        />
        {toast}
    </AnimatedBottomSheet>
  );
}
