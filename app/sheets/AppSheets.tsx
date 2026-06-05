import { Pressable, View } from "react-native";
import {
  SignOut as LogOut,
  X
} from "phosphor-react-native";

import { AnimatedBottomSheet, IconButton } from "../ui/components";
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
          <View style={styles.sheetHeader}>
            <View style={styles.sheetHeaderCopy}>
              <Text style={styles.sheetTitle}>Settings</Text>
              <Text style={styles.sheetSubtitle}>Manage this device session.</Text>
            </View>
            <IconButton Icon={X} label="Close account actions" onPress={() => setAccountSheetOpen(false)} />
          </View>
          <Pressable
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
          </Pressable>
    </AnimatedBottomSheet>
  );
}
