import { ActivityIndicator, View } from "react-native";

import { AnimatedBottomSheet, MotionPressable, SheetHeader } from "../ui/components";
import { styles } from "../ui/styles";
import { colors } from "../ui/theme";
import { Text } from "../ui/typography";

// The account-deletion confirmation sheet. Sign-out and the rest of the account
// surface now live on the full-page Settings screen; this sheet is the single,
// deliberate gate in front of the irreversible delete.
export function AppSheets({
  deleteConfirmOpen,
  deleteBusy,
  onConfirmDelete,
  onCloseDeleteConfirm
}: {
  deleteConfirmOpen: boolean;
  deleteBusy: boolean;
  onConfirmDelete: () => void;
  onCloseDeleteConfirm: () => void;
}) {
  return (
    <AnimatedBottomSheet
      closeLabel="Close delete account"
      onClose={() => {
        if (!deleteBusy) onCloseDeleteConfirm();
      }}
      sheetStyle={styles.actionSheet}
      visible={deleteConfirmOpen}
    >
      <View style={styles.sheetGrabber} />
      <SheetHeader
        closeLabel="Close delete account"
        onClose={() => {
          if (!deleteBusy) onCloseDeleteConfirm();
        }}
        title="Delete account"
      />
      <Text style={styles.settingsDeleteConfirmCopy}>
        This permanently deletes your account and all captures, collections, and saved media. This cannot be undone.
      </Text>
      <MotionPressable
        accessibilityLabel="Delete account"
        accessibilityRole="button"
        disabled={deleteBusy}
        onPress={onConfirmDelete}
        style={({ pressed }) => [
          styles.primaryButton,
          styles.destructiveButton,
          styles.settingsDeleteButton,
          pressed && styles.settingsDeleteButtonPressed,
          deleteBusy && styles.disabledButton
        ]}
      >
        {deleteBusy ? (
          <ActivityIndicator color={colors.onDanger} />
        ) : (
          <Text style={styles.destructiveButtonText}>Delete my account</Text>
        )}
      </MotionPressable>
    </AnimatedBottomSheet>
  );
}
