import type { ReactNode } from "react";
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  View
} from "react-native";
import { ArrowLeft, Check, EnvelopeSimple as Mail } from "phosphor-react-native";

import type { AuthLoadingState, AuthScreenMode } from "../types";
import { colors } from "../ui/theme";
import { styles } from "../ui/styles";

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

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />
      <ScrollView
        contentContainerStyle={[styles.detail, styles.authDetail]}
        keyboardShouldPersistTaps="handled"
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
      >
        {authScreen === "signin" ? (
          <>
            <Text style={[styles.title, styles.authTitle]}>Precious Captures</Text>
            <Pressable
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
              <Text style={styles.authGoogleButtonText}>
                {authLoading === "oauth" ? "Opening Google..." : "Continue with Google"}
              </Text>
            </Pressable>
            <View style={styles.authDivider}>
              <View style={styles.authDividerLine} />
              <Text style={styles.authDividerText}>or</Text>
              <View style={styles.authDividerLine} />
            </View>
            <TextInput
              autoCapitalize="none"
              keyboardType="email-address"
              onChangeText={setAuthEmail}
              placeholder="Email"
              placeholderTextColor={colors.muted}
              style={styles.authEmailInput}
              testID="pc.auth.email"
              value={authEmail}
            />
            <Pressable
              disabled={Boolean(authLoading)}
              onPress={sendEmailAuthLink}
              style={({ pressed }) => [
                styles.authEmailButton,
                pressed && !authLoading && styles.primaryButtonPressed,
                authLoading && styles.disabledButton
              ]}
              testID="pc.auth.sign-in-link"
            >
              <Mail color={colors.onAccent} size={20} weight="bold" />
              <Text style={styles.primaryButtonText}>
                {authLoading === "magiclink" ? "Sending..." : "Send sign-in link"}
              </Text>
            </Pressable>
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
                <ArrowLeft color={colors.ink} size={26} weight="regular" />
              </Pressable>
              <View style={styles.authHeaderCopy}>
                <Text style={[styles.title, styles.authTitle]}>Check your email</Text>
              </View>
            </View>
            <View style={styles.authSuccessMark}>
              <Check color={colors.onAccent} size={28} weight="bold" />
            </View>
            <Text style={[styles.supportingText, styles.authSupportingText]}>
              We sent a secure link to {authPendingEmail || authEmail.trim() || "your email"}. Open it on this phone to continue.
            </Text>
            <Pressable
              disabled={Boolean(authLoading)}
              onPress={backToSignIn}
              style={[styles.primaryButton, authLoading && styles.disabledButton]}
              testID="pc.auth.check.sign-in"
            >
              <Text style={styles.primaryButtonText}>Back to sign in</Text>
            </Pressable>
            <Pressable
              disabled={Boolean(authLoading)}
              onPress={sendEmailAuthLink}
              style={[styles.secondaryButton, authLoading && styles.disabledButton]}
              testID="pc.auth.check.resend"
            >
              <Text style={styles.secondaryButtonText}>
                {authLoading === "magiclink" ? "Sending..." : "Send again"}
              </Text>
            </Pressable>
            {message ? <Text style={styles.errorText}>{message}</Text> : null}
          </>
        )}
      </ScrollView>
      {appSheets}
    </SafeAreaView>
  );
}
