import { Platform } from "react-native";

export const colors = {
  paper: "#101411",
  surface: "#171c18",
  surfaceContainer: "#1d241f",
  surfaceContainerHigh: "#252d27",
  surfaceContainerHighest: "#303933",
  ink: "#eef5ef",
  muted: "#a6b3aa",
  line: "#37413a",
  soft: "#202821",
  accent: "#7bd7ad",
  accentSoft: "#17382b",
  accentLine: "#2d6b51",
  secondary: "#c1ccbc",
  tertiary: "#d7bf7a",
  onAccent: "#062015",
  processing: "#9fc6e3",
  processingSoft: "#172b39",
  review: "#e2bd76",
  reviewSoft: "#342713",
  danger: "#ffb4a8",
  dangerSoft: "#3a1f1c",
  scrim: "rgba(3, 7, 5, 0.62)"
};

function androidFont(family: string) {
  return Platform.OS === "android" ? { fontFamily: family } : {};
}

export const typefaces = {
  regular: androidFont("Satoshi-Regular"),
  medium: androidFont("Satoshi-Medium"),
  bold: androidFont("Satoshi-Bold"),
  black: androidFont("Satoshi-Black")
};
