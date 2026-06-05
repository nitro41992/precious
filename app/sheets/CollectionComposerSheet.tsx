import type { RefObject } from "react";
import { Animated, Dimensions, KeyboardAvoidingView, Pressable, Text, TextInput, View } from "react-native";
import { Check, X } from "phosphor-react-native";

import type { Collection } from "../types";
import { IconButton } from "../ui/components";
import { styles } from "../ui/styles";
import { colors } from "../ui/theme";

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
  collectionTitleInputRef: RefObject<TextInput | null>;
  keyboardHeight: number;
  onClose: () => void;
  onSave: () => void;
  onCollectionDescriptionChange: (value: string) => void;
  onCollectionTitleChange: (value: string) => void;
  selectedCollection: Collection | null;
  showCollectionForm: boolean;
  windowHeight: number;
}) {
  if (!showCollectionForm || selectedCollection) return null;
  const keyboardVisible = keyboardHeight > 0;
  const screenHeight = Dimensions.get("screen").height;
  const windowAlreadyKeyboardSized = keyboardVisible && Math.abs(windowHeight + keyboardHeight - screenHeight) < 96;
  const visibleHeight = keyboardVisible && !windowAlreadyKeyboardSized
    ? windowHeight - keyboardHeight
    : windowHeight;
  const sheetMaxHeight = keyboardVisible
    ? Math.min(430, Math.max(320, visibleHeight - 24))
    : Math.min(440, Math.max(340, windowHeight * 0.62));
  const sheetBottomInset = windowAlreadyKeyboardSized ? 0 : captureKeyboardInset;
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
              opacity: captureComposerMotion,
              transform: [
                {
                  translateY: captureComposerMotion.interpolate({
                    inputRange: [0, 1],
                    outputRange: [28, 0]
                  })
                }
              ]
            }
          ]}
        >
          <View style={styles.sheetGrabber} />
          <View style={styles.captureSheetHeader}>
            <View style={styles.sheetHeaderCopy}>
              <Text style={styles.sheetTitle}>New collection</Text>
            </View>
            <View style={styles.sheetActions}>
              <IconButton Icon={X} label="Close" onPress={onClose} />
              <IconButton
                Icon={Check}
                label="Create collection"
                disabled={saveDisabled}
                onPress={onSave}
                tone="primary"
                testID="pc.collections.create.save"
              />
            </View>
          </View>
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
              placeholderTextColor={colors.muted}
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
              placeholderTextColor={colors.muted}
              style={[styles.captureInput, styles.collectionSheetDescriptionInput]}
              testID="pc.collections.create.description"
              value={collectionDescription}
            />
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}
