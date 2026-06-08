import type { RefObject } from "react";
import { Animated, View } from "react-native";
import type { TextInput as NativeTextInput } from "react-native";

import type { Collection } from "../types";
import { KeyboardSheet, SheetHeader, keyboardSheetMetrics } from "../ui/components";
import { styles } from "../ui/styles";
import { colors } from "../ui/theme";
import { TextInput } from "../ui/typography";

export function CollectionComposerSheet({
  captureComposerMotion,
  captureKeyboardInset,
  collectionDescription,
  collectionTitle,
  collectionTitleInputRef,
  keyboardHeight,
  onClose,
  onSave,
  onCollectionDescriptionChange,
  onCollectionTitleChange,
  selectedCollection,
  showCollectionForm,
  windowHeight
}: {
  captureComposerMotion: Animated.Value;
  captureKeyboardInset: Animated.Value;
  collectionDescription: string;
  collectionTitle: string;
  collectionTitleInputRef: RefObject<NativeTextInput | null>;
  keyboardHeight: number;
  onClose: () => void;
  onSave: () => void;
  onCollectionDescriptionChange: (value: string) => void;
  onCollectionTitleChange: (value: string) => void;
  selectedCollection: Collection | null;
  showCollectionForm: boolean;
  windowHeight: number;
}) {
  if (!showCollectionForm) return null;
  const editingCollection = selectedCollection;
  const { keyboardVisible, screenHeight, maxHeight, bottomInset } = keyboardSheetMetrics({
    active: showCollectionForm,
    keyboardHeight,
    windowHeight,
    keyboardInset: captureKeyboardInset,
    maxWithKeyboard: 430,
    maxWithoutKeyboard: 440,
    withoutKeyboardScale: 0.62
  });
  const saveDisabled = !collectionTitle.trim() || !collectionDescription.trim();

  return (
    <KeyboardSheet
      backdropLabel="Close collection composer"
      bottomInset={bottomInset}
      compact={keyboardVisible}
      maxHeight={maxHeight}
      motion={captureComposerMotion}
      onBackdropPress={onClose}
      screenHeight={screenHeight}
    >
      <View style={styles.sheetGrabber} />
      <SheetHeader
        closeLabel="Close"
        confirmDisabled={saveDisabled}
        confirmLabel={editingCollection ? "Save collection" : "Create collection"}
        confirmTestID={editingCollection ? "pc.collection.edit.save" : "pc.collections.create.save"}
        onClose={onClose}
        onConfirm={onSave}
        subtitle={
          editingCollection
            ? undefined
            : "Keep projects, trips, recipes, and purchase decisions tidy without making them the main way to browse."
        }
        title={editingCollection ? "Collection details" : "New collection"}
      />
      <View
        style={[
          styles.captureSheetBody,
          styles.captureSheetBodyContent,
          keyboardVisible && styles.captureSheetBodyContentCompact
        ]}
      >
        <TextInput
          onChangeText={onCollectionTitleChange}
          placeholder="Title"
          placeholderTextColor={colors.placeholder}
          ref={collectionTitleInputRef}
          returnKeyType="next"
          style={[styles.captureInput, styles.collectionSheetTitleInput]}
          testID="pc.collections.create.title"
          value={collectionTitle}
        />
        <TextInput
          multiline
          onChangeText={onCollectionDescriptionChange}
          placeholder="What belongs here"
          placeholderTextColor={colors.placeholder}
          style={[styles.captureInput, styles.collectionSheetDescriptionInput]}
          testID="pc.collections.create.description"
          value={collectionDescription}
        />
      </View>
    </KeyboardSheet>
  );
}
