import { createMyRatingInstance } from "../components/MyRating";
import { createRateInfoInstance } from "../components/RateInfo";
import { createShowSubjectEpisodeRatingsLineChartModalButtonInstance } from "../components/ShowSubjectEpisodeRatingsLineChartModalButton";
import type { Context } from "../context";
import type { EpisodeId, SubjectId } from "../definitions";
import { createClearDivElement } from "../utils/elements";

export function processSubjectEpListPage(ctx: Context, opts: {
  subjectId: SubjectId;
}) {
  const editEpBatchEl = document.querySelector<HTMLFormElement>(
    '[name="edit_ep_batch"]',
  );
  if (!editEpBatchEl) return;

  const liEls = [
    ...editEpBatchEl.querySelectorAll<HTMLLIElement>(".line_list > li"),
  ]
    .filter((li) => li.querySelector('[name="ep_mod[]"]'));

  collectCacheEntries(ctx, { liEls });

  for (const [i, liEl] of liEls.entries()) {
    liEl.querySelector("h6")
      ?.insertAdjacentElement("afterend", createClearDivElement());

    const episodeId = getEpisodeIdFromLi(liEl);
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
      ctx.revealedEpisodesStore.reveal(episodeId);
    }

    for (const aEl of liEl.querySelectorAll("a.ep_status")) {
      if (aEl.id.startsWith("Watched_")) {
        aEl.addEventListener("click", () => {
          ctx.revealedEpisodesStore.reveal(episodeId);
        });
      }
    }

    const myRatingInstance = createMyRatingInstance(ctx, {
      prefersFetchingCompleteSubjectVotes: true,
      subjectId: opts.subjectId,
      episodeId,
      isPrimary: i === 0,
    });
    liEl.appendChild(myRatingInstance.element);

    const rateInfoInstance = createRateInfoInstance(ctx, {
      subjectId: opts.subjectId,
      episodeId,
      isPrimary: i === 0,
      revealAllButton: true,
    });
    liEl.appendChild(rateInfoInstance.element);

    liEl.appendChild(createClearDivElement());
  }

  {
    const instance =
      createShowSubjectEpisodeRatingsLineChartModalButtonInstance(ctx, {
        subjectId: opts.subjectId,
        collectDataPoints: (_subjectId) => {
          return liEls.flatMap((liEl) => {
            const episodeId = getEpisodeIdFromLi(liEl);
            if (episodeId === null) return [];

            let date: `${number}-${number}-${number}` | null = null;
            for (const smallEl of liEl.querySelectorAll("small.grey")) {
              const m = /首播:(\d{4}-\d{2}-\d{2})/.exec(smallEl.textContent);
              if (m) {
                date = m[1] as `${number}-${number}-${number}`;
                break;
              }
            }
            return date ? [{ episodeId, date }] : [];
          });
        },
      });

    document.querySelector("#columnInSubjectA")?.prepend(instance.element);
  }
}

function collectCacheEntries(ctx: Context, opts: { liEls: HTMLLIElement[] }) {
  // TODO: `putEntryIntoSubjectCache`.

  for (const liEl of opts.liEls) {
    const aEl = liEl.querySelector("h6 > a");
    if (!aEl) continue;

    const title = aEl.textContent;
    if (!title) continue;

    const episodeId = getEpisodeIdFromLi(liEl);
    const m = /^(\d+?)\.(.+)$/.exec(title);
    if (episodeId === null || !m) continue;

    const sort = Number(m[1]);
    const name = m[2];
    if (isNaN(sort)) continue;

    ctx.bgmClient.putEntryIntoEpisodeCache(episodeId, { name, sort });
  }
}

function getEpisodeIdFromLi(liEl: HTMLLIElement): EpisodeId | null {
  const epModEl = liEl.querySelector('[name="ep_mod[]"]');
  if (!epModEl) return null;
  const episodeId = Number(epModEl.getAttribute("value")) as EpisodeId;
  if (isNaN(episodeId)) return null;
  return episodeId;
}
