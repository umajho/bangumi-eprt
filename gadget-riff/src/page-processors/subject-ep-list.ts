import type { AppClient } from "../clients/app-client";
import { createMyRatingInstance } from "../components/MyRating";
import { createRateInfoInstance } from "../components/RateInfo";
import type { EpisodeId, SubjectId } from "../definitions";
import type { AuthStore } from "../stores/persistent-stores/auth-store";
import type { SettingsStore } from "../stores/persistent-stores/settings-store";
import type { RevealedEpisodesStore } from "../stores/temporary-global-stores/revealed-episodes-store";
import type { ScoreStore } from "../stores/temporary-global-stores/score-store";
import { createClearDivElement } from "../utils/elements";

export function processSubjectEpListPage(opts: {
  settingsStore: SettingsStore;
  appClient: AppClient;
  authStore: AuthStore;
  scoreStore: ScoreStore;
  revealedEpisodesStore: RevealedEpisodesStore;

  subjectId: SubjectId;
}) {
  const editEpBatchEl = document.querySelector('[name="edit_ep_batch"]');
  if (!editEpBatchEl) return;

  for (
    const [i, liEl] of [...editEpBatchEl.querySelectorAll(".line_list > li")]
      .filter((li) => li.querySelector('[name="ep_mod[]"]'))
      .entries()
  ) {
    liEl.querySelector("h6")
      ?.insertAdjacentElement("afterend", createClearDivElement());

    const episodeId = ((): EpisodeId | null => {
      const href = liEl.querySelector<HTMLAnchorElement>("h6 > a")?.href;
      if (!href) return null;
      const match = href.match(/\/ep\/(\d+)/);
      if (!match) return null;
      return Number(match[1]) as EpisodeId;
    })();
    if (episodeId === null) continue;

    const hasUserWatched = (() => {
      if (liEl.querySelector(".statusWatched")) return true;

      // 在某次更新后，bangumi 会记录看过的剧集的标记时间，某集存在这个时间表明
      // 那一集有标记为看过。（但是没有这个时间不代表剧集一定没看过，也有可能是
      // 在标记时 bangumi 还没去记录标记时间。因此，这不是万能解。）
      if (liEl.querySelector(".rr")?.textContent.trim()) return true;

      return false;
    })();
    if (hasUserWatched) {
      opts.revealedEpisodesStore.reveal(episodeId);
    }

    for (const aEl of liEl.querySelectorAll("a.ep_status")) {
      if (aEl.id.startsWith("Watched_")) {
        aEl.addEventListener("click", () => {
          opts.revealedEpisodesStore.reveal(episodeId);
        });
      }
    }

    const myRatingInstance = createMyRatingInstance({
      prefersFetchingCompleteSubjectVotes: true,
      appClient: opts.appClient,
      authStore: opts.authStore,
      scoreStore: opts.scoreStore,
      revealedEpisodesStore: opts.revealedEpisodesStore,
      subjectId: opts.subjectId,
      episodeId,
      isPrimary: i === 0,
    });
    liEl.appendChild(myRatingInstance.element);

    const rateInfoInstance = createRateInfoInstance({
      settingsStore: opts.settingsStore,
      appClient: opts.appClient,
      scoreStore: opts.scoreStore,
      revealedEpisodesStore: opts.revealedEpisodesStore,
      subjectId: opts.subjectId,
      episodeId,
      isPrimary: i === 0,
      revealAllButton: true,
    });
    liEl.appendChild(rateInfoInstance.element);

    liEl.appendChild(createClearDivElement());
  }
}
