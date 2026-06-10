import type { AppClient } from "../clients/app-client";
import type { SubjectId } from "../definitions";
import { processCluetip } from "../element-processors/cluetip";
import { processMusicSubjectEpSection } from "../element-processors/music-subject-ep-section";
import { processPrgList } from "../element-processors/prg-list";
import type { AuthStore } from "../stores/persistent-stores/auth-store";
import type { SettingsStore } from "../stores/persistent-stores/settings-store";
import type { RevealedEpisodesStore } from "../stores/temporary-global-stores/revealed-episodes-store";
import type { ScoreStore } from "../stores/temporary-global-stores/score-store";

export function processSubjectPage(opts: {
  settingsStore: SettingsStore;
  appClient: AppClient;
  authStore: AuthStore;
  scoreStore: ScoreStore;
  revealedEpisodesStore: RevealedEpisodesStore;

  subjectId: SubjectId;
}) {
  const { initializeCluetip } = processCluetip(opts);

  const prgListEl = document.querySelector("ul.prg_list");
  if (prgListEl) {
    processPrgList({
      appClient: opts.appClient,
      scoreStore: opts.scoreStore,
      revealedEpisodesStore: opts.revealedEpisodesStore,
      initializeCluetip,
      prgListElement: prgListEl as HTMLUListElement,
      subjectId: opts.subjectId,
    });
  }

  if (
    document.querySelector("#headerSubject")?.getAttribute("typeof") ===
      "v:Music"
  ) {
    const subjectEpSection = document
      .querySelector<HTMLDivElement>(".subject_ep_section");
    if (subjectEpSection) {
      processMusicSubjectEpSection({
        settingsStore: opts.settingsStore,
        appClient: opts.appClient,
        authStore: opts.authStore,
        scoreStore: opts.scoreStore,
        revealedEpisodesStore: opts.revealedEpisodesStore,
        subjectEpSection,
        subjectId: opts.subjectId,
      });
    }
  }
}
