import type { ComponentType, ReactNode } from "react";
import { ScrollView, StatusBar, View } from "react-native";
import {
  ArrowLeft,
  ArrowSquareOut,
  BellRinging,
  ChatCircleText,
  FileText,
  ShieldCheck,
  SignOut,
  Trash,
  User
} from "phosphor-react-native";

import { IconButton, MotionPressable } from "../ui/components";
import { styles } from "../ui/styles";
import { appTheme, colors } from "../ui/theme";
import { Text } from "../ui/typography";

type PhosphorIcon = ComponentType<{ color?: string; size?: number; weight?: "bold" | "fill" | "regular" }>;

type SettingsScreenProps = {
  data: {
    email: string | null;
    appVersion: string;
    appSheets: ReactNode;
    toast: ReactNode;
  };
  actions: {
    closeSettings: () => void;
    signOut: () => void;
    openDeleteConfirm: () => void;
    openPrivacyPolicy: () => void;
    openTerms: () => void;
    openNotificationSettings: () => void;
    openSupportEmail: () => void;
  };
};

// One settings card: a soft shadowed surface (the app's standard card) with a
// circular tonal icon chip. Brand-lime for routine rows; error-red is reserved
// for the lone permanent action. The pressed fill hugs the card's own radius.
function SettingsRow({
  Icon,
  title,
  subtitle,
  onPress,
  tone = "default",
  external
}: {
  Icon: PhosphorIcon;
  title: string;
  subtitle?: string;
  onPress: () => void;
  tone?: "default" | "danger";
  external?: boolean;
}) {
  const danger = tone === "danger";
  return (
    <MotionPressable
      accessibilityLabel={title}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.settingsRow, pressed && styles.settingsRowPressed]}
    >
      <View style={danger ? styles.settingsRowIconDanger : styles.settingsRowIconNeutral}>
        <Icon color={danger ? colors.danger : colors.accentTextStrong} size={21} weight="bold" />
      </View>
      <View style={styles.settingsRowCopy}>
        <Text style={[styles.settingsRowTitle, danger && styles.settingsRowDanger]}>{title}</Text>
        {subtitle ? <Text style={styles.settingsRowSubtitle}>{subtitle}</Text> : null}
      </View>
      {external ? <ArrowSquareOut color={colors.placeholder} size={18} weight="bold" /> : null}
    </MotionPressable>
  );
}

// The full-page Settings screen, reached from the bottom-bar gear. Renders
// product copy and fires actions only — no semantic interpretation lives here.
export function SettingsScreen({ actions, data }: SettingsScreenProps) {
  const { appSheets, appVersion, email, toast } = data;
  const {
    closeSettings,
    openDeleteConfirm,
    openNotificationSettings,
    openPrivacyPolicy,
    openSupportEmail,
    openTerms,
    signOut
  } = actions;

  const initial = email?.trim()?.[0]?.toUpperCase() || null;

  return (
    <View style={styles.safe}>
      <StatusBar barStyle={appTheme.statusBarStyle} />
      <ScrollView contentContainerStyle={styles.settingsContent} keyboardShouldPersistTaps="handled">
        <View style={styles.detailHeader}>
          <IconButton Icon={ArrowLeft} label="Back" onPress={closeSettings} />
        </View>
        <Text style={styles.title}>Settings</Text>

        <View style={styles.settingsAccountCard}>
          <View style={styles.settingsAvatar}>
            {initial ? (
              <Text style={styles.settingsAvatarText}>{initial}</Text>
            ) : (
              <User color={colors.onAccent} size={28} weight="bold" />
            )}
          </View>
          <View style={styles.settingsAccountTextCol}>
            <Text style={styles.settingsAccountLabel}>Signed in as</Text>
            <Text numberOfLines={1} style={styles.settingsAccountEmail}>
              {email || "Your account"}
            </Text>
          </View>
        </View>

        <View style={styles.settingsSection}>
          <Text style={styles.settingsSectionLabel}>Account</Text>
          <SettingsRow
            Icon={SignOut}
            onPress={signOut}
            subtitle="Remove this session from the phone."
            title="Sign out"
          />
        </View>

        <View style={styles.settingsSection}>
          <Text style={styles.settingsSectionLabel}>Notifications</Text>
          <SettingsRow
            Icon={BellRinging}
            external
            onPress={openNotificationSettings}
            subtitle="Manage capture alerts in system settings."
            title="Notifications"
          />
        </View>

        <View style={styles.settingsSection}>
          <Text style={styles.settingsSectionLabel}>About &amp; legal</Text>
          <View style={styles.settingsGroup}>
            <SettingsRow Icon={ShieldCheck} external onPress={openPrivacyPolicy} title="Privacy policy" />
            <SettingsRow Icon={FileText} external onPress={openTerms} title="Terms of service" />
          </View>
        </View>

        <View style={styles.settingsSection}>
          <Text style={styles.settingsSectionLabel}>Help</Text>
          <SettingsRow
            Icon={ChatCircleText}
            external
            onPress={openSupportEmail}
            subtitle="Questions or feedback? Get in touch."
            title="Contact support"
          />
        </View>

        <View style={styles.settingsDangerZone}>
          <SettingsRow
            Icon={Trash}
            onPress={openDeleteConfirm}
            subtitle="Permanently delete your account and all captures. This can't be undone."
            title="Delete account"
            tone="danger"
          />
        </View>

        <Text style={styles.settingsVersionText}>Version {appVersion}</Text>
      </ScrollView>
      {appSheets}
      {toast}
    </View>
  );
}
