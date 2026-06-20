import type { AppClient } from "./clients/app-client";
import type { AuthClient } from "./clients/auth-client";
import type { BangumiClient } from "./clients/bangumi-client";
import type { AuthStore } from "./stores/persistent-stores/auth-store";
import type { EntrypointStore } from "./stores/persistent-stores/entrypoint-store";
import type { SettingsStore } from "./stores/persistent-stores/settings-store";
import type { MiscStore } from "./stores/temporary-global-stores/misc-store";
import type { RevealedEpisodesStore } from "./stores/temporary-global-stores/revealed-episodes-store";
import type { ScoreStore } from "./stores/temporary-global-stores/score-store";

export interface Context {
  settingsStore: SettingsStore;
  entrypointStore: EntrypointStore;
  authClient: AuthClient;
  authStore: AuthStore;
  appClient: AppClient;
  bgmClient: BangumiClient;
  revealedEpisodesStore: RevealedEpisodesStore;
  scoreStore: ScoreStore;
  miscStore: MiscStore;
}

export type PrimalContext = Pick<
  Context,
  "settingsStore" | "authStore" | "appClient"
>;
