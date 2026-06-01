import { useEffect } from "react";
import type { MutableRefObject, RefObject } from "react";
import {
  Animated,
  BackHandler,
  Easing,
  Keyboard,
  Platform,
  TextInput
} from "react-native";

import { normalizeIntent } from "../capturePresentation";
import type {
  Capture,
  CaptureComposerMode,
  Collection,
  RationaleSheet,
  ReviewTarget
} from "../types";

export function useAppUiEffects({
  accountSheetOpen,
  archiveCaptureConfirmOpen,
  archiveCollectionTarget,
  captureComposerClosing,
  captureComposerClosingRef,
  captureComposerMotion,
  captureImagePickerActiveRef,
  captureKeyboardInset,
  captureMode,
  captureReturnCollectionId,
  captures,
  closeCaptureComposer,
  closeCollectionComposer,
  closeNoteSheet,
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
  pickingCaptureImage,
  rationaleSheet,
  reviewMotion,
  searchMotion,
  searchOpen,
  selectCapture,
  selectCollection,
  selectedCollectionId,
  selectedId,
  setAccountSheetOpen,
  setArchiveCaptureConfirmOpen,
  setArchiveCollectionTarget,
  setCollectionDescription,
  setCollectionTitle,
  setCollectionsOpen,
  setDraftIntent,
  setDraftNote,
  setDraftTitle,
  setKeyboardHeight,
  setRationaleEditTarget,
  setRationaleSheet,
  setSearchOpen,
  showCaptureComposer,
  showCollectionForm,
  skeletonPulse,
  sourceInputRef
}: {
  accountSheetOpen: boolean;
  archiveCaptureConfirmOpen: boolean;
  archiveCollectionTarget: Collection | null;
  captureComposerClosing: boolean;
  captureComposerClosingRef: MutableRefObject<boolean>;
  captureComposerMotion: Animated.Value;
  captureImagePickerActiveRef: MutableRefObject<boolean>;
  captureKeyboardInset: Animated.Value;
  captureMode: CaptureComposerMode;
  captureReturnCollectionId: string | null;
  captures: Capture[];
  closeCaptureComposer: () => void;
  closeCollectionComposer: () => void;
  closeNoteSheet: () => void;
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
  pickingCaptureImage: boolean;
  rationaleSheet: RationaleSheet | null;
  reviewMotion: Animated.Value;
  searchMotion: Animated.Value;
  searchOpen: boolean;
  selectCapture: (captureId: string | null) => void;
  selectCollection: (collectionId: string | null) => void;
  selectedCollectionId: string | null;
  selectedId: string | null;
  setAccountSheetOpen: (value: boolean) => void;
  setArchiveCaptureConfirmOpen: (value: boolean) => void;
  setArchiveCollectionTarget: (value: Collection | null) => void;
  setCollectionDescription: (value: string) => void;
  setCollectionTitle: (value: string) => void;
  setCollectionsOpen: (value: boolean) => void;
  setDraftIntent: (value: string) => void;
  setDraftNote: (value: string) => void;
  setDraftTitle: (value: string) => void;
  setKeyboardHeight: (value: number) => void;
  setRationaleEditTarget: (value: ReviewTarget | null) => void;
  setRationaleSheet: (value: RationaleSheet | null) => void;
  setSearchOpen: (value: boolean) => void;
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
      !showCaptureComposer &&
      !showCollectionForm &&
      !noteSheetOpen &&
      !collectionsOpen &&
      !accountSheetOpen &&
      !rationaleSheet &&
      !archiveCaptureConfirmOpen &&
      !archiveCollectionTarget
    ) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (archiveCollectionTarget) {
        setArchiveCollectionTarget(null);
        return true;
      }
      if (archiveCaptureConfirmOpen) {
        setArchiveCaptureConfirmOpen(false);
        return true;
      }
      if (rationaleSheet) {
        setRationaleSheet(null);
        setRationaleEditTarget(null);
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
      if (searchOpen) {
        setSearchOpen(false);
        return true;
      }
      if (selectedId && captureReturnCollectionId) {
        selectCapture(null);
        selectCollection(captureReturnCollectionId);
        return true;
      }
      if (selectedCollectionId) {
        selectCollection(null);
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
    archiveCaptureConfirmOpen,
    archiveCollectionTarget,
    captureReturnCollectionId,
    closeCaptureComposer,
    closeCollectionComposer,
    closeNoteSheet,
    collectionsOpen,
    noteSheetOpen,
    rationaleSheet,
    searchOpen,
    selectCapture,
    selectCollection,
    selectedCollectionId,
    selectedId,
    setAccountSheetOpen,
    setArchiveCaptureConfirmOpen,
    setArchiveCollectionTarget,
    setCollectionsOpen,
    setRationaleEditTarget,
    setRationaleSheet,
    setSearchOpen,
    showCaptureComposer,
    showCollectionForm
  ]);

  useEffect(() => {
    if (!searchOpen) return;
    searchMotion.setValue(0);
    Animated.spring(searchMotion, {
      damping: 22,
      mass: 0.9,
      stiffness: 260,
      toValue: 1,
      useNativeDriver: false
    }).start();
  }, [searchMotion, searchOpen]);

  useEffect(() => {
    if (!selectedId) return;
    reviewMotion.setValue(0);
    Animated.spring(reviewMotion, {
      damping: 22,
      mass: 0.9,
      stiffness: 260,
      toValue: 1,
      useNativeDriver: false
    }).start();
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
    if ((!showCaptureComposer && !showCollectionForm && !noteSheetOpen) || captureComposerClosing) return;
    captureComposerMotion.setValue(0);
    Animated.spring(captureComposerMotion, {
      damping: 24,
      mass: 0.9,
      stiffness: 300,
      toValue: 1,
      useNativeDriver: false
    }).start();
  }, [
    captureComposerClosing,
    captureComposerMotion,
    noteSheetOpen,
    showCaptureComposer,
    showCollectionForm
  ]);

  useEffect(() => {
    if (!showCaptureComposer || captureComposerClosing || pickingCaptureImage) return;
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
    if (!showCollectionForm) return;
    const frame = requestAnimationFrame(() => {
      collectionTitleInputRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [collectionTitleInputRef, showCollectionForm]);

  useEffect(() => {
    if (!noteSheetOpen) return;
    const frame = requestAnimationFrame(() => {
      noteInputRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [noteInputRef, noteSheetOpen]);

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
    lastKeyboardHeightRef,
    setKeyboardHeight
  ]);
}
