import { Platform } from "react-native";
import type { StatusBarStyle } from "react-native";

export const colors = {
  transparent: "transparent",

  /**
   * Core light surfaces
   * Warm porcelain paper with nearby tonal containers: the warmth of the
   * prior ivory, desaturated toward a refined bone so it reads as expensive
   * paper rather than cream.
   */
  paper: "#F7F4EC",
  surface: "#FFFFFF",
  surfaceContainer: "#F1EDE2",
  surfaceContainerHigh: "#E9E3D4",
  surfaceContainerHighest: "#DED5C2",

  reviewCard: "#FFFFFF",
  reviewCardWell: "#F1EDE2",

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
  line: "#E4DECF",
  lineStrong: "#CFC6B4",

  /**
   * Primary accent
   * Lime stays bright for fills and small accents; longer inline text uses a darker green.
   * Deepened slightly from the candy lime so it reads premium on porcelain.
   */
  accent: "#B6CB57",
  accentText: "#B6CB57",
  accentTextStrong: "#556600",
  accentSoft: "#E8F0CC",
  accentLine: "#B6CB57",
  accentPressed: "#98AC45",

  /**
   * Collection / secondary emphasis
   * Carrot stays bright across secondary accent fills, icons, and labels.
   * Richened slightly to sit alongside the refined lime.
   */
  collectionAccent: "#E8820A",
  collectionAccentText: "#E8820A",
  collectionAccentSoft: "#F6E2C4",
  collectionAccentLine: "#E8820A",
  collectionAccentPressed: "#C06A00",

  /**
   * Secondary text/action color
   * Kept as an alias for existing secondary-emphasis call sites.
   */
  secondary: "#E8820A",

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
  rowRipple: "rgba(182, 203, 87, 0.22)",
  skeletonSheen: "rgba(255, 255, 255, 0.6)",

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
  onMediaControl: "#F7F4EC",
  onMediaControlStrong: "#FFFFFF",

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
