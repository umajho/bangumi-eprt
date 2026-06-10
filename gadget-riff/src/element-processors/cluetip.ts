import { createRateInfoInstance } from "../components/RateInfo";
import type { Context } from "../context";
import {
  type EpisodeId,
  makeDataAttributeName,
  type SubjectId,
} from "../definitions";

export function processCluetip(ctx: Context) {
  let counter = 0;

  async function initializeCluetip(
    opts: {
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

    if (!ctx.scoreStore.hasTouchedCompleteSubjectVotes(opts.subjectId)) {
      // 确保用户不是只是无意划过。
      await new Promise((resolve) => setTimeout(resolve, 250));
      if (currentCounter !== counter || !$(popupEl).is(":visible")) return;
    }

    const firstBoardEl = popupEl.querySelector(".tip .board");
    if (!firstBoardEl) return;

    const rateInfoInstance = createRateInfoInstance(ctx, {
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
          ctx.revealedEpisodesStore.reveal(opts.episodeId);
        });
      }
    }
  }

  return { initializeCluetip };
}
