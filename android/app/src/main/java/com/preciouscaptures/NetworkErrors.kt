package com.preciouscaptures

import java.io.IOException
import java.net.ConnectException
import java.net.NoRouteToHostException
import java.net.SocketException
import java.net.SocketTimeoutException
import java.net.UnknownHostException

fun Throwable.isTransientNativeNetworkError(): Boolean {
  val value = message.orEmpty()
  return this is UnknownHostException ||
    this is SocketTimeoutException ||
    this is ConnectException ||
    this is NoRouteToHostException ||
    this is SocketException ||
    (this is IOException && (
      value.contains("Unable to resolve host", ignoreCase = true) ||
        value.contains("Software caused connection abort", ignoreCase = true) ||
        value.contains("Connection reset", ignoreCase = true) ||
        value.contains("unexpected end of stream", ignoreCase = true)
      ))
}
