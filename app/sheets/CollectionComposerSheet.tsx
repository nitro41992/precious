import type { RefObject } from "react";
import { View } from "react-native";
import type { TextInput as NativeTextInput } from "react-native";
import type { SharedValue } from "react-native-reanimated";

import type { Collection } from "../types";
import { CollectionFormFields, KeyboardSheet, SheetHeader, keyboardSheetMetrics } from "../ui/components";
import { styles } from "../ui/styles";

export function CollectionComposerSheet({
  captureSheetOpen,
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
  captureSheetOpen: SharedValue<number>;
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
  const { keyboardVisible, maxHeight } = keyboardSheetMetrics({
    active: showCollectionForm,
    keyboardHeight,
    windowHeight,
    maxWithKeyboard: 430,
    maxWithoutKeyboard: 440,
    withoutKeyboardScale: 0.62
  });
  const saveDisabled = !collectionTitle.trim() || !collectionDescription.trim();

  return (
    <KeyboardSheet
      backdropLabel="Close collection composer"
      compact={keyboardVisible}
      maxHeight={maxHeight}
      onBackdropPress={onClose}
      open={captureSheetOpen}
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
        <CollectionFormFields
          description={collectionDescription}
          descriptionTestID="pc.collections.create.description"
          onDescriptionChange={onCollectionDescriptionChange}
          onTitleChange={onCollectionTitleChange}
          title={collectionTitle}
          titleRef={collectionTitleInputRef}
          titleReturnKeyType="next"
          titleTestID="pc.collections.create.title"
        />
      </View>
    </KeyboardSheet>
  );
}
