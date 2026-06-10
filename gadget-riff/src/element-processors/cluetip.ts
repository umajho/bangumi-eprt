import type { AppClient } from "../clients/app-client";
import { createRateInfoInstance } from "../components/RateInfo";
import {
  type EpisodeId,
  makeDataAttributeName,
  type SubjectId,
} from "../definitions";
import type { SettingsStore } from "../stores/persistent-stores/settings-store";
import type { RevealedEpisodesStore } from "../stores/temporary-global-stores/revealed-episodes-store";
import type { ScoreStore } from "../stores/temporary-global-stores/score-store";

export function processCluetip(
  { settingsStore, scoreStore, revealedEpisodesStore }: {
    settingsStore: SettingsStore;
    scoreStore: ScoreStore;
    revealedEpisodesStore: RevealedEpisodesStore;
  },
) {
  let counter = 0;

  async function initializeCluetip(
    opts: {
      appClient: AppClient;

      subjectId: SubjectId;
      episodeId: EpisodeId;
    },
  ) {
    const el = document.querySelector("#cluetip");
    if (!el) return;
    const popupEl = el.querySelector(".prg_popup");
    if (!popupEl) return;

    const attrNameInitialized = makeDataAttributeName("initialized");
    if (popupEl.getAttribute(attrNameInitialized)) return;
    popupEl.setAttribute(attrNameInitialized, "true");

    counter++;
    const currentCounter = counter;

    if (!scoreStore.hasTouchedCompleteSubjectVotes(opts.subjectId)) {
      // 确保用户不是只是无意划过。
      await new Promise((resolve) => setTimeout(resolve, 250));
      if (currentCounter !== counter || !$(popupEl).is(":visible")) return;
    }

    const firstBoardEl = popupEl.querySelector(".tip .board");
    if (!firstBoardEl) return;

    const rateInfoInstance = createRateInfoInstance({
      settingsStore,
      appClient: opts.appClient,
      scoreStore,
      revealedEpisodesStore,
      subjectId: opts.subjectId,
      episodeId: opts.episodeId,
      isPrimary: true,
    });
    firstBoardEl.insertAdjacentElement("beforebegin", rateInfoInstance.element);

    for (
      const epStatusEl of popupEl
        .querySelectorAll(".epStatusTool > a.ep_status")
    ) {
      if (epStatusEl.id.startsWith("Watched")) {
        epStatusEl.addEventListener("click", () => {
          revealedEpisodesStore.reveal(opts.episodeId);
        });
      }
    }
  }

  return { initializeCluetip };
}
