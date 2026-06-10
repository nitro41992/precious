import { useCallback, useEffect } from "react";
import type { MutableRefObject, RefObject } from "react";
import {
  Animated,
  BackHandler,
  Easing,
  Platform
} from "react-native";
import type { TextInput } from "react-native";
import { Easing as ReanimatedEasing, runOnJS, withTiming } from "react-native-reanimated";
import type { SharedValue } from "react-native-reanimated";
import { useKeyboardHandler } from "react-native-keyboard-controller";

import type {
  Capture,
  CaptureComposerMode,
  Collection
} from "../types";

export function useAppUiEffects({
  settingsOpen,
  deleteConfirmOpen,
  captureComposerClosing,
  captureComposerClosingRef,
  captureSheetOpen,
  keyboardAnimationDurationRef,
  captureImagePickerActiveRef,
  captureMode,
  captureModeRef,
  captures,
  closeCaptureComposer,
  closeCollectionComposer,
  closeCollectionDetail,
  closeCollectionPicker,
  closeNoteSheet,
  closeTitleSheet,
  closeSelectedCapture,
  collectionSearchOpen,
  collectionPickerOpen,
  collectionDraftDirty,
  collectionTitleInputRef,
  collections,
  collectionsOpen,
  draftNoteDirty,
  draftTitleDirty,
  noteInputRef,
  noteSheetOpen,
  titleInputRef,
  titleSheetOpen,
  pickingCaptureImage,
  reminderSheetOpen,
  reviewMotion,
  searchMotion,
  searchOpen,
  suggestionsOpen,
  selectCapture,
  selectCollection,
  selectedCollectionId,
  selectedId,
  setSettingsOpen,
  setDeleteConfirmOpen,
  setCollectionDescription,
  setCollectionSearchOpen,
  setCollectionTitle,
  setCollectionsOpen,
  setDraftNote,
  setDraftTitle,
  setKeyboardHeight,
  setReminderSheetOpen,
  setSearchOpen,
  setSuggestionsOpen,
  showCaptureComposer,
  showCollectionForm,
  skeletonPulse,
  sourceInputRef
}: {
  settingsOpen: boolean;
  deleteConfirmOpen: boolean;
  captureComposerClosing: boolean;
  captureComposerClosingRef: MutableRefObject<boolean>;
  captureSheetOpen: SharedValue<number>;
  keyboardAnimationDurationRef: MutableRefObject<number>;
  captureImagePickerActiveRef: MutableRefObject<boolean>;
  captureMode: CaptureComposerMode;
  captureModeRef: MutableRefObject<CaptureComposerMode>;
  captures: Capture[];
  closeCaptureComposer: () => void;
  closeCollectionComposer: () => void;
  closeCollectionDetail: () => void;
  closeCollectionPicker: () => void;
  closeNoteSheet: () => void;
  closeTitleSheet: () => void;
  closeSelectedCapture: () => void;
  collectionSearchOpen: boolean;
  collectionPickerOpen: boolean;
  collectionDraftDirty: boolean;
  collectionTitleInputRef: RefObject<TextInput | null>;
  collections: Collection[];
  collectionsOpen: boolean;
  draftNoteDirty: boolean;
  draftTitleDirty: boolean;
  noteInputRef: RefObject<TextInput | null>;
  noteSheetOpen: boolean;
  titleInputRef: RefObject<TextInput | null>;
  titleSheetOpen: boolean;
  pickingCaptureImage: boolean;
  reminderSheetOpen: boolean;
  reviewMotion: Animated.Value;
  searchMotion: Animated.Value;
  searchOpen: boolean;
  suggestionsOpen: boolean;
  selectCapture: (captureId: string | null) => void;
  selectCollection: (collectionId: string | null) => void;
  selectedCollectionId: string | null;
  selectedId: string | null;
  setSettingsOpen: (value: boolean) => void;
  setDeleteConfirmOpen: (value: boolean) => void;
  setCollectionDescription: (value: string) => void;
  setCollectionSearchOpen: (value: boolean) => void;
  setCollectionTitle: (value: string) => void;
  setCollectionsOpen: (value: boolean) => void;
  setDraftNote: (value: string) => void;
  setDraftTitle: (value: string) => void;
  setKeyboardHeight: (value: number) => void;
  setReminderSheetOpen: (value: boolean) => void;
  setSearchOpen: (value: boolean) => void;
  setSuggestionsOpen: (value: boolean) => void;
  showCaptureComposer: boolean;
  showCollectionForm: boolean;
  skeletonPulse: Animated.Value;
  sourceInputRef: RefObject<TextInput | null>;
}) {
  useEffect(() => {
    if (!selectedId) return;
    const capture = captures.find((item) => item.id === selectedId);
    if (!capture) return;
    if (!draftTitleDirty) setDraftTitle(capture.title);
    if (!draftNoteDirty) setDraftNote(capture.note);
  }, [
    captures,
    draftNoteDirty,
    draftTitleDirty,
    selectedId,
    setDraftNote,
    setDraftTitle
  ]);

  useEffect(() => {
    if (!selectedCollectionId) return;
    const collection = collections.find((item) => item.id === selectedCollectionId);
    if (!collection || collectionDraftDirty) return;
    setCollectionTitle(collection.title);
    setCollectionDescription(collection.description);
  }, [
    collectionDraftDirty,
    collections,
    selectedCollectionId,
    setCollectionDescription,
    setCollectionTitle
  ]);

  useEffect(() => {
    if (
      !selectedId &&
      !selectedCollectionId &&
      !searchOpen &&
      !collectionSearchOpen &&
      !showCaptureComposer &&
      !showCollectionForm &&
      !noteSheetOpen &&
      !titleSheetOpen &&
      !collectionPickerOpen &&
      !reminderSheetOpen &&
      !collectionsOpen &&
      !suggestionsOpen &&
      !settingsOpen &&
      !deleteConfirmOpen
    ) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (collectionPickerOpen) {
        closeCollectionPicker();
        return true;
      }
      if (reminderSheetOpen) {
        setReminderSheetOpen(false);
        return true;
      }
      // The delete-account confirmation sheet sits above the Settings screen, so
      // back dismisses the sheet first, then the screen.
      if (deleteConfirmOpen) {
        setDeleteConfirmOpen(false);
        return true;
      }
      if (settingsOpen) {
        setSettingsOpen(false);
        return true;
      }
      if (showCaptureComposer) {
        closeCaptureComposer();
        return true;
      }
      if (showCollectionForm) {
        closeCollectionComposer();
        return true;
      }
      if (noteSheetOpen) {
        closeNoteSheet();
        return true;
      }
      if (titleSheetOpen) {
        closeTitleSheet();
        return true;
      }
      // A selected capture review always overlays search / collection search
      // (it stays mounted beneath), so close the review first — otherwise the
      // first back tears down the search underlay and strands the review.
      if (selectedId) {
        closeSelectedCapture();
        return true;
      }
      if (searchOpen) {
        setSearchOpen(false);
        return true;
      }
      if (collectionSearchOpen) {
        setCollectionSearchOpen(false);
        return true;
      }
      if (selectedCollectionId) {
        // Animated close (same path as the back button) — a raw
        // selectCollection(null) would pop the detail with no exit flight.
        closeCollectionDetail();
        return true;
      }
      // After the detail closes, the suggestions overlay (if it was the entry
      // point) is next. Closing it returns to whichever pane it was opened over
      // (Collections or Recents), since openSuggestions leaves collectionsOpen as-is.
      if (suggestionsOpen) {
        setSuggestionsOpen(false);
        return true;
      }
      if (collectionsOpen) {
        setCollectionsOpen(false);
        return true;
      }
      selectCapture(null);
      selectCollection(null);
      return true;
    });
    return () => subscription.remove();
  }, [
    settingsOpen,
    deleteConfirmOpen,
    closeCaptureComposer,
    closeCollectionComposer,
    closeCollectionDetail,
    closeCollectionPicker,
    closeNoteSheet,
    closeTitleSheet,
    closeSelectedCapture,
    collectionSearchOpen,
    collectionPickerOpen,
    collectionsOpen,
    noteSheetOpen,
    titleSheetOpen,
    reminderSheetOpen,
    searchOpen,
    suggestionsOpen,
    selectCapture,
    selectCollection,
    selectedCollectionId,
    selectedId,
    setSettingsOpen,
    setDeleteConfirmOpen,
    setCollectionSearchOpen,
    setCollectionsOpen,
    setReminderSheetOpen,
    setSearchOpen,
    setSuggestionsOpen,
    showCaptureComposer,
    showCollectionForm
  ]);

  useEffect(() => {
    if (!searchOpen && !collectionSearchOpen && !suggestionsOpen) return;
    searchMotion.stopAnimation();
    searchMotion.setValue(0);
    Animated.timing(searchMotion, {
      duration: 180,
      easing: Easing.out(Easing.cubic),
      toValue: 1,
      useNativeDriver: true
    }).start();
  }, [collectionSearchOpen, searchMotion, searchOpen, suggestionsOpen]);

  useEffect(() => {
    if (!selectedId) return;
    reviewMotion.stopAnimation();
    reviewMotion.setValue(1);
  }, [reviewMotion, selectedId]);

  useEffect(() => {
    skeletonPulse.setValue(0);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(skeletonPulse, {
          duration: 820,
          easing: Easing.inOut(Easing.cubic),
          toValue: 1,
          useNativeDriver: true
        }),
        Animated.timing(skeletonPulse, {
          duration: 820,
          easing: Easing.inOut(Easing.cubic),
          toValue: 0,
          useNativeDriver: true
        })
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [skeletonPulse]);

  useEffect(() => {
    if ((!showCaptureComposer && !showCollectionForm && !noteSheetOpen && !titleSheetOpen) || captureComposerClosing) return;
    // Slide the sheet up from off-screen. Its keyboard tracking is owned by the
    // live worklet inside KeyboardSheet, so this drives only the open progress.
    captureSheetOpen.value = withTiming(1, {
      duration: 300,
      easing: ReanimatedEasing.out(ReanimatedEasing.cubic)
    });
  }, [
    captureComposerClosing,
    captureSheetOpen,
    noteSheetOpen,
    titleSheetOpen,
    showCaptureComposer,
    showCollectionForm
  ]);

  useEffect(() => {
    if (!showCaptureComposer || captureMode !== "link" || captureComposerClosing || pickingCaptureImage) return;
    const frame = requestAnimationFrame(() => {
      sourceInputRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [
    captureComposerClosing,
    captureMode,
    pickingCaptureImage,
    showCaptureComposer,
    sourceInputRef
  ]);

  useEffect(() => {
    // Create mode autofocuses the empty title; edit mode (a collection is
    // selected) opens calm with the keyboard down so the delete row stays
    // visible.
    if (!showCollectionForm || selectedCollectionId) return;
    const frame = requestAnimationFrame(() => {
      collectionTitleInputRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [collectionTitleInputRef, selectedCollectionId, showCollectionForm]);

  useEffect(() => {
    if (!noteSheetOpen) return;
    const frame = requestAnimationFrame(() => {
      noteInputRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [noteInputRef, noteSheetOpen]);

  useEffect(() => {
    if (!titleSheetOpen) return;
    const frame = requestAnimationFrame(() => {
      titleInputRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [titleInputRef, titleSheetOpen]);

  // Track the keyboard height for the sheet sizing clamp (keyboardSheetMetrics).
  // The sheet's *position* rides the live keyboard worklet inside KeyboardSheet;
  // this just keeps the JS-side height in sync so the max-height/compact layout
  // is right from the moment the keyboard starts moving.
  const applyKeyboardLayout = useCallback((height: number, duration: number) => {
    // Remember the keyboard's own animation duration so the close slide can match
    // it. Captured even mid-close so the next close uses a fresh value.
    if (duration > 0) keyboardAnimationDurationRef.current = duration;
    if (captureImagePickerActiveRef.current || captureComposerClosingRef.current) return;
    setKeyboardHeight(Math.max(0, Math.round(height)));
  }, [captureComposerClosingRef, captureImagePickerActiveRef, keyboardAnimationDurationRef, setKeyboardHeight]);

  // Android product behavior: dismissing the keyboard (back gesture, the keyboard's
  // own collapse) dismisses the open sheet — except the image tab, which has no
  // text field and dismisses the keyboard on purpose. Fired at the START of the
  // keyboard's downward animation so the sheet's close slide begins in the same
  // instant and the two leave together, routed through the one shared close path.
  const closeSheetForKeyboardDismiss = useCallback(() => {
    if (Platform.OS !== "android") return;
    if (captureImagePickerActiveRef.current || captureComposerClosingRef.current) return;
    if (collectionPickerOpen) {
      closeCollectionPicker();
      return;
    }
    const keepComposerForImage = showCaptureComposer && captureModeRef.current !== "link";
    if (keepComposerForImage) return;
    if (showCaptureComposer) closeCaptureComposer();
    else if (showCollectionForm) closeCollectionComposer();
    else if (noteSheetOpen) closeNoteSheet();
    else if (titleSheetOpen) closeTitleSheet();
  }, [
    captureComposerClosingRef,
    captureImagePickerActiveRef,
    captureModeRef,
    closeCaptureComposer,
    closeCollectionComposer,
    closeCollectionPicker,
    closeNoteSheet,
    closeTitleSheet,
    collectionPickerOpen,
    noteSheetOpen,
    showCaptureComposer,
    showCollectionForm,
    titleSheetOpen
  ]);

  // The OS keyboard animation, surfaced on the UI thread. onStart fires the moment
  // the keyboard begins moving — so we both size the sheet for the target height
  // and, when the keyboard is heading down, kick off the sheet close right then so
  // the two animate out as one. onEnd just settles the final height.
  useKeyboardHandler(
    {
      onStart: (event) => {
        "worklet";
        const target = Math.abs(event.height);
        runOnJS(applyKeyboardLayout)(target, event.duration);
        if (target < 1) runOnJS(closeSheetForKeyboardDismiss)();
      },
      onEnd: (event) => {
        "worklet";
        runOnJS(applyKeyboardLayout)(Math.abs(event.height), event.duration);
      }
    },
    [applyKeyboardLayout, closeSheetForKeyboardDismiss]
  );
}
