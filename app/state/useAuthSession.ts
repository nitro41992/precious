import { useCallback, useEffect, useRef, useState } from "react";
import { Linking, PermissionsAndroid, Platform } from "react-native";

import {
  AUTH_CALLBACK_URL,
  authCallbackPayload,
  emailInputError,
  friendlyError
} from "../capturePresentation";
import {
  isAuthError,
  nativeAuth,
  requestJson
} from "../nativeBridge";
import type {
  AppConfig,
  AuthLoadingState,
  AuthScreenMode,
  AuthSession
} from "../types";

export function useAuthSession({
  onClearAuthenticatedState,
  onMessage
}: {
  onClearAuthenticatedState: () => void;
  onMessage: (message: string) => void;
}) {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [authScreen, setAuthScreen] = useState<AuthScreenMode>("signin");
  const [authEmail, setAuthEmail] = useState("");
  const [authPendingEmail, setAuthPendingEmail] = useState("");
  const [authLoading, setAuthLoading] = useState<AuthLoadingState>(null);
  const pendingAuthCallbackUrlRef = useRef<string | null>(null);

  const persistSupabaseSession = useCallback(async (accessToken: string, refreshToken: string, expiresAt: number) => {
    if (!config?.supabaseUrl || !config.supabaseAnonKey || !nativeAuth) {
      throw new Error("Supabase URL and anon key are not configured in the Android build.");
    }
    const user = await requestJson<{ id?: string; user?: { id?: string } }>(`${config.supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: config.supabaseAnonKey,
        authorization: `Bearer ${accessToken}`
      }
    });
    const userId = user.id || user.user?.id;
    if (!userId) throw new Error("Could not finish sign in.");
    const next = { accessToken, refreshToken, expiresAt, userId };
    await nativeAuth.persistSession(accessToken, refreshToken, expiresAt, userId);
    setSession(next);
    onMessage("");
    setAuthScreen("signin");
  }, [config?.supabaseAnonKey, config?.supabaseUrl, onMessage]);

  const handleAuthCallbackUrl = useCallback(async (url: string | null | undefined) => {
    const payload = authCallbackPayload(url);
    if (!payload) return false;
    if (!config?.supabaseUrl || !config.supabaseAnonKey || !nativeAuth) {
      pendingAuthCallbackUrlRef.current = url || null;
      return true;
    }
    if (payload.kind === "error") {
      setAuthScreen("signin");
      onMessage(payload.message || "The confirmation link could not be used.");
      return true;
    }
    setAuthLoading("callback");
    onMessage("Finishing sign in...");
    try {
      await persistSupabaseSession(payload.accessToken, payload.refreshToken, payload.expiresAt);
    } catch (error) {
      setAuthScreen("signin");
      onMessage(friendlyError(error, "Could not finish sign in."));
    } finally {
      setAuthLoading(null);
    }
    return true;
  }, [config?.supabaseAnonKey, config?.supabaseUrl, onMessage, persistSupabaseSession]);

  useEffect(() => {
    nativeAuth?.getConfig().then((raw) => {
      setConfig(JSON.parse(raw || "{}") as AppConfig);
    }).catch(() => {
      setConfig({ apiUrl: "", supabaseUrl: "", supabaseAnonKey: "" });
    });
    nativeAuth?.getSession().then((raw) => {
      if (raw) setSession(JSON.parse(raw) as AuthSession);
    }).catch(() => setSession(null));
    if (Platform.OS === "android" && Platform.Version >= 33) {
      void PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    }

    Linking.getInitialURL().then((url) => {
      if (authCallbackPayload(url)) pendingAuthCallbackUrlRef.current = url;
    });
  }, []);

  useEffect(() => {
    if (!config || !pendingAuthCallbackUrlRef.current) return;
    const url = pendingAuthCallbackUrlRef.current;
    pendingAuthCallbackUrlRef.current = null;
    void handleAuthCallbackUrl(url);
  }, [config, handleAuthCallbackUrl]);

  const getFreshSession = useCallback(async (force = false) => {
    if (!session) return null;
    const raw = force && nativeAuth?.forceRefreshSession
      ? await nativeAuth.forceRefreshSession()
      : await nativeAuth?.refreshSession();
    if (!raw) {
      await nativeAuth?.clearSession();
      setSession(null);
      onClearAuthenticatedState();
      return null;
    }
    const next = JSON.parse(raw) as AuthSession;
    if (
      next.accessToken !== session.accessToken ||
      next.refreshToken !== session.refreshToken ||
      next.expiresAt !== session.expiresAt
    ) {
      setSession(next);
    }
    return next;
  }, [onClearAuthenticatedState, session]);

  const withFreshAccessToken = useCallback(async function withFreshAccessToken<T>(
    send: (accessToken: string) => Promise<T>
  ): Promise<T> {
    const activeSession = await getFreshSession();
    if (!activeSession?.accessToken) throw new Error("Your session expired. Sign in again.");
    try {
      return await send(activeSession.accessToken);
    } catch (error) {
      if (!isAuthError(error)) throw error;
      const refreshed = await getFreshSession(true);
      if (!refreshed?.accessToken) throw new Error("Your session expired. Sign in again.");
      return await send(refreshed.accessToken);
    }
  }, [getFreshSession]);

  async function startGoogleSignIn() {
    if (!config?.supabaseUrl || !config.supabaseAnonKey) {
      onMessage("Supabase URL and anon key are not configured in the Android build.");
      return;
    }
    setAuthLoading("oauth");
    onMessage("");
    try {
      const params = new URLSearchParams({
        provider: "google",
        redirect_to: AUTH_CALLBACK_URL
      });
      await Linking.openURL(`${config.supabaseUrl}/auth/v1/authorize?${params.toString()}`);
    } catch (error) {
      onMessage(friendlyError(error, "Could not open Google sign in."));
    } finally {
      setAuthLoading(null);
    }
  }

  async function sendSupabaseAuthEmailLink(email: string) {
    if (!config?.supabaseUrl || !config.supabaseAnonKey) {
      throw new Error("Supabase URL and anon key are not configured in the Android build.");
    }
    await requestJson<Record<string, any>>(`${config.supabaseUrl}/auth/v1/otp?redirect_to=${encodeURIComponent(AUTH_CALLBACK_URL)}`, {
      method: "POST",
      headers: {
        apikey: config.supabaseAnonKey,
        "content-type": "application/json"
      },
      body: {
        email,
        data: {},
        create_user: true,
        gotrue_meta_security: {}
      }
    });
  }

  async function sendEmailAuthLink() {
    if (!config?.supabaseUrl || !config.supabaseAnonKey) {
      onMessage("Supabase URL and anon key are not configured in the Android build.");
      return;
    }
    const email = authEmail.trim();
    const inputError = emailInputError(email);
    if (inputError) {
      onMessage(inputError);
      return;
    }
    setAuthLoading("magiclink");
    onMessage("");
    try {
      await sendSupabaseAuthEmailLink(email);
      setAuthPendingEmail(email);
      setAuthScreen("check-email");
      onMessage("");
    } catch (error) {
      onMessage(friendlyError(error, "Could not send the sign-in link."));
    } finally {
      setAuthLoading(null);
    }
  }

  function backToSignIn() {
    setAuthScreen("signin");
    onMessage("");
  }

  async function signOut() {
    await nativeAuth?.clearSession();
    setSession(null);
    onClearAuthenticatedState();
  }

  return {
    authEmail,
    authLoading,
    authPendingEmail,
    authScreen,
    backToSignIn,
    config,
    handleAuthCallbackUrl,
    sendEmailAuthLink,
    session,
    setAuthEmail,
    signOut,
    startGoogleSignIn,
    withFreshAccessToken
  };
}
