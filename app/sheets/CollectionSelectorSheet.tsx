import { useEffect, useRef, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { Animated, Dimensions, Easing, FlatList, Keyboard, Platform, View } from "react-native";
import type { FlatListProps } from "react-native";
import { Check, Folder, Plus, MagnifyingGlass as Search, Sparkle } from "phosphor-react-native";

import type { Capture, Collection, LoadPhase } from "../types";
import { collectionSelectionActionState } from "../captureLogic";
import { captureFieldRationale, collectionCountLabel } from "../capturePresentation";
import {
  AiFieldInsight,
  AnimatedBottomSheet,
  CollectionFormFields,
  CollectionSuggestionCard,
  MotionPressable,
  SheetHeader,
  SuggestionPendingToken
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
    toggleCollectionSelection
  } = actions;

  // "pick" = browse/select existing collections; "create" = the focused new-collection step.
  const [step, setStep] = useState<"pick" | "create">("pick");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDescription, setDraftDescription] = useState("");

  // The create step is a bottom-anchored sheet, so the keyboard would cover it.
  // Lift it by padding the sheet above the keyboard; prime with the last/estimated
  // height on entry so the sheet rises with the keyboard instead of snapping after.
  const lastKeyboardHeight = useRef(0);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardDidShow", (event) => {
      const height = event.endCoordinates?.height ?? 0;
      if (height > 0) {
        lastKeyboardHeight.current = height;
        setKeyboardHeight(height);
      }
    });
    const hideSub = Keyboard.addListener("keyboardDidHide", () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Reset the sheet back to the picker whenever it closes so it never re-opens mid-create.
  useEffect(() => {
    if (!collectionPickerOpen) {
      setStep("pick");
      setDraftTitle("");
      setDraftDescription("");
      setKeyboardHeight(0);
    }
  }, [collectionPickerOpen]);

  // Slide + fade the active step in (imperative RN Animated; the outgoing step unmounts).
  const enter = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    enter.setValue(0);
    const anim = Animated.timing(enter, {
      toValue: 1,
      duration: 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true
    });
    anim.start();
    return () => anim.stop();
  }, [step, enter]);
  const stepTranslateX = enter.interpolate({
    inputRange: [0, 1],
    outputRange: [(step === "create" ? 1 : -1) * 20, 0]
  });

  const currentCollectionIds = (selected.linkedCollections || []).map((collection) => collection.id);
  const selectedCollectionIds = new Set(collectionSelectionIds);
  const selectionAction = collectionSelectionActionState(selected, collectionSelectionIds, currentCollectionIds);
  const selectionSaving = collectionChoiceSaving === "set-collections";
  const selectionTerm = collectionPickerQuery.trim().toLowerCase();
  const collectionSelectorColdLoading =
    collectionsLoadPhase === "cold" && collectionsLoading && !activeCollectionsLoadedOnce && !collections.length;
  // Per-collection AI rationale ("I picked PT because…"), keyed by collection id so it can be
  // shown inline on the row it explains. Built before the list so AI-picked rows can lead.
  const analysisRationaleById = new Map<string, string>();
  (selected.linkedCollections || []).forEach((collection) => {
    const rationale = (collection.rationale || "").trim();
    if (collection.createdBy === "analysis" && rationale) {
      analysisRationaleById.set(collection.id, rationale);
    }
  });
  // The field-level collection reason ("No collection because…") lives here, at the top of
  // the sheet — NOT inline on the capture-edit screen. This sheet is the single home for the
  // collection insight; do not mirror it back onto CaptureReviewScreen. It only shows when the
  // AI made no pick (no per-row "why" cards), so it never duplicates analysisRationaleById.
  const collectionRationale = captureFieldRationale(selected, "collection", { collectionSelectionIds });
  const showCollectionRationale = collectionRationale.visible && analysisRationaleById.size === 0;
  const visibleCollections = collectionSelectorColdLoading
    ? []
    : collections
        .filter((collection) => collection.status === "active")
        .filter(
          (collection) =>
            !selectionTerm ||
            [collection.title, collection.description].join(" ").toLowerCase().includes(selectionTerm)
        )
        // Pin AI-picked collections to the top so their reason reads without scrolling.
        // Stable sort: rows without a rationale keep their incoming order.
        .sort(
          (a, b) =>
            (analysisRationaleById.has(b.id) ? 1 : 0) - (analysisRationaleById.has(a.id) ? 1 : 0)
        );
  const selectionCountText = collectionSelectionIds.length ? `${collectionSelectionIds.length} selected` : "No collection";
  const pendingSuggestion = selected.pendingSuggestion || null;
  // Analysis is ready but the new-Collection suggestion is still resolving in the background.
  const suggestionPending = !pendingSuggestion &&
    selected.collectionSuggestionState === "pending";
  // The AI suggestion must be resolved (or finish resolving) before adding a collection by hand.
  const canCreate = !pendingSuggestion && !suggestionPending && !selectionTerm;
  const draftReady = Boolean(draftTitle.trim() && draftDescription.trim());


  const completeSelection = () => {
    if (selectionAction.shouldSave) saveCollectionSelection();
    else closeCollectionPicker();
  };

  const goToCreate = () => {
    // Dock the sheet above the keyboard before it rises (it will refine on keyboardDidShow).
    setKeyboardHeight(lastKeyboardHeight.current || Math.round(Dimensions.get("screen").height * 0.4));
    setStep("create");
  };

  const backToPick = () => {
    Keyboard.dismiss();
    setDraftTitle("");
    setDraftDescription("");
    setStep("pick");
  };

  const submitCreate = () => {
    if (!draftReady || pickerCreating) return;
    createCollection(draftTitle.trim(), draftDescription.trim());
    Keyboard.dismiss();
    setDraftTitle("");
    setDraftDescription("");
    setStep("pick");
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
      ) : suggestionPending ? (
        <View style={styles.collectionSelectorSuggestion}>
          <SuggestionPendingToken label="Finding a collection" />
        </View>
      ) : null}
      {canCreate ? (
        <MotionPressable
          accessibilityRole="button"
          onPress={goToCreate}
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

  const pickStep = (
    <>
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
      {showCollectionRationale ? <AiFieldInsight insight={collectionRationale} /> : null}
      <View style={[styles.collectionSelectorSearchInput, styles.collectionSelectorSearchInputSheet]}>
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
      <FlatList
        {...collectionsListPerfProps}
        data={visibleCollections}
        keyExtractor={(item) => item.id}
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => {
          const selectedRow = selectedCollectionIds.has(item.id);
          const whyText = analysisRationaleById.get(item.id);
          return (
            <Animated.View style={{ opacity: collectionListFade }}>
              <MotionPressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selectedRow }}
                onPress={() => toggleCollectionSelection(item.id)}
                style={({ pressed }) => [
                  styles.collectionChoiceRow,
                  styles.collectionChoiceRowSheet,
                  selectedRow && styles.collectionChoiceRowSelected,
                  pressed && styles.collectionChoiceRowPressedSheet
                ]}
                testID={`pc.collection.select.${item.id}`}
              >
                <View style={styles.collectionChoiceBody}>
                  <View style={styles.collectionRowTop}>
                    <View style={styles.collectionIconMark}>
                      <Folder color={colors.collectionAccentText} size={18} weight="bold" />
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
                  {whyText ? (
                    <View style={styles.collectionWhyCard} testID={`pc.collection.why.${item.id}`}>
                      <View style={styles.collectionWhyCardIcon}>
                        <Sparkle color={colors.accentTextStrong} size={14} weight="fill" />
                      </View>
                      <Text style={styles.collectionWhyCardText}>{whyText}</Text>
                    </View>
                  ) : null}
                </View>
                <View style={[styles.collectionSelectionControl, selectedRow && styles.collectionSelectionControlSelected]}>
                  {selectedRow ? <Check color={colors.onCollectionAccent} size={15} weight="bold" /> : null}
                </View>
              </MotionPressable>
            </Animated.View>
          );
        }}
        ItemSeparatorComponent={() => <View style={styles.collectionChoiceSeparatorSheet} />}
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
    </>
  );

  const createStep = (
    <>
      <SheetHeader
        closeLabel="Close Collection selection"
        confirmDisabled={!draftReady || pickerCreating}
        confirmLabel={pickerCreating ? "Creating" : "Create"}
        confirmTestID="pc.collection.create.submit"
        onBack={backToPick}
        onClose={closeCollectionPicker}
        onConfirm={submitCreate}
        subtitle="What belongs in this collection?"
        title="New collection"
      />
      <View style={styles.collectionCreateStepBody}>
        <CollectionFormFields
          autoFocusTitle
          description={draftDescription}
          descriptionTestID="pc.collection.create.description"
          onDescriptionChange={setDraftDescription}
          onTitleChange={setDraftTitle}
          title={draftTitle}
          titleTestID="pc.collection.create.title"
        />
      </View>
    </>
  );

  return (
    <AnimatedBottomSheet
      closeLabel="Close Collection selection"
      onClose={closeCollectionPicker}
      sheetStyle={[
        styles.actionSheet,
        styles.collectionSelectorSheet,
        keyboardHeight > 0
          ? {
              paddingBottom: keyboardHeight + 16,
              // Pin the picker tall while typing so filtering down to a few results
              // can't collapse it behind the keyboard; the create step stays compact.
              ...(step === "pick"
                ? { minHeight: Math.round(Dimensions.get("screen").height * 0.62) }
                : null)
            }
          : null
      ]}
      visible={collectionPickerOpen}
    >
      <View style={styles.sheetGrabber} />
      <Animated.View style={[styles.collectionStepPane, { opacity: enter, transform: [{ translateX: stepTranslateX }] }]}>
        {step === "pick" ? pickStep : createStep}
      </Animated.View>
      {toast}
    </AnimatedBottomSheet>
  );
}
