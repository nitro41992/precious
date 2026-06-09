import { useEffect } from "react";
import type { MutableRefObject, RefObject } from "react";
import {
  Animated,
  BackHandler,
  Easing,
  Keyboard,
  Platform
} from "react-native";
import type { TextInput } from "react-native";

import { normalizeIntent } from "../capturePresentation";
import type {
  Capture,
  CaptureComposerMode,
  Collection
} from "../types";

export function useAppUiEffects({
  accountSheetOpen,
  captureComposerClosing,
  captureComposerClosingRef,
  captureComposerMotion,
  captureImagePickerActiveRef,
  captureKeyboardInset,
  captureMode,
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
  draftIntentDirty,
  draftNoteDirty,
  draftTitleDirty,
  lastKeyboardHeightRef,
  noteInputRef,
  noteSheetOpen,
  titleInputRef,
  titleSheetOpen,
  pickingCaptureImage,
  quickIntentOpen,
  reminderSheetOpen,
  reviewMotion,
  searchMotion,
  searchOpen,
  suggestionsOpen,
  selectCapture,
  selectCollection,
  selectedCollectionId,
  selectedId,
  setAccountSheetOpen,
  setCollectionDescription,
  setCollectionSearchOpen,
  setCollectionTitle,
  setCollectionsOpen,
  setDraftIntent,
  setDraftNote,
  setDraftTitle,
  setKeyboardHeight,
  setQuickIntentOpen,
  setReminderSheetOpen,
  setSearchOpen,
  setSuggestionsOpen,
  showCaptureComposer,
  showCollectionForm,
  skeletonPulse,
  sourceInputRef
}: {
  accountSheetOpen: boolean;
  captureComposerClosing: boolean;
  captureComposerClosingRef: MutableRefObject<boolean>;
  captureComposerMotion: Animated.Value;
  captureImagePickerActiveRef: MutableRefObject<boolean>;
  captureKeyboardInset: Animated.Value;
  captureMode: CaptureComposerMode;
  captures: Capture[];
  closeCaptureComposer: (options?: { keyboardHidden?: boolean }) => void;
  closeCollectionComposer: (options?: { keyboardHidden?: boolean }) => void;
  closeCollectionDetail: () => void;
  closeCollectionPicker: () => void;
  closeNoteSheet: (options?: { keyboardHidden?: boolean }) => void;
  closeTitleSheet: (options?: { keyboardHidden?: boolean }) => void;
  closeSelectedCapture: () => void;
  collectionSearchOpen: boolean;
  collectionPickerOpen: boolean;
  collectionDraftDirty: boolean;
  collectionTitleInputRef: RefObject<TextInput | null>;
  collections: Collection[];
  collectionsOpen: boolean;
  draftIntentDirty: boolean;
  draftNoteDirty: boolean;
  draftTitleDirty: boolean;
  lastKeyboardHeightRef: MutableRefObject<number>;
  noteInputRef: RefObject<TextInput | null>;
  noteSheetOpen: boolean;
  titleInputRef: RefObject<TextInput | null>;
  titleSheetOpen: boolean;
  pickingCaptureImage: boolean;
  quickIntentOpen: boolean;
  reminderSheetOpen: boolean;
  reviewMotion: Animated.Value;
  searchMotion: Animated.Value;
  searchOpen: boolean;
  suggestionsOpen: boolean;
  selectCapture: (captureId: string | null) => void;
  selectCollection: (collectionId: string | null) => void;
  selectedCollectionId: string | null;
  selectedId: string | null;
  setAccountSheetOpen: (value: boolean) => void;
  setCollectionDescription: (value: string) => void;
  setCollectionSearchOpen: (value: boolean) => void;
  setCollectionTitle: (value: string) => void;
  setCollectionsOpen: (value: boolean) => void;
  setDraftIntent: (value: string) => void;
  setDraftNote: (value: string) => void;
  setDraftTitle: (value: string) => void;
  setKeyboardHeight: (value: number) => void;
  setQuickIntentOpen: (value: boolean) => void;
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
    if (!draftIntentDirty) setDraftIntent(normalizeIntent(capture.defaultIntent));
  }, [
    captures,
    draftIntentDirty,
    draftNoteDirty,
    draftTitleDirty,
    selectedId,
    setDraftIntent,
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
      !quickIntentOpen &&
      !reminderSheetOpen &&
      !collectionsOpen &&
      !suggestionsOpen &&
      !accountSheetOpen
    ) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (collectionPickerOpen) {
        closeCollectionPicker();
        return true;
      }
      if (quickIntentOpen) {
        setQuickIntentOpen(false);
        return true;
      }
      if (reminderSheetOpen) {
        setReminderSheetOpen(false);
        return true;
      }
      if (accountSheetOpen) {
        setAccountSheetOpen(false);
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
    accountSheetOpen,
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
    quickIntentOpen,
    reminderSheetOpen,
    searchOpen,
    suggestionsOpen,
    selectCapture,
    selectCollection,
    selectedCollectionId,
    selectedId,
    setAccountSheetOpen,
    setCollectionSearchOpen,
    setCollectionsOpen,
    setQuickIntentOpen,
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
    captureComposerMotion.setValue(0);
    Animated.timing(captureComposerMotion, {
      duration: 220,
      easing: Easing.out(Easing.cubic),
      toValue: 1,
      // JS-driven: this value's translateY shares an Animated.View with the
      // JS-driven keyboard marginBottom inset, so it cannot use the native driver
      // (mixing pins the view to native and crashes the JS keyboard animation).
      useNativeDriver: false
    }).start();
  }, [
    captureComposerClosing,
    captureComposerMotion,
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

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSubscription = Keyboard.addListener(showEvent, (event) => {
      if (captureComposerClosingRef.current || captureImagePickerActiveRef.current) return;
      const nextHeight = event.endCoordinates.height;
      lastKeyboardHeightRef.current = nextHeight;
      setKeyboardHeight(nextHeight);
      if (Platform.OS === "ios") Keyboard.scheduleLayoutAnimation(event);
      Animated.timing(captureKeyboardInset, {
        duration: Math.max(140, Math.min(event.duration || 240, 340)),
        easing: Easing.out(Easing.cubic),
        toValue: nextHeight,
        useNativeDriver: false
      }).start();
    });
    const hideSubscription = Keyboard.addListener(hideEvent, (event) => {
      if (captureImagePickerActiveRef.current) return;
      if (captureComposerClosingRef.current) return;
      if (Platform.OS === "android" && collectionPickerOpen) {
        closeCollectionPicker();
        return;
      }
      if (Platform.OS === "android" && (showCaptureComposer || showCollectionForm || noteSheetOpen || titleSheetOpen)) {
        if (showCaptureComposer) closeCaptureComposer({ keyboardHidden: true });
        else if (showCollectionForm) closeCollectionComposer({ keyboardHidden: true });
        else if (noteSheetOpen) closeNoteSheet({ keyboardHidden: true });
        else closeTitleSheet({ keyboardHidden: true });
        return;
      }
      if (!captureComposerClosingRef.current) setKeyboardHeight(0);
      if (Platform.OS === "ios") Keyboard.scheduleLayoutAnimation(event);
      Animated.timing(captureKeyboardInset, {
        duration: Math.max(120, Math.min(event.duration || 200, 300)),
        easing: Easing.out(Easing.cubic),
        toValue: 0,
        useNativeDriver: false
      }).start();
    });
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [
    captureComposerClosingRef,
    captureImagePickerActiveRef,
    captureKeyboardInset,
    closeCaptureComposer,
    closeCollectionComposer,
    closeCollectionPicker,
    closeNoteSheet,
    closeTitleSheet,
    collectionPickerOpen,
    lastKeyboardHeightRef,
    noteSheetOpen,
    titleSheetOpen,
    setKeyboardHeight,
    showCaptureComposer,
    showCollectionForm
  ]);
}
