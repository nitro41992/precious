import { Platform } from "react-native";
import type { StatusBarStyle } from "react-native";

export const colors = {
  transparent: "transparent",

  /**
   * Core light surfaces
   * Crisp, cool-neutral light ground — pure-white cards lifting off a faintly cool
   * near-white, with clean grey containers. All warmth/yellow is removed: the
   * references (Wise, Coinbase, Headspace) read vibrant precisely because a bold
   * accent sits on true-neutral white, not on an off-white that muddies it.
   */
  paper: "#F6F7F8",
  surface: "#FFFFFF",
  surfaceContainer: "#EDEFF1",
  surfaceContainerHigh: "#E3E6E9",
  surfaceContainerHighest: "#D4D8DC",

  reviewCard: "#FFFFFF",
  reviewCardWell: "#EDEFF1",

  /**
   * Text
   * Near-black green ink for headings/body, restrained cool-neutral labels.
   */
  ink: "#17211B",
  muted: "#585C60",
  placeholder: "#888D92",

  /**
   * Lines
   * Low-contrast cool-neutral dividers for light surfaces.
   */
  line: "#E6E9EC",
  lineStrong: "#CDD2D7",

  /**
   * Primary accent
   * Vibrant lime — the single high-chroma hero, used sparingly (the 10%) on the
   * neutral ground so it reads bright and fresh. Bright lime carries fills, FABs,
   * and selection; dark ink rides on top. Small text/icons use a deep readable
   * green (not the bright fill) so they keep contrast on light surfaces.
   */
  accent: "#84E72E",
  accentText: "#0FA94F",
  accentTextStrong: "#0C8F43",
  accentSoft: "#E6F8CE",
  accentLine: "#84E72E",
  accentPressed: "#6FD41C",

  /**
   * Collection / secondary emphasis
   * Single-accent system: collections share the ONE lime accent (no second hue —
   * the old two-tone forest green read indecisive). Lime carries collection fills
   * (FAB, selected check) with dark ink on top; small collection labels/icons use
   * the in-family deep green for contrast on light surfaces.
   */
  collectionAccent: "#84E72E",
  collectionAccentText: "#0FA94F",
  collectionAccentSoft: "#E6F8CE",
  collectionAccentLine: "#84E72E",
  collectionAccentPressed: "#6FD41C",

  /**
   * Secondary text/action color
   * In-family deep green for secondary-emphasis text — never a competing hue.
   */
  secondary: "#0C8F43",

  onAccent: "#17211B",
  onCollectionAccent: "#17211B",

  /**
   * Processing / informational state
   * On-brand: a calm neutral pill carries an electric-green spinner/label, so the
   * live "Analyzing" state never introduces a competing blue hue.
   */
  processing: "#0C8F43",
  processingSoft: "#EDEFF1",
  processingLine: "#EDEFF1",

  /**
   * Review / warning-ish state
   * Amber now reads as a genuinely distinct warning hue against the green brand.
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
  rowRipple: "rgba(132, 231, 46, 0.22)",
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
  // Geist everywhere: regular body, medium labels, semibold titles.
  regular: androidFont("Geist-Regular"),
  medium: androidFont("Geist-Medium"),
  bold: androidExactFont("Geist-SemiBold"),
  black: androidExactFont("Geist-SemiBold"),
  // Display tokens resolve to Geist so existing `display*` consumers need no edits.
  displayRegular: androidFont("Geist-Regular"),
  displayMedium: androidFont("Geist-Medium"),
  displaySemibold: androidExactFont("Geist-SemiBold"),
  displayBold: androidExactFont("Geist-SemiBold"),
  cardTitle: androidExactFont("Geist-SemiBold"),
  // Clash Display is retained ONLY for the app-bar titles "Recents"/"Collections".
  appBarTitle: androidExactFont("ClashDisplay-Bold")
};
