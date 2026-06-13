import { SvgXml } from "react-native-svg";

import { colors } from "./theme";
import { STOWBEAR_LOGO_XML } from "./stowbearLogoXml";

type StowbearLogoProps = {
  size?: number;
  color?: string;
};

// The Stowbear brand mark. One source for every placement (Home header, boot
// screen, auth brand chip). The SVG fills are currentColor, so `color` tints it.
export function StowbearLogo({ size = 28, color = colors.ink }: StowbearLogoProps) {
  return <SvgXml xml={STOWBEAR_LOGO_XML} width={size} height={size} color={color} />;
}
