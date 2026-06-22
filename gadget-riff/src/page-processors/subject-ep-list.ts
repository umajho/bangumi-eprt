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

  const items = collectItems({ editEpBatchEl });

  putCacheEntries(ctx, { items });

  for (const [i, item] of items.entries()) {
    item.liEl.querySelector("h6")
      ?.insertAdjacentElement("afterend", createClearDivElement());

    const hasUserWatched = (() => {
      if (item.liEl.querySelector(".statusWatched")) return true;

      // 在某次更新后，bangumi 会记录看过的剧集的标记时间，某集存在这个时间表明
      // 那一集有标记为看过。（但是没有这个时间不代表剧集一定没看过，也有可能是
      // 在标记时 bangumi 还没去记录标记时间。因此，这不是万能解。）
      if (item.liEl.querySelector(".rr")?.textContent.trim()) return true;

      return false;
    })();
    if (hasUserWatched) {
      ctx.revealedEpisodesStore.reveal(item.episodeId);
    }

    for (const aEl of item.liEl.querySelectorAll("a.ep_status")) {
      if (aEl.id.startsWith("Watched_")) {
        aEl.addEventListener("click", () => {
          ctx.revealedEpisodesStore.reveal(item.episodeId);
        });
      }
    }

    const myRatingInstance = createMyRatingInstance(ctx, {
      prefersFetchingCompleteSubjectVotes: true,
      subjectId: opts.subjectId,
      episodeId: item.episodeId,
      isPrimary: i === 0,
    });
    item.liEl.appendChild(myRatingInstance.element);

    const rateInfoInstance = createRateInfoInstance(ctx, {
      subjectId: opts.subjectId,
      episodeId: item.episodeId,
      isPrimary: i === 0,
      revealAllButton: true,
    });
    item.liEl.appendChild(rateInfoInstance.element);

    item.liEl.appendChild(createClearDivElement());
  }

  {
    const instance =
      createShowSubjectEpisodeRatingsLineChartModalButtonInstance(ctx, {
        subjectId: opts.subjectId,
        collectDataPoints: (_subjectId) => {
          return items.flatMap((item) => {
            if (item.sortPrefix) return [];

            let date: `${number}-${number}-${number}` | null = null;
            for (const smallEl of item.liEl.querySelectorAll("small.grey")) {
              const m = /首播:(\d{4}-\d{2}-\d{2})/.exec(smallEl.textContent);
              if (m) {
                date = m[1] as `${number}-${number}-${number}`;
                break;
              }
            }
            return date ? [{ episodeId: item.episodeId, date }] : [];
          });
        },
      });

    document.querySelector("#columnInSubjectA")?.prepend(instance.element);
  }
}

function putCacheEntries(ctx: Context, opts: { items: Item[] }) {
  // TODO: `putEntryIntoSubjectCache`.

  for (const item of opts.items) {
    ctx.bgmClient.putEntryIntoEpisodeCache(item.episodeId, {
      name: item.name,
      sort: item.sort,
    });
  }
}

interface Item {
  liEl: HTMLLIElement;
  episodeId: EpisodeId;
  sortPrefix: string;
  sort: number;
  name: string;
}

function collectItems(opts: { editEpBatchEl: HTMLFormElement }): Item[] {
  function getEpisodeIdFromLi(liEl: HTMLLIElement): EpisodeId | null {
    const epModEl = liEl.querySelector('[name="ep_mod[]"]');
    if (!epModEl) return null;
    const episodeId = Number(epModEl.getAttribute("value")) as EpisodeId;
    if (isNaN(episodeId)) return null;
    return episodeId;
  }

  const items: Item[] = [];

  for (
    const liEl of opts.editEpBatchEl.querySelectorAll<HTMLLIElement>(
      ".line_list > li",
    )
  ) {
    if (!liEl.querySelector('[name="ep_mod[]"]')) continue;

    const episodeId = getEpisodeIdFromLi(liEl);
    if (episodeId === null) continue;

    const aEl = liEl.querySelector("h6 > a");
    if (!aEl) continue;

    const title = aEl.textContent;
    if (!title) continue;

    const m = /^([a-zA-Z]*)(\d+?)\.(.+)$/.exec(title);
    if (!m) continue;

    const sortPrefix = m[1];
    const sort = Number(m[2]);
    const name = m[3];
    if (isNaN(sort)) continue;

    items.push({ liEl, episodeId, sortPrefix, sort, name });
  }

  return items;
}
