import { Platform } from "react-native";
import type { StatusBarStyle } from "react-native";

export const colors = {
  transparent: "transparent",

  /**
   * Core light surfaces
   * Warm ivory paper with nearby tonal containers.
   */
  paper: "#FFF7E6",
  surface: "#FFFFFF",
  surfaceContainer: "#FFF1DA",
  surfaceContainerHigh: "#F8E6C6",
  surfaceContainerHighest: "#F0D9AD",

  reviewCard: "#FFFFFF",
  reviewCardWell: "#FFF1DA",

  /**
   * Text
   * High-contrast warm ink and restrained neutral labels.
   */
  ink: "#17211B",
  muted: "#625F51",
  placeholder: "#817866",

  /**
   * Lines
   * Low-contrast warm dividers for light surfaces.
   */
  line: "#E6D8BB",
  lineStrong: "#D0BE95",

  /**
   * Primary accent
   * Lime stays bright across primary accent fills, icons, and labels.
   */
  accent: "#C5D86D",
  accentText: "#C5D86D",
  accentSoft: "#EEF7C6",
  accentLine: "#C5D86D",
  accentPressed: "#C5D86D",
  intentAccent: "#556600",

  /**
   * Collection / secondary emphasis
   * Carrot stays bright across secondary accent fills, icons, and labels.
   */
  collectionAccent: "#F18F01",
  collectionAccentText: "#F18F01",
  collectionAccentSoft: "#FFE5BC",
  collectionAccentLine: "#F18F01",
  collectionAccentPressed: "#F18F01",

  /**
   * Secondary text/action color
   * Kept as an alias for existing secondary-emphasis call sites.
   */
  secondary: "#F18F01",

  onAccent: "#17211B",
  onCollectionAccent: "#17211B",

  /**
   * Processing / informational state
   * Vivid blue appears sparingly with pale sky support.
   */
  processing: "#3525F5",
  processingSoft: "#C0D6DF",
  processingLine: "#C0D6DF",

  /**
   * Review / warning-ish state
   * Darkened carrot for readable review text on light surfaces.
   */
  review: "#A05E00",
  reviewSoft: "#FFE6BE",

  /**
   * Danger
   * Brighter red while preserving readable text contrast.
   */
  danger: "#D13A2F",
  dangerSoft: "#FFE1DA",
  dangerLine: "#F0A29A",
  onDanger: "#FFFFFF",

  /**
   * Interaction / overlays
   */
  navBorder: "rgba(23, 33, 27, 0.14)",
  rowRipple: "rgba(197, 216, 109, 0.22)",
  skeletonSheen: "rgba(255, 255, 255, 0.72)",

  shadow: "#000000",
  scrim: "rgba(17, 26, 21, 0.38)",

  /**
   * Media controls
   * These stay dark because they likely sit on imagery/video.
   */
  mediaControl: "rgba(12, 18, 14, 0.74)",
  mediaControlStrong: "rgba(3, 7, 5, 0.72)",
  mediaDangerControl: "rgba(100, 28, 23, 0.80)",
  mediaControlLine: "rgba(255, 247, 230, 0.24)",
  onMediaControl: "#FFF7E6",

  imageViewerBackground: "#000000"
};

export const appTheme = {
  statusBarStyle: "dark-content" as StatusBarStyle,
  mediaStatusBarStyle: "light-content" as StatusBarStyle,
  dateTimePickerThemeVariant: "light" as const
};

function androidFont(family: string) {
  return Platform.OS === "android" ? { fontFamily: family } : {};
}

function androidExactFont(family: string) {
  return Platform.OS === "android"
    ? { fontFamily: family, fontWeight: "400" as const }
    : {};
}

export const typefaces = {
  regular: androidFont("Satoshi-Regular"),
  medium: androidFont("Satoshi-Medium"),
  bold: androidFont("Satoshi-Bold"),
  black: androidFont("Satoshi-Black"),
  displayRegular: androidExactFont("ClashDisplay-Regular"),
  displayMedium: androidExactFont("ClashDisplay-Medium"),
  displaySemibold: androidExactFont("ClashDisplay-Semibold"),
  displayBold: androidExactFont("ClashDisplay-Bold")
};
