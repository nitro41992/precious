import { useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { Animated, FlatList, Platform, View } from "react-native";
import type { FlatListProps } from "react-native";
import { Check, Folder, Plus, MagnifyingGlass as Search } from "phosphor-react-native";

import type { Capture, Collection, LoadPhase } from "../types";
import { collectionSelectionActionState } from "../captureLogic";
import { captureFieldRationale, collectionCountLabel } from "../capturePresentation";
import {
  AiFieldInsight,
  AnimatedBottomSheet,
  CollectionSuggestionCard,
  MotionPressable,
  SheetHeader
} from "../ui/components";
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
    pickerCreating: boolean;
    suggestionBusy: boolean;
  };
  actions: {
    closeCollectionPicker: () => void;
    confirmSuggestion: (collectionId: string) => void;
    createCollection: (title: string, description: string) => void;
    dismissSuggestion: (collectionId: string, captureId: string) => void;
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
    collectionsLoading,
    pickerCreating,
    suggestionBusy
  } = state;
  const {
    closeCollectionPicker,
    confirmSuggestion,
    createCollection,
    dismissSuggestion,
    renderCollectionSkeletonRows,
    saveCollectionSelection,
    setCollectionPickerQuery,
    setCollectionSelectionIds,
    toggleCollectionSelection
  } = actions;

  const [creating, setCreating] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDescription, setDraftDescription] = useState("");

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
  const pendingSuggestion = selected.pendingSuggestion || null;
  // The AI suggestion must be resolved before adding a collection by hand.
  const canCreate = !pendingSuggestion && !selectionTerm;
  const draftReady = Boolean(draftTitle.trim() && draftDescription.trim());

  const completeSelection = () => {
    if (selectionAction.shouldSave) saveCollectionSelection();
    else closeCollectionPicker();
  };

  const resetCreate = () => {
    setCreating(false);
    setDraftTitle("");
    setDraftDescription("");
  };

  const submitCreate = () => {
    if (!draftReady || pickerCreating) return;
    createCollection(draftTitle, draftDescription);
    resetCreate();
  };

  const listHeader = (
    <View>
      {pendingSuggestion ? (
        <View style={styles.collectionSelectorSuggestion}>
          <CollectionSuggestionCard
            busy={suggestionBusy}
            onConfirm={() => confirmSuggestion(pendingSuggestion.collectionId)}
            onDismiss={() =>
              dismissSuggestion(pendingSuggestion.collectionId, selected.remoteId || selected.id)
            }
            suggestion={pendingSuggestion}
            testID="pc.collection.suggestion"
          />
        </View>
      ) : null}
      {canCreate ? (
        creating ? (
          <View style={styles.collectionCreateForm}>
            <TextInput
              autoFocus
              maxLength={50}
              onChangeText={setDraftTitle}
              placeholder="Collection name"
              placeholderTextColor={colors.placeholder}
              style={styles.collectionCreateInput}
              testID="pc.collection.create.title"
              value={draftTitle}
            />
            <TextInput
              maxLength={160}
              multiline
              onChangeText={setDraftDescription}
              placeholder="What belongs here"
              placeholderTextColor={colors.placeholder}
              style={styles.collectionCreateInput}
              testID="pc.collection.create.description"
              value={draftDescription}
            />
            <View style={styles.collectionCreateActions}>
              <MotionPressable
                accessibilityRole="button"
                onPress={resetCreate}
                style={({ pressed }) => [styles.collectionCreateCancel, pressed && styles.subtlePressed]}
              >
                <Text style={styles.collectionCreateCancelText}>Cancel</Text>
              </MotionPressable>
              <MotionPressable
                accessibilityRole="button"
                disabled={!draftReady || pickerCreating}
                onPress={submitCreate}
                style={({ pressed }) => [
                  styles.collectionCreateSubmit,
                  (!draftReady || pickerCreating) && styles.suggestionDisabled,
                  pressed && styles.subtlePressed
                ]}
                testID="pc.collection.create.submit"
              >
                <Text style={styles.collectionCreateSubmitText}>{pickerCreating ? "Creating" : "Create"}</Text>
              </MotionPressable>
            </View>
          </View>
        ) : (
          <MotionPressable
            accessibilityRole="button"
            onPress={() => setCreating(true)}
            style={({ pressed }) => [styles.collectionCreateRow, pressed && styles.captureRowPressed]}
            testID="pc.collection.create.open"
          >
            <View style={styles.collectionCreateIcon}>
              <Plus color={colors.accentTextStrong} size={18} weight="bold" />
            </View>
            <Text style={styles.collectionCreateLabel}>New collection</Text>
          </MotionPressable>
        )
      ) : null}
    </View>
  );

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
        {rationale.visible && !pendingSuggestion ? (
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
                <MotionPressable
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
                </MotionPressable>
              </Animated.View>
            );
          }}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={
            collectionSelectorColdLoading && collectionsColdSkeletonVisible ? (
              renderCollectionSkeletonRows(4, true, collections.filter((collection) => collection.status === "active"))
            ) : collectionSelectorColdLoading ? (
              <View style={styles.loadingQuietSpace} />
            ) : (
              <View style={styles.collectionEmpty}>
                <Text style={styles.emptyTitle}>
                  {selectionTerm ? "No matching collections." : "No collections yet."}
                </Text>
                <Text style={styles.emptyText}>
                  {pendingSuggestion
                    ? "Confirm or dismiss the suggestion above, then add your own."
                    : "Tap New collection to make your first one."}
                </Text>
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
