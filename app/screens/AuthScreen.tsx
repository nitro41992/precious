import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StatusBar,
  View
} from "react-native";
import {
  ArrowLeft,
  ArrowSquareOut,
  Check,
  EnvelopeSimple as Mail,
  ShieldCheck
} from "phosphor-react-native";

import type { AuthLoadingState, AuthScreenMode } from "../types";
import { APP_NAME } from "../branding";
import { appTheme, colors } from "../ui/theme";
import { styles } from "../ui/styles";
import { StowbearLogo } from "../ui/StowbearLogo";
import { Text, TextInput } from "../ui/typography";

type AuthScreenProps = {
  data: {
    appSheets: ReactNode;
    message: string;
  };
  state: {
    authEmail: string;
    authLoading: AuthLoadingState;
    authPendingEmail: string;
    authScreen: AuthScreenMode;
  };
  actions: {
    backToSignIn: () => void;
    sendEmailAuthLink: () => void;
    setAuthEmail: (value: string) => void;
    startGoogleSignIn: () => void;
  };
};

export function AuthScreen({ actions, data, state }: AuthScreenProps) {
  const { appSheets, message } = data;
  const { authEmail, authLoading, authPendingEmail, authScreen } = state;
  const { backToSignIn, sendEmailAuthLink, setAuthEmail, startGoogleSignIn } = actions;
  const pendingEmail = authPendingEmail || authEmail.trim() || "your email";

  return (
    <View style={styles.safe}>
      <StatusBar barStyle={appTheme.statusBarStyle} />
      <ScrollView
        contentContainerStyle={[styles.detail, styles.authDetail]}
        keyboardShouldPersistTaps="handled"
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
      >
        {authScreen === "signin" ? (
          <>
            <View style={styles.authHero}>
              <StowbearLogo size={118} />
              <Text style={[styles.title, styles.authTitle]}>{APP_NAME}</Text>
              <Text style={styles.authSubtitle}>Save from any app. Find it when it matters.</Text>
            </View>
            <Pressable
              accessibilityHint={`Opens a secure Google browser tab, then returns to ${APP_NAME}.`}
              accessibilityLabel="Continue with Google"
              disabled={Boolean(authLoading)}
              onPress={startGoogleSignIn}
              style={({ pressed }) => [
                styles.authGoogleButton,
                pressed && !authLoading && styles.authGoogleButtonPressed,
                authLoading && styles.disabledButton
              ]}
              testID="pc.auth.google"
            >
              <View style={styles.authGoogleMark}>
                <Text style={styles.authGoogleMarkText}>G</Text>
              </View>
              <View style={styles.authButtonCopy}>
                <Text style={styles.authGoogleButtonText}>Continue with Google</Text>
                <Text style={styles.authGoogleButtonSubtext}>
                  {authLoading === "oauth" ? "Opening secure tab..." : "Uses a secure Google tab"}
                </Text>
              </View>
              <View style={styles.authGoogleButtonIcon}>
                {authLoading === "oauth" ? (
                  <ActivityIndicator color={colors.paper} size="small" />
                ) : (
                  <ArrowSquareOut color={colors.paper} size={20} weight="bold" />
                )}
              </View>
            </Pressable>
            <View style={styles.authEmailPanel}>
              <Text style={styles.authMethodLabel}>Or continue with email</Text>
              <TextInput
                autoCapitalize="none"
                editable={!Boolean(authLoading)}
                keyboardType="email-address"
                onChangeText={setAuthEmail}
                placeholder="you@example.com"
                placeholderTextColor={colors.placeholder}
                style={styles.authEmailInput}
                testID="pc.auth.email"
                value={authEmail}
              />
              <Pressable
                accessibilityLabel="Continue with email"
                disabled={Boolean(authLoading)}
                onPress={sendEmailAuthLink}
                style={({ pressed }) => [
                  styles.authEmailButton,
                  pressed && !authLoading && styles.primaryButtonPressed,
                  authLoading && styles.disabledButton
                ]}
                testID="pc.auth.sign-in-link"
              >
                {authLoading === "magiclink" ? (
                  <ActivityIndicator color={colors.onAccent} size="small" />
                ) : (
                  <Mail color={colors.onAccent} size={20} weight="bold" />
                )}
                <Text style={styles.primaryButtonText}>
                  {authLoading === "magiclink" ? "Sending link..." : "Continue with email"}
                </Text>
              </Pressable>
            </View>
            <View style={styles.authTrustRow}>
              <View style={styles.authTrustIcon}>
                <ShieldCheck color={colors.accentTextStrong} size={18} weight="fill" />
              </View>
              <Text style={styles.authTrustText}>
                Use the same email with Google and links to keep one account.
              </Text>
            </View>
            {message ? <Text style={styles.errorText}>{message}</Text> : null}
          </>
        ) : (
          <>
            <View style={styles.authHeaderRow}>
              <Pressable
                accessibilityLabel="Back to sign in"
                hitSlop={10}
                onPress={backToSignIn}
                style={styles.iconButton}
                testID="pc.auth.check.back"
              >
                <ArrowLeft color={colors.ink} size={26} weight="bold" />
              </Pressable>
              <View style={styles.authHeaderCopy}>
                <Text style={[styles.title, styles.authTitle]}>Check your email</Text>
              </View>
            </View>
            <View style={styles.authCheckHero}>
              <View style={styles.authSuccessMark}>
                <Check color={colors.onAccent} size={28} weight="bold" />
              </View>
              <Text style={[styles.supportingText, styles.authSupportingText]}>
                Open the secure link on this phone and we'll bring you back here.
              </Text>
              <Text style={styles.authEmailPill}>{pendingEmail}</Text>
            </View>
            <Pressable
              disabled={Boolean(authLoading)}
              onPress={sendEmailAuthLink}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && !authLoading && styles.primaryButtonPressed,
                authLoading && styles.disabledButton
              ]}
              testID="pc.auth.check.resend"
            >
              <Text style={styles.primaryButtonText}>
                {authLoading === "magiclink" ? "Sending..." : "Send again"}
              </Text>
            </Pressable>
            <Pressable
              disabled={Boolean(authLoading)}
              onPress={backToSignIn}
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed && !authLoading && styles.secondaryButtonPressed,
                authLoading && styles.disabledButton
              ]}
              testID="pc.auth.check.sign-in"
            >
              <Text style={styles.secondaryButtonText}>Use a different email</Text>
            </Pressable>
            {message ? <Text style={styles.errorText}>{message}</Text> : null}
          </>
        )}
      </ScrollView>
      {appSheets}
    </View>
  );
}
