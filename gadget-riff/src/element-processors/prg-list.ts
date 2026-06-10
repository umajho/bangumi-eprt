import type { Context } from "../context";
import type { EpisodeId, SubjectId } from "../definitions";
import { processCluetip } from "../element-processors/cluetip";

export function processPrgList(ctx: Context, opts: {
  initializeCluetip: ReturnType<typeof processCluetip>["initializeCluetip"];

  prgListElement: HTMLUListElement;
  subjectId: SubjectId;
}) {
  let isMouseOver = false;
  for (const liEl of opts.prgListElement.querySelectorAll(":scope > li")) {
    if (!liEl.querySelector(".load-epinfo")) continue;

    liEl.addEventListener("mouseover", () => {
      if (isMouseOver) return;
      isMouseOver = true;

      const aEl = liEl.querySelector("a");
      if (!aEl) return;

      const episodeId = (() => {
        const href = aEl.getAttribute("href");
        if (!href) return;
        const match = href.match(/^\/ep\/(\d+)/);
        if (!match) return;
        return Number(match[1]) as EpisodeId;
      })();
      if (episodeId === undefined) return;

      const hasUserWatched = aEl.classList.contains("epBtnWatched");
      if (hasUserWatched) {
        ctx.revealedEpisodesStore.reveal(episodeId);
      }

      opts.initializeCluetip({ subjectId: opts.subjectId, episodeId });
    });

    liEl.addEventListener("mouseout", () => {
      isMouseOver = false;
    });
  }
}
