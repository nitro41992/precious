package com.preciouscaptures

import java.io.File
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ShareAssetCleanupTest {
  @Test
  fun retryingShareKeepsCachedAsset() {
    val asset = File.createTempFile("precious-share-retry", ".jpg")
    asset.writeText("image-bytes")

    val deleted = cleanupSharedAsset(asset.absolutePath, ShareAssetProcessingOutcome.RETRYING)

    assertFalse(deleted)
    assertTrue(asset.exists())
    asset.delete()
  }

  @Test
  fun terminalShareDeletesCachedAsset() {
    val asset = File.createTempFile("precious-share-terminal", ".jpg")
    asset.writeText("image-bytes")

    val deleted = cleanupSharedAsset(asset.absolutePath, ShareAssetProcessingOutcome.TERMINAL)

    assertTrue(deleted)
    assertFalse(asset.exists())
  }

  @Test
  fun blankAssetPathIsNeverDeleted() {
    assertFalse(shouldDeleteSharedAsset("", ShareAssetProcessingOutcome.TERMINAL))
    assertFalse(shouldDeleteSharedAsset(null, ShareAssetProcessingOutcome.TERMINAL))
  }
}
