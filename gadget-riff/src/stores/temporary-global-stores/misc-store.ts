import { createSignal } from "solid-js";

export type MiscStore = ReturnType<typeof createMiscStore>;

export function createMiscStore() {
  const [shouldShowRater, setShouldShowRater] = createSignal(false);

  return { shouldShowRater, setShouldShowRater };
}
