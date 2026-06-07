import {
  Easing,
  FadeInDown,
  FadeOutDown,
  FadeOutUp,
  LinearTransition
} from "react-native-reanimated";
import { ReduceMotion } from "react-native-reanimated";

export const motionDuration = {
  instant: 80,
  quick: 150,
  enter: 180,
  exit: 120,
  settle: 210,
  reviewHandoff: 430,
  toastIn: 190,
  toastOut: 130
};

export const motionEasing = {
  standard: Easing.out(Easing.cubic),
  exit: Easing.in(Easing.cubic),
  emphasized: Easing.bezier(0.2, 0, 0, 1),
  press: Easing.out(Easing.cubic)
};

export const motionReduceMotion = ReduceMotion.System;

export const motionPressScale = {
  standard: 0.985,
  icon: 0.975
};

// The review hero's scroll-prepared zoom: the open morph lands its flying
// copy at exactly this scale, and the scroll-driven collapse starts from it.
// One token so the two can never drift apart.
export const reviewHeroExpandedScale = 1.08;

export const motionPressSpring = {
  damping: 18,
  mass: 0.7,
  overshootClamping: true,
  reduceMotion: motionReduceMotion,
  stiffness: 320
};

const STAGGER_STEP_MS = 20;
const STAGGER_MAX_MS = 40;

export function motionStaggerDelay(index = 0) {
  return Math.min(Math.max(index, 0) * STAGGER_STEP_MS, STAGGER_MAX_MS);
}

function subtleEntering(index = 0) {
  return FadeInDown
    .duration(motionDuration.enter)
    .delay(motionStaggerDelay(index))
    .easing(motionEasing.standard)
    .withInitialValues({ opacity: 0, transform: [{ translateY: 8 }] })
    .reduceMotion(motionReduceMotion);
}

function subtleExiting() {
  return FadeOutUp
    .duration(motionDuration.exit)
    .easing(motionEasing.exit)
    .withTargetValues({ opacity: 0, transform: [{ translateY: -4 }] })
    .reduceMotion(motionReduceMotion);
}

export function rowEntering(index = 0) {
  return subtleEntering(index);
}

export const rowExiting = subtleExiting();
export const rowLayout = LinearTransition
  .duration(motionDuration.settle)
  .easing(motionEasing.emphasized)
  .reduceMotion(motionReduceMotion);

export function cardEntering(index = 0) {
  return subtleEntering(index);
}

export const cardExiting = subtleExiting();
export const cardLayout = LinearTransition
  .duration(motionDuration.settle)
  .easing(motionEasing.emphasized)
  .reduceMotion(motionReduceMotion);

export const statusEntering = subtleEntering();
export const statusExiting = subtleExiting();
export const statusLayout = LinearTransition
  .duration(motionDuration.quick)
  .easing(motionEasing.standard)
  .reduceMotion(motionReduceMotion);

export const toastEntering = FadeInDown
  .duration(motionDuration.toastIn)
  .easing(motionEasing.emphasized)
  .reduceMotion(motionReduceMotion);
export const toastExiting = FadeOutDown
  .duration(motionDuration.toastOut)
  .easing(motionEasing.exit)
  .reduceMotion(motionReduceMotion);
export const toastLayout = LinearTransition
  .duration(motionDuration.quick)
  .easing(motionEasing.standard)
  .reduceMotion(motionReduceMotion);
