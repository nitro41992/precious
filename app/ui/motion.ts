import {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  FadeOutDown,
  LinearTransition
} from "react-native-reanimated";

export const motionDuration = {
  instant: 80,
  quick: 150,
  settle: 210,
  reviewHandoff: 430,
  toastIn: 190,
  toastOut: 130
};

export const motionEasing = {
  standard: Easing.out(Easing.cubic),
  exit: Easing.in(Easing.cubic),
  emphasized: Easing.bezier(0.2, 0, 0, 1)
};

export const rowExiting = FadeOut.duration(motionDuration.quick).easing(motionEasing.exit);
export const rowEntering = FadeIn.duration(motionDuration.quick).easing(motionEasing.standard);
export const rowLayout = LinearTransition.duration(motionDuration.settle).easing(motionEasing.emphasized);

export const cardEntering = FadeIn.duration(motionDuration.quick).easing(motionEasing.standard);
export const cardExiting = FadeOut.duration(motionDuration.quick).easing(motionEasing.exit);
export const cardLayout = LinearTransition.duration(motionDuration.settle).easing(motionEasing.emphasized);

export const statusEntering = FadeIn.duration(motionDuration.quick).easing(motionEasing.standard);
export const statusExiting = FadeOut.duration(motionDuration.instant).easing(motionEasing.exit);
export const statusLayout = LinearTransition.duration(motionDuration.quick).easing(motionEasing.standard);

export const toastEntering = FadeInDown.duration(motionDuration.toastIn).easing(motionEasing.emphasized);
export const toastExiting = FadeOutDown.duration(motionDuration.toastOut).easing(motionEasing.exit);
export const toastLayout = LinearTransition.duration(motionDuration.quick).easing(motionEasing.standard);
