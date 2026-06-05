import { Pressable, Text, View } from "react-native";
import {
  LogOut,
  X
} from "lucide-react-native";

import { IconButton } from "../ui/components";
import { styles } from "../ui/styles";
import { colors } from "../ui/theme";

export function AppSheets({
  accountSheetOpen,
  onSignOut,
  setAccountSheetOpen
}: {
  accountSheetOpen: boolean;
  onSignOut: () => void;
  setAccountSheetOpen: (value: boolean) => void;
}) {
  if (accountSheetOpen) {
    return (
      <View style={styles.modalLayer} pointerEvents="box-none">
        <Pressable
          accessibilityLabel="Close account actions"
          onPress={() => setAccountSheetOpen(false)}
          style={styles.modalBackdrop}
        />
        <View style={styles.actionSheet}>
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
            <LogOut color={colors.danger} size={20} strokeWidth={2.3} />
            <View style={styles.sheetActionCopy}>
              <Text style={[styles.sheetActionTitle, styles.sheetActionDanger]}>Sign out</Text>
              <Text style={styles.sheetActionText}>Remove this session from the phone.</Text>
            </View>
          </Pressable>
        </View>
      </View>
    );
  }

  return null;
}
