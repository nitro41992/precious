import { Platform } from "react-native";
import type { StatusBarStyle } from "react-native";

export const colors = {
  transparent: "transparent",

  /**
   * Core light surfaces
   * Cleaner, quieter neutrals. Still warm, but no longer parchment-heavy.
   */
  paper: "#f7f8f5",
  surface: "#ffffff",
  surfaceContainer: "#f2f4ef",
  surfaceContainerHigh: "#e9ede6",
  surfaceContainerHighest: "#dde4da",

  reviewCard: "#ffffff",
  reviewCardWell: "#f6f8f3",

  /**
   * Text
   * Slight green-black instead of brown-black.
   * This works better with the primary accent and feels less rustic.
   */
  ink: "#17211b",
  muted: "#5d675f",
  placeholder: "#78827a",

  /**
   * Lines
   * Cooler, softer dividers for light surfaces.
   */
  line: "#d6ddd4",
  lineStrong: "#bbc7bd",

  /**
   * Primary accent
   * Cleaner botanical green. Strong enough on white, not overly saturated.
   */
  accent: "#2f6f50",
  accentSoft: "#e5f2eb",
  accentLine: "#a6cdb8",
  accentPressed: "#25583f",

  /**
   * Collection / secondary emphasis
   * Kept as amber, but less muddy and more deliberate.
   */
  collectionAccent: "#8a641d",
  collectionAccentSoft: "#f4ead2",
  collectionAccentPressed: "#6f5017",

  /**
   * Secondary text/action color
   * Aligned with the neutral/green system instead of reading as a separate hue.
   */
  secondary: "#4f5f55",

  onAccent: "#ffffff",

  /**
   * Processing / informational state
   * Muted blue that fits the palette without becoming loud.
   */
  processing: "#3f7190",
  processingSoft: "#e6f1f6",
  processingLine: "#a9cbdc",

  /**
   * Review / warning-ish state
   * Uses the same amber family as collection to reduce palette sprawl.
   */
  review: "#9a6b1f",
  reviewSoft: "#f5ead2",

  /**
   * Danger
   * Clear red, but softened for a light product UI.
   */
  danger: "#b4473a",
  dangerSoft: "#fbe6e2",
  dangerLine: "#e4a59c",
  onDanger: "#ffffff",

  /**
   * Interaction / overlays
   */
  navBorder: "rgba(23, 33, 27, 0.14)",
  rowRipple: "rgba(47, 111, 80, 0.10)",
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
  mediaControlLine: "rgba(240, 247, 242, 0.20)",
  onMediaControl: "#f1f7f2",

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
