import type { AppClient } from "../clients/app-client";
import { createMyRatingInstance } from "../components/MyRating";
import { createRateInfoInstance } from "../components/RateInfo";
import type { EpisodeId, SubjectId } from "../definitions";
import type { AuthStore } from "../stores/persistent-stores/auth-store";
import type { SettingsStore } from "../stores/persistent-stores/settings-store";
import type { RevealedEpisodesStore } from "../stores/temporary-global-stores/revealed-episodes-store";
import type { ScoreStore } from "../stores/temporary-global-stores/score-store";
import { createClearDivElement } from "../utils/elements";

export function processMusicSubjectEpSection(opts: {
  settingsStore: SettingsStore;
  appClient: AppClient;
  authStore: AuthStore;
  scoreStore: ScoreStore;
  revealedEpisodesStore: RevealedEpisodesStore;

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

    const myRatingInstance = createMyRatingInstance({
      displayMode: "inline_compact",
      noFloat: true,
      prefersFetchingCompleteSubjectVotes: true,
      appClient: opts.appClient,
      authStore: opts.authStore,
      scoreStore: opts.scoreStore,
      revealedEpisodesStore: opts.revealedEpisodesStore,
      subjectId: opts.subjectId,
      episodeId,
      isPrimary: i === 0,
    });
    citeEl.prepend(createSpacingSpan());
    citeEl.prepend(myRatingInstance.element);

    const rateInfoInstance = createRateInfoInstance({
      displayMode: "inline_compact",
      settingsStore: opts.settingsStore,
      appClient: opts.appClient,
      scoreStore: opts.scoreStore,
      revealedEpisodesStore: opts.revealedEpisodesStore,
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
