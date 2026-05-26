package com.preciouscaptures

import android.content.Context
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import org.json.JSONObject

private const val AUTH_PREFS = "precious_native_auth"
private const val AUTH_SESSION_KEY = "session"

class PreciousAuthModule(
  private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "PreciousAuth"

  @ReactMethod
  fun getConfig(promise: Promise) {
    try {
      val apiUrl = configuredApiUrl()
      promise.resolve(
        JSONObject()
          .put("apiUrl", apiUrl)
          .put("supabaseUrl", BuildConfig.SUPABASE_URL)
          .put("supabaseAnonKey", BuildConfig.SUPABASE_ANON_KEY)
          .toString()
      )
    } catch (error: Exception) {
      promise.reject("config_read_failed", error)
    }
  }

  @ReactMethod
  fun persistSession(
    accessToken: String?,
    refreshToken: String?,
    expiresAt: Double,
    userId: String?,
    promise: Promise
  ) {
    try {
      if (accessToken.isNullOrBlank() || refreshToken.isNullOrBlank() || userId.isNullOrBlank()) {
        clearNativeAuthSession(reactContext)
      } else {
        writeNativeAuthSession(
          reactContext,
          JSONObject()
            .put("accessToken", accessToken)
            .put("refreshToken", refreshToken)
            .put("expiresAt", expiresAt.toLong())
            .put("userId", userId)
        )
      }
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("persist_session_failed", error)
    }
  }

  @ReactMethod
  fun getSession(promise: Promise) {
    try {
      promise.resolve(readNativeAuthSession(reactContext)?.toString())
    } catch (error: Exception) {
      promise.reject("session_read_failed", error)
    }
  }

  @ReactMethod
  fun clearSession(promise: Promise) {
    try {
      clearNativeAuthSession(reactContext)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("session_clear_failed", error)
    }
  }
}

fun configuredApiUrl(): String {
  val explicit = BuildConfig.PRECIOUS_API_URL.trimEnd('/')
  if (explicit.isNotBlank()) return explicit
  val supabaseUrl = BuildConfig.SUPABASE_URL.trimEnd('/')
  if (supabaseUrl.isBlank()) return ""
  return "$supabaseUrl/functions/v1/capture-intake"
}

fun readNativeAuthSession(context: Context): JSONObject? {
  val raw = context
    .getSharedPreferences(AUTH_PREFS, Context.MODE_PRIVATE)
    .getString(AUTH_SESSION_KEY, null)
    ?: return null
  return runCatching { JSONObject(raw) }.getOrNull()
}

fun writeNativeAuthSession(context: Context, session: JSONObject) {
  context
    .getSharedPreferences(AUTH_PREFS, Context.MODE_PRIVATE)
    .edit()
    .putString(AUTH_SESSION_KEY, session.toString())
    .commit()
}

fun clearNativeAuthSession(context: Context) {
  context
    .getSharedPreferences(AUTH_PREFS, Context.MODE_PRIVATE)
    .edit()
    .remove(AUTH_SESSION_KEY)
    .commit()
}
