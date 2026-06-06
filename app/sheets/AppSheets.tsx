import { View } from "react-native";
import { SignOut as LogOut } from "phosphor-react-native";

import { AnimatedBottomSheet, MotionPressable, SheetHeader } from "../ui/components";
import { styles } from "../ui/styles";
import { colors } from "../ui/theme";
import { Text } from "../ui/typography";

export function AppSheets({
  accountSheetOpen,
  onSignOut,
  setAccountSheetOpen
}: {
  accountSheetOpen: boolean;
  onSignOut: () => void;
  setAccountSheetOpen: (value: boolean) => void;
}) {
  return (
    <AnimatedBottomSheet
      closeLabel="Close account actions"
      onClose={() => setAccountSheetOpen(false)}
      sheetStyle={styles.actionSheet}
      visible={accountSheetOpen}
    >
          <View style={styles.sheetGrabber} />
          <SheetHeader
            closeLabel="Close account actions"
            onClose={() => setAccountSheetOpen(false)}
            subtitle="Manage this device session."
            title="Settings"
          />
          <MotionPressable
            onPress={() => {
              setAccountSheetOpen(false);
              onSignOut();
            }}
            style={({ pressed }) => [styles.sheetActionRow, pressed && styles.subtlePressed]}
          >
            <LogOut color={colors.danger} size={20} weight="regular" />
            <View style={styles.sheetActionCopy}>
              <Text style={[styles.sheetActionTitle, styles.sheetActionDanger]}>Sign out</Text>
              <Text style={styles.sheetActionText}>Remove this session from the phone.</Text>
            </View>
          </MotionPressable>
    </AnimatedBottomSheet>
  );
}
