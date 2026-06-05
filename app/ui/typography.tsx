import { forwardRef } from "react";
import {
  Text as NativeText,
  TextInput as NativeTextInput,
  type TextInputProps,
  type TextProps
} from "react-native";
import type {
  Text as NativeTextInstance,
  TextInput as NativeTextInputInstance
} from "react-native";

import { typefaces } from "./theme";

export const Text = forwardRef<NativeTextInstance, TextProps>(function AppText(
  { style, ...props },
  ref
) {
  return <NativeText ref={ref} style={[typefaces.regular, style]} {...props} />;
});

export const TextInput = forwardRef<NativeTextInputInstance, TextInputProps>(function AppTextInput(
  { style, ...props },
  ref
) {
  return <NativeTextInput ref={ref} style={[typefaces.regular, style]} {...props} />;
});
