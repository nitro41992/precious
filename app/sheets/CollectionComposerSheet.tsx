import type { RefObject } from "react";
import { Animated, Dimensions, KeyboardAvoidingView, Pressable, View } from "react-native";
import type { TextInput as NativeTextInput } from "react-native";
import { Trash } from "phosphor-react-native";

import type { Collection } from "../types";
import { MotionPressable, SheetHeader } from "../ui/components";
import { styles } from "../ui/styles";
import { colors } from "../ui/theme";
import { Text, TextInput } from "../ui/typography";

export function CollectionComposerSheet({
  captureComposerMotion,
  captureKeyboardInset,
  collectionDescription,
  collectionTitle,
  collectionTitleInputRef,
  keyboardHeight,
  onClose,
  onDelete,
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
  onDelete: (collection: Collection) => void;
  onSave: () => void;
  onCollectionDescriptionChange: (value: string) => void;
  onCollectionTitleChange: (value: string) => void;
  selectedCollection: Collection | null;
  showCollectionForm: boolean;
  windowHeight: number;
}) {
  if (!showCollectionForm) return null;
  const editingCollection = selectedCollection;
  const keyboardVisible = keyboardHeight > 0;
  const screenHeight = Dimensions.get("screen").height;
  const windowAlreadyKeyboardSized = keyboardVisible && Math.abs(windowHeight + keyboardHeight - screenHeight) < 96;
  const visibleHeight = keyboardVisible && !windowAlreadyKeyboardSized
    ? windowHeight - keyboardHeight
    : windowHeight;
  const keyboardSheetGap = keyboardVisible ? 16 : 0;
  const sheetMaxHeight = keyboardVisible
    ? Math.min(430, Math.max(320, visibleHeight - 24 - keyboardSheetGap))
    : Math.min(440, Math.max(340, windowHeight * 0.62));
  const sheetBottomInset = windowAlreadyKeyboardSized
    ? keyboardSheetGap
    : keyboardVisible
      ? Animated.add(captureKeyboardInset, keyboardSheetGap)
      : captureKeyboardInset;
  const saveDisabled = !collectionTitle.trim() || !collectionDescription.trim();

  return (
    <View style={styles.sheetLayer} pointerEvents="box-none">
      <Pressable
        accessibilityLabel="Close collection composer"
        onPress={onClose}
        style={styles.sheetBackdrop}
      />
      <KeyboardAvoidingView pointerEvents="box-none" style={styles.sheetKeyboard}>
        <Animated.View
          style={[
            styles.captureSheet,
            keyboardVisible && styles.captureSheetCompact,
            {
              marginBottom: sheetBottomInset,
              maxHeight: sheetMaxHeight,
              transform: [
                {
                  translateY: captureComposerMotion.interpolate({
                    inputRange: [0, 1],
                    outputRange: [screenHeight, 0]
                  })
                }
              ]
            }
          ]}
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
          {editingCollection ? (
            <MotionPressable
              accessibilityRole="button"
              onPress={() => onDelete(editingCollection)}
              style={({ pressed }) => [styles.sheetActionRow, pressed && styles.subtlePressed]}
              testID="pc.collection.delete"
            >
              <Trash color={colors.danger} size={20} weight="regular" />
              <Text style={styles.dangerButtonText}>Delete collection</Text>
            </MotionPressable>
          ) : null}
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}
