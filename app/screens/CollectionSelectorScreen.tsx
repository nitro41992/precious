import type { ReactElement, ReactNode } from "react";
import { Animated, FlatList, Platform, View } from "react-native";
import type { FlatListProps } from "react-native";
import { ArrowLeft, Check, Folder, MagnifyingGlass as Search, Plus } from "phosphor-react-native";

import type { Capture, Collection, LoadPhase } from "../types";
import { collectionSelectionActionState } from "../captureLogic";
import { captureFieldRationale, collectionCountLabel, splitCollectionsByRecency } from "../capturePresentation";
import {
  AiFieldInsight,
  AnimatedBottomSheet,
  CollapsibleInsight,
  CollectionPredictionCard,
  IconButton,
  MotionPressable,
  SuggestionPendingToken
} from "../ui/components";
import { styles } from "../ui/styles";
import { colors } from "../ui/theme";
import { Text, TextInput } from "../ui/typography";

type CollectionSelectorScreenProps = {
  data: {
    collectionComposerSheet: ReactNode;
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
    suggestionBusy: boolean;
  };
  actions: {
    closeCollectionPicker: () => void;
    confirmSuggestion: (collectionId: string) => void;
    dismissSuggestion: (collectionId: string, captureId: string) => void;
    openCreateCollection: () => void;
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

// A row in the picker list: a tonal section label ("Recent" / "All") or a
// selectable collection. Sections only appear when the library is large enough
// to split; a small library renders as one flat list.
type PickerRow =
  | { kind: "section"; key: string; label: string }
  | { kind: "collection"; key: string; collection: Collection };

const RECENT_SHELF_LIMIT = 5;

export function CollectionSelectorScreen({ actions, data, state }: CollectionSelectorScreenProps) {
  const {
    collectionComposerSheet,
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
    suggestionBusy
  } = state;
  const {
    closeCollectionPicker,
    confirmSuggestion,
    dismissSuggestion,
    openCreateCollection,
    renderCollectionSkeletonRows,
    saveCollectionSelection,
    setCollectionPickerQuery,
    toggleCollectionSelection
  } = actions;

  const currentCollectionIds = (selected.linkedCollections || []).map((collection) => collection.id);
  const selectedCollectionIds = new Set(collectionSelectionIds);
  const selectionAction = collectionSelectionActionState(selected, collectionSelectionIds, currentCollectionIds);
  const selectionSaving = collectionChoiceSaving === "set-collections";
  const selectionTerm = collectionPickerQuery.trim().toLowerCase();
  const collectionSelectorColdLoading =
    collectionsLoadPhase === "cold" && collectionsLoading && !activeCollectionsLoadedOnce && !collections.length;

  // Per-collection AI rationale ("I picked PT because…"), keyed by collection id so
  // it can show inline on the row it explains. This — and the suggestion card — are
  // the ONLY homes for AI reasoning here; there is no separate field-insight pill,
  // which would just repeat the suggestion card or the row's own "why".
  const analysisRationaleById = new Map<string, string>();
  (selected.linkedCollections || []).forEach((collection) => {
    const rationale = (collection.rationale || "").trim();
    if (collection.createdBy === "analysis" && rationale) {
      analysisRationaleById.set(collection.id, rationale);
    }
  });

  const activeCollections = collections.filter((collection) => collection.status === "active");
  const matchesTerm = (collection: Collection) =>
    !selectionTerm ||
    [collection.title, collection.description].join(" ").toLowerCase().includes(selectionTerm);

  const pendingSuggestion = selected.pendingSuggestion || null;
  // Analysis is ready but the new-collection suggestion is still resolving.
  const suggestionPending = !pendingSuggestion && selected.collectionSuggestionState === "pending";
  // The AI suggestion must resolve before adding a collection by hand, and the
  // create affordance is hidden while filtering.
  const canCreate = !pendingSuggestion && !suggestionPending && !selectionTerm;

  // The single AI prediction surfaced as the premium card: a pending NEW-collection
  // suggestion, or the first EXISTING collection the AI picked (with its reason).
  // While searching we drop the card and let that pick fall back into the results,
  // so it stays findable.
  const aiPickedCollection =
    !pendingSuggestion && !selectionTerm
      ? activeCollections.find((collection) => analysisRationaleById.has(collection.id)) || null
      : null;
  // The picked collection lives in the card, not the list, so the list never
  // carries a special nested row — every row reads the same.
  const listCollections = aiPickedCollection
    ? activeCollections.filter((collection) => collection.id !== aiPickedCollection.id)
    : activeCollections;

  // Build the list rows. While searching, one flat result list. Otherwise split
  // into a "Recent" shelf + "All", but only label the groups when the library is
  // large enough to actually split (a short list stays flat and unlabelled).
  let rows: PickerRow[] = [];
  if (!collectionSelectorColdLoading) {
    if (selectionTerm) {
      rows = listCollections
        .filter(matchesTerm)
        .map((collection) => ({ kind: "collection", key: collection.id, collection }));
    } else {
      const { recent, rest } = splitCollectionsByRecency(
        listCollections,
        collectionSelectionIds,
        RECENT_SHELF_LIMIT
      );
      const asRows = (group: Collection[]): PickerRow[] =>
        group.map((collection) => ({ kind: "collection", key: collection.id, collection }));
      rows = rest.length
        ? [
            { kind: "section", key: "section-recent", label: "Recent" },
            ...asRows(recent),
            { kind: "section", key: "section-all", label: "All" },
            ...asRows(rest)
          ]
        : asRows(recent);
    }
  }

  // The AI's "No collection because…" read, shown only when nothing is filed yet
  // (i.e. the AI recommended none and the user hasn't picked one). It collapses
  // away the moment a collection is selected. The AI PICK / SUGGESTED cards carry
  // their own reasoning, so this insight only fills the otherwise-empty card slot.
  const collectionInsight = captureFieldRationale(selected, "collection", {
    collectionSelectionIds
  });

  const selectionCountText = collectionSelectionIds.length
    ? `${collectionSelectionIds.length} selected`
    : "No collection yet";

  const completeSelection = () => {
    if (selectionAction.shouldSave) saveCollectionSelection();
    else closeCollectionPicker();
  };

  const predictionCard = pendingSuggestion ? (
    <CollectionPredictionCard
      busy={suggestionBusy}
      description={pendingSuggestion.description}
      onConfirm={() => confirmSuggestion(pendingSuggestion.collectionId)}
      onDismiss={() => dismissSuggestion(pendingSuggestion.collectionId, selected.remoteId || selected.id)}
      rationale={pendingSuggestion.rationale}
      testID="pc.collection.suggestion"
      title={pendingSuggestion.title}
      variant="suggested"
    />
  ) : aiPickedCollection ? (
    <CollectionPredictionCard
      captureCountLabel={collectionCountLabel(aiPickedCollection.captureCount)}
      description={aiPickedCollection.description}
      onToggle={() => toggleCollectionSelection(aiPickedCollection.id)}
      rationale={analysisRationaleById.get(aiPickedCollection.id)}
      selected={selectedCollectionIds.has(aiPickedCollection.id)}
      testID="pc.collection.pick"
      title={aiPickedCollection.title}
      variant="picked"
    />
  ) : null;

  const listHeader = (
    <View>
      {predictionCard ? (
        <View style={styles.collectionSelectorSuggestion}>{predictionCard}</View>
      ) : suggestionPending ? (
        <View style={styles.collectionSelectorSuggestion}>
          <SuggestionPendingToken label="Finding a collection" />
        </View>
      ) : (
        <CollapsibleInsight visible={collectionInsight.visible && !selectionTerm}>
          <View style={styles.collectionSelectorSuggestion}>
            <AiFieldInsight insight={collectionInsight} />
          </View>
        </CollapsibleInsight>
      )}
      {canCreate ? (
        <MotionPressable
          accessibilityRole="button"
          onPress={openCreateCollection}
          style={({ pressed }) => [styles.collectionCreateRow, pressed && styles.collectionCreateRowPressed]}
          testID="pc.collection.create.open"
        >
          <View style={styles.collectionCreateIcon}>
            <Plus color={colors.collectionAccentText} size={18} weight="bold" />
          </View>
          <Text style={styles.collectionCreateLabel}>New collection</Text>
        </MotionPressable>
      ) : null}
    </View>
  );

  const renderRow = ({ item }: { item: PickerRow }) => {
    if (item.kind === "section") {
      return <Text style={styles.collectionPickerSectionLabel}>{item.label}</Text>;
    }
    const collection = item.collection;
    const selectedRow = selectedCollectionIds.has(collection.id);
    return (
      <Animated.View style={{ opacity: collectionListFade }}>
        <MotionPressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: selectedRow }}
          onPress={() => toggleCollectionSelection(collection.id)}
          style={({ pressed }) => [
            styles.collectionChoiceRow,
            styles.collectionChoiceRowSheet,
            selectedRow && styles.collectionChoiceRowSelected,
            pressed && styles.collectionChoiceRowPressedSheet
          ]}
          testID={`pc.collection.select.${collection.id}`}
        >
          <View style={styles.collectionChoiceBody}>
            <View style={styles.collectionRowTop}>
              <View style={styles.collectionIconMark}>
                <Folder color={colors.collectionAccentText} size={18} weight="bold" />
              </View>
              <View style={styles.collectionRowCopy}>
                <Text numberOfLines={1} style={styles.collectionChoiceTitle}>
                  {collection.title}
                </Text>
                <Text style={styles.meta}>{collectionCountLabel(collection.captureCount)}</Text>
              </View>
            </View>
            {collection.description ? (
              <Text numberOfLines={2} style={styles.summaryPreview}>
                {collection.description}
              </Text>
            ) : null}
          </View>
          <View style={[styles.collectionSelectionControl, selectedRow && styles.collectionSelectionControlSelected]}>
            {selectedRow ? <Check color={colors.onCollectionAccent} size={15} weight="bold" /> : null}
          </View>
        </MotionPressable>
      </Animated.View>
    );
  };

  return (
    <AnimatedBottomSheet
      closeLabel="Close collection selection"
      onClose={closeCollectionPicker}
      sheetStyle={styles.collectionPickerSheet}
      visible={collectionPickerOpen}
    >
      <View style={styles.collectionPickerContent}>
        <View style={styles.collectionPickerHeader}>
          <IconButton Icon={ArrowLeft} label="Close collection selection" onPress={closeCollectionPicker} />
          <View style={styles.collectionPickerHeaderCopy}>
            <Text style={styles.collectionPickerTitle}>Add to collection</Text>
            <Text numberOfLines={1} style={styles.collectionPickerSubtitle}>
              {selectionCountText}
            </Text>
          </View>
        </View>
        <View style={styles.collectionPickerBody}>
          <View style={styles.collectionSelectorSearchInput}>
            <Search color={colors.muted} size={18} weight="bold" />
            <TextInput
              onChangeText={setCollectionPickerQuery}
              placeholder="Search collections"
              placeholderTextColor={colors.placeholder}
              style={styles.searchInputNative}
              testID="pc.collection.select.search"
              value={collectionPickerQuery}
            />
          </View>
        </View>
        <FlatList<PickerRow>
          {...(collectionsListPerfProps as Partial<FlatListProps<PickerRow>>)}
          data={rows}
          keyExtractor={(item) => item.key}
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          keyboardShouldPersistTaps="handled"
          renderItem={renderRow}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={
            collectionSelectorColdLoading && collectionsColdSkeletonVisible ? (
              renderCollectionSkeletonRows(4, true, activeCollections)
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
          contentContainerStyle={styles.collectionPickerListContent}
          style={styles.collectionPickerList}
        />
        <View style={styles.collectionSelectionFooter}>
          <MotionPressable
            disabled={selectionSaving}
            onPress={completeSelection}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && !selectionSaving && styles.primaryButtonPressed,
              selectionSaving && styles.disabledButton
            ]}
            testID="pc.collection.select.save"
          >
            <View style={styles.primaryButtonContent}>
              {!selectionSaving && selectionAction.shouldSave ? (
                <Check color={colors.onAccent} size={18} weight="bold" />
              ) : null}
              <Text style={styles.primaryButtonText}>
                {selectionSaving ? "Saving..." : selectionAction.label}
              </Text>
            </View>
          </MotionPressable>
        </View>
      </View>
      {collectionComposerSheet}
      {toast}
    </AnimatedBottomSheet>
  );
}
