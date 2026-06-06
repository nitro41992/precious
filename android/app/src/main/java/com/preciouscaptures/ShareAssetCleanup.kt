package com.preciouscaptures

import java.io.File

internal enum class ShareAssetProcessingOutcome {
  RETRYING,
  TERMINAL
}

internal fun shouldDeleteSharedAsset(
  assetPath: String?,
  outcome: ShareAssetProcessingOutcome
): Boolean {
  return outcome == ShareAssetProcessingOutcome.TERMINAL && !assetPath.isNullOrBlank()
}

internal fun cleanupSharedAsset(
  assetPath: String?,
  outcome: ShareAssetProcessingOutcome
): Boolean {
  if (!shouldDeleteSharedAsset(assetPath, outcome)) return false
  return runCatching { File(assetPath!!).delete() }.getOrDefault(false)
}
