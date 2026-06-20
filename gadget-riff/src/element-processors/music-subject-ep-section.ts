import { createMusicTrackListRaterSwitchInstance } from "../components/MusicTrackLisctRaterSwitch";
import { createMyRatingForTrackListItemInstance } from "../components/MyRatingForMusicTrackListItem";
import { createRateInfoInstance } from "../components/RateInfo";
import type { Context } from "../context";
import type { EpisodeId, SubjectId } from "../definitions";
import { createClearDivElement } from "../utils/elements";

export function processMusicSubjectEpSection(ctx: Context, opts: {
  subjectEpSection: HTMLDivElement;
  subjectId: SubjectId;
}) {
  collectCacheEntries(ctx, { subjectEpSection: opts.subjectEpSection });

  const subtitle = opts.subjectEpSection.querySelector(":scope > h2.subtitle");
  if (subtitle) {
    const instance = createMusicTrackListRaterSwitchInstance(ctx);
    subtitle.appendChild(instance.element);
  }

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

    const myRatingInstance = createMyRatingForTrackListItemInstance(ctx, {
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

function collectCacheEntries(ctx: Context, opts: {
  subjectEpSection: HTMLDivElement;
}) {
  // TODO: `putEntryIntoSubjectCache`.

  for (
    const liEl of [
      ...opts.subjectEpSection.querySelectorAll(".line_list > li"),
    ]
      .filter((li) => li.querySelector("cite"))
  ) {
    const aEl = liEl.querySelector("h6 > a");
    if (!aEl) continue;

    const href = aEl.getAttribute("href");
    const text = aEl.textContent;
    if (!href || !text) continue;

    const episodeId = Number(href.split("/").at(-1)) as EpisodeId;
    const m = /^(\d+) (.+)$/.exec(text);
    if (isNaN(episodeId) || !m) continue;

    const sort = Number(m[1]);
    const name = m[2];
    if (isNaN(sort)) continue;

    ctx.bgmClient.putEntryIntoEpisodeCache(episodeId, { name, sort });
  }
}

function createSpacingSpan() {
  const spanEl = document.createElement("span");
  spanEl.style.display = "inline-block";
  spanEl.style.width = "0.25rem";
  return spanEl;
}
