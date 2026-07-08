import * as Haptics from 'expo-haptics';

// Centralized haptic feedback for the live tracker. Gated by a user setting
// (default ON) so scorekeepers can disable it to save battery. All calls are
// best-effort and never throw — haptics are a nicety, never load-bearing.
let enabled = true;
export function setHapticsEnabled(on: boolean) { enabled = on; }

export function tapFeedback() {
  if (!enabled) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}
export function undoFeedback() {
  if (!enabled) return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
}
export function successFeedback() {
  if (!enabled) return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}
