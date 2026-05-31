import { NativeModules } from "react-native";

import type { CaptureStore, NativeAuth, NativeClipboard, NativeNetwork } from "./types";

export const nativeStore = NativeModules.PreciousCaptureStore as CaptureStore | undefined;
export const nativeAuth = NativeModules.PreciousAuth as NativeAuth | undefined;
export const nativeNetwork = NativeModules.PreciousNetwork as NativeNetwork | undefined;
export const nativeClipboard = NativeModules.PreciousClipboard as NativeClipboard | undefined;

export class ApiRequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function isAuthError(error: unknown) {
  return error instanceof ApiRequestError && (error.status === 401 || error.status === 403);
}

export async function requestJson<T>(
  url: string,
  input: { method?: string; headers?: Record<string, string>; body?: unknown } = {}
): Promise<T> {
  if (!nativeNetwork) {
    throw new Error("Native network bridge is unavailable.");
  }
  const raw = await nativeNetwork.requestJson(
    url,
    input.method ?? "GET",
    JSON.stringify(input.headers ?? {}),
    input.body === undefined ? null : JSON.stringify(input.body)
  );
  const response = JSON.parse(raw || "{}") as { ok: boolean; status: number; body: string };
  const json = response.body ? JSON.parse(response.body) : {};
  if (!response.ok) {
    throw new ApiRequestError(
      json.error_description || json.msg || json.error || `Request failed (${response.status})`,
      response.status
    );
  }
  return json as T;
}
