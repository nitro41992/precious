import { Platform } from "react-native";

const android = Platform.OS === "android";

export const colors = {
  paper: "#090a0c",
  surface: "#111216",
  surfaceContainer: "#1a1b20",
  surfaceContainerHigh: "#25272e",
  surfaceContainerHighest: "#30333d",
  ink: "#f4f1e8",
  muted: "#aaa79d",
  line: "#3a3d47",
  soft: "#202229",
  accent: "#d6ff3f",
  accentSoft: "#29330d",
  accentLine: "#5f7418",
  secondary: "#d6d1c4",
  tertiary: "#ffcf5a",
  onAccent: "#111600",
  processing: "#54c7ff",
  processingSoft: "#0d2b39",
  review: "#ffb84d",
  reviewSoft: "#3b2708",
  danger: "#ff6262",
  dangerSoft: "#3f1717",
  create: "#ff6047",
  createSoft: "#401814",
  onCreate: "#1d0805",
  cyan: "#94ebff",
  cyanSoft: "#102f38",
  scrim: "rgba(2, 3, 5, 0.72)"
};

export const identityMarks = [
  { bg: colors.accent, fg: colors.onAccent },
  { bg: colors.cyan, fg: "#061a20" },
  { bg: colors.tertiary, fg: "#241600" },
  { bg: colors.create, fg: colors.onCreate },
  { bg: "#b89bff", fg: "#130a2d" },
  { bg: "#ff9fd7", fg: "#260016" },
  { bg: "#79efb4", fg: "#05190f" }
];

export const fonts = {
  display: android ? "SpaceGrotesk-Bold" : undefined,
  displaySemi: android ? "SpaceGrotesk-SemiBold" : undefined,
  body: android ? "Inter-Regular" : undefined,
  bodySemi: android ? "Inter-SemiBold" : undefined,
  bodyBold: android ? "Inter-Bold" : undefined
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  xxl: 32
};

export const radii = {
  xs: 6,
  sm: 8,
  md: 12,
  lg: 18,
  pill: 999,
  archive: {
    borderTopLeftRadius: 6,
    borderTopRightRadius: 24,
    borderBottomRightRadius: 10,
    borderBottomLeftRadius: 18
  },
  stamp: {
    borderTopLeftRadius: 4,
    borderTopRightRadius: 20,
    borderBottomRightRadius: 8,
    borderBottomLeftRadius: 16
  }
};

export const type = {
  display: {
    fontFamily: fonts.display,
    fontSize: 38,
    fontWeight: "800" as const,
    letterSpacing: 0,
    lineHeight: 42
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 31,
    fontWeight: "800" as const,
    letterSpacing: 0,
    lineHeight: 36
  },
  section: {
    fontFamily: fonts.bodyBold,
    fontSize: 18,
    fontWeight: "800" as const,
    letterSpacing: 0,
    lineHeight: 23
  },
  body: {
    fontFamily: fonts.body,
    fontSize: 15,
    fontWeight: "400" as const,
    letterSpacing: 0,
    lineHeight: 22
  },
  label: {
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    fontWeight: "800" as const,
    letterSpacing: 0,
    lineHeight: 16
  }
};
