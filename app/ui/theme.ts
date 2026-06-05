import { Platform } from "react-native";
import type { StatusBarStyle } from "react-native";

export const colors = {
  transparent: "transparent",
  paper: "#f6f1e8",
  surface: "#fffefa",
  surfaceContainer: "#fff9f0",
  surfaceContainerHigh: "#fbf0e0",
  surfaceContainerHighest: "#f1e1cb",
  reviewCard: "#fffdf8",
  reviewCardWell: "#fff7ec",
  ink: "#25221c",
  muted: "#675f54",
  placeholder: "#776e63",
  line: "#cdbca5",
  lineStrong: "#bca98f",
  accent: "#236f4d",
  accentSoft: "#dcefe5",
  accentLine: "#9bc8b5",
  accentPressed: "#1e6043",
  collectionAccent: "#8a650d",
  collectionAccentSoft: "#f2e7c8",
  collectionAccentPressed: "#745509",
  secondary: "#46544a",
  onAccent: "#fbfff9",
  processing: "#2f6f98",
  processingSoft: "#e0eef7",
  processingLine: "#a9c9dd",
  review: "#946a1d",
  reviewSoft: "#f4e7ca",
  danger: "#b64234",
  dangerSoft: "#f8ded8",
  dangerLine: "#dea299",
  onDanger: "#fff8f6",
  navBorder: "rgba(37, 34, 28, 0.18)",
  rowRipple: "rgba(35, 111, 77, 0.10)",
  skeletonSheen: "rgba(255, 255, 255, 0.64)",
  shadow: "#000000",
  scrim: "rgba(31, 43, 36, 0.36)",
  mediaControl: "rgba(16, 20, 17, 0.72)",
  mediaControlStrong: "rgba(3, 7, 5, 0.68)",
  mediaDangerControl: "rgba(92, 24, 19, 0.78)",
  mediaControlLine: "rgba(238, 245, 239, 0.18)",
  onMediaControl: "#eef5ef",
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
