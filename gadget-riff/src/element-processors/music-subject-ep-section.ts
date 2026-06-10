import { createMyRatingInstance } from "../components/MyRating";
import { createRateInfoInstance } from "../components/RateInfo";
import type { Context } from "../context";
import type { EpisodeId, SubjectId } from "../definitions";
import { createClearDivElement } from "../utils/elements";

export function processMusicSubjectEpSection(ctx: Context, opts: {
  subjectEpSection: HTMLDivElement;
  subjectId: SubjectId;
}) {
  for (
    const [i, liEl] of [
      ...opts.subjectEpSection.querySelectorAll(".line_list > li"),
    ]
      .filter((li) => li.querySelector("cite"))
      .entries()
  ) {
    const h6El = liEl.querySelector("h6");
    const citeEl = liEl.querySelector("cite");
    if (!h6El || !citeEl) continue;

    const episodeId = ((): EpisodeId | null => {
      const href = h6El.querySelector<HTMLAnchorElement>(":scope > a")?.href;
      if (!href) return null;
      const match = href.match(/\/ep\/(\d+)/);
      if (!match) return null;
      return Number(match[1]) as EpisodeId;
    })();
    if (episodeId === null) continue;

    const myRatingInstance = createMyRatingInstance(ctx, {
      displayMode: "inline_compact",
      noFloat: true,
      prefersFetchingCompleteSubjectVotes: true,
      subjectId: opts.subjectId,
      episodeId,
      isPrimary: i === 0,
    });
    citeEl.prepend(createSpacingSpan());
    citeEl.prepend(myRatingInstance.element);

    const rateInfoInstance = createRateInfoInstance(ctx, {
      displayMode: "inline_compact",
      subjectId: opts.subjectId,
      episodeId,
      isMusic: true,
      isPrimary: i === 0,
      revealAllButton: true,
    });
    h6El.appendChild(createSpacingSpan());
    h6El.appendChild(rateInfoInstance.element);

    liEl.appendChild(createClearDivElement());
  }
}

function createSpacingSpan() {
  const spanEl = document.createElement("span");
  spanEl.style.display = "inline-block";
  spanEl.style.width = "0.25rem";
  return spanEl;
}
