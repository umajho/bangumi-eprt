import { type Accessor, createEffect, createRoot, on } from "solid-js";

import { createEpisodeOverviewInstance } from "../components/EpisodeOverview";
import {
  type EpisodeId,
  makeDataAttributeName,
  type Score,
  scores,
  type SubjectId,
  type UserId,
} from "../definitions";
import { readonlyPageData } from "../stores/readonly-page-data";
import type {
  EpisodeDataResponse,
} from "../stores/temporary-global-stores/score-store";
import { createClearDivElement } from "../utils/elements";
import { createSmallStarsInstance } from "../components/SmallStars";
import { createMyRatingCompactInstance } from "../components/MyRatingCompact";
import { createMyRatingInstance } from "../components/MyRating";
import type { Context } from "../context";

export async function processEpPage(ctx: Context, opts: {
  subjectId: SubjectId;
  episodeId: EpisodeId;
}) {
  putCacheEntries(ctx);

  const columnEpAEl = document.querySelector("#columnEpA");
  const epDescEl = columnEpAEl?.querySelector(":scope > .epDesc");
  if (!columnEpAEl || !epDescEl) return;

  {
    const episodeOverviewInstance = createEpisodeOverviewInstance(ctx, opts);
    columnEpAEl.prepend(episodeOverviewInstance.element);

    epDescEl.insertAdjacentElement("afterend", createClearDivElement());
  }

  {
    const userIdToTextIdMap = buildUserIdToTextIdMap();

    const dataResp = ctx.scoreStore.queryEpisodeDataTracked(
      opts.subjectId,
      opts.episodeId,
      { prefersFetchingCompleteSubjectVotes: false },
    );

    processOtherPeoplesRatingsInCommentsOnce({
      dataResp,
      myUserId: readonlyPageData.claimedUserId,
      userIdToTextIdMap,
    });

    processMyRatingsInComments(ctx, {
      subjectId: opts.subjectId,
      episodeId: opts.episodeId,
    });

    processReplysForm(ctx, {
      subjectId: opts.subjectId,
      episodeId: opts.episodeId,
    });
  }
}

function putCacheEntries(ctx: Context) {
  // TODO: `putEntryIntoSubjectCache`.

  for (const aEl of document.querySelectorAll(".sideEpList > li > a.l")) {
    const href = aEl.getAttribute("href");
    const text = aEl.textContent;
    if (!href || !text) continue;

    const episodeId = Number(href.split("/").at(-1)) as EpisodeId;
    const m = /^ep\.(.+?) (.+)$/.exec(text);
    if (isNaN(episodeId) || !m) continue;

    const sort = Number(m[1]);
    const name = m[2];
    if (isNaN(sort)) continue;

    ctx.bgmClient.putEntryIntoEpisodeCache(episodeId, { name, sort });
  }
}

function processOtherPeoplesRatingsInCommentsOnce(opts: {
  dataResp: Accessor<EpisodeDataResponse>;
  myUserId: UserId | null;
  userIdToTextIdMap: Record<UserId, string>;
}) {
  createRoot((dispose) =>
    createEffect(on(opts.dataResp, (dataResp) => {
      if (dataResp[0] !== "ok") return;
      const publicVotersByScore = dataResp[1].publicVotersByScore;
      dispose();
      if (!publicVotersByScore) return;
      for (const score of scores) {
        const publicVoters = publicVotersByScore[score];
        if (!publicVoters) continue;
        for (const userId of publicVoters as UserId[]) {
          if (userId === opts.myUserId) continue;
          const userTextId = opts.userIdToTextIdMap[userId];
          if (!userTextId) continue;
          installSmallStars({ userTextId, score });
        }
      }
    }))
  );

  function installSmallStars(opts: {
    userTextId: string;
    score: Score;
  }) {
    for (
      const el of document.querySelectorAll<HTMLDivElement>(
        `[id^="post_"][data-item-user="${opts.userTextId}"]:not(.reply_collapse,.sub_reply_collapse)`,
      )
    ) {
      const contentEl = el
        .querySelector(".inner > .reply_content,.cmt_sub_content");
      if (!contentEl) continue;

      const instance = createSmallStarsInstance({ score: opts.score });
      contentEl.insertAdjacentElement("beforebegin", instance.element);
    }
  }
}

const DATA_ATTRIBUTE_NAME_RATING_IN_COMMENT_INSTALLED = //
  makeDataAttributeName("rating-in-comment-installed");

function processMyRatingsInComments(ctx: Context, opts: {
  subjectId: SubjectId;
  episodeId: EpisodeId;
}) {
  const myUserTextId = readonlyPageData.getClaimedUserTextIdAndName()?.textId;
  if (!myUserTextId) return;

  {
    const oldInsertFn = chiiLib.ajax_reply.insertJsonComments;
    chiiLib.ajax_reply.insertJsonComments = function (...args: unknown[]) {
      oldInsertFn.apply(this, args);
      installMyRatingsInComments(ctx, opts);
    };
  }

  installMyRatingsInComments(ctx, opts);

  function installMyRatingsInComments(ctx: Context, opts: {
    subjectId: SubjectId;
    episodeId: EpisodeId;
  }) {
    for (
      const el of document.querySelectorAll<HTMLDivElement>(
        `[id^="post_"]:not(.reply_collapse,.sub_reply_collapse):not([${DATA_ATTRIBUTE_NAME_RATING_IN_COMMENT_INSTALLED}]):has(a.avatar[href$="/user/${myUserTextId}"])`,
      )
    ) {
      el.setAttribute(DATA_ATTRIBUTE_NAME_RATING_IN_COMMENT_INSTALLED, "");

      const contentEl = el
        .querySelector(".inner > .reply_content,.cmt_sub_content");
      if (!contentEl) continue;

      const instance = createMyRatingCompactInstance(ctx, opts);
      contentEl.insertAdjacentElement("beforebegin", instance.element);
      instance.element.insertAdjacentText("beforebegin", " ");
      instance.element.insertAdjacentText("afterend", " ");
    }
  }
}

/**
 * 处理子评论的表单。
 */
function processReplysForm(ctx: Context, opts: {
  subjectId: SubjectId;
  episodeId: EpisodeId;
}) {
  const oldSubReplyFn = (window as any).subReply;

  (window as any).subReply = function (...args: any[]) {
    oldSubReplyFn(...args);

    const el = document.querySelector("#ReplysForm");
    if (!el) return;

    const submitButtonEl = el.querySelector("#submitBtnO");
    if (!submitButtonEl) return;

    const instance = createMyRatingInstance(ctx, {
      displayMode: "normal",
      shouldEnableVisibilityControl: true,
      prefersFetchingCompleteSubjectVotes: false,
      subjectId: opts.subjectId,
      episodeId: opts.episodeId,
    });
    submitButtonEl.append(instance.element);
  };
}

function buildUserIdToTextIdMap(): Record<UserId, string> {
  const userIdToTextIdMap: Record<UserId, string> = {};
  const seenUserTextIds = new Set<string>();
  const claimedTextId = readonlyPageData.getClaimedUserTextIdAndName()
    ?.textId;
  if (claimedTextId && readonlyPageData.claimedUserId) {
    userIdToTextIdMap[readonlyPageData.claimedUserId] = claimedTextId;
  }

  for (
    const el of document.querySelectorAll<HTMLDivElement>('[id^="post_"]')
  ) {
    const textId = el.dataset.itemUser;
    if (!textId || (seenUserTextIds.has(textId))) continue;
    seenUserTextIds.add(textId);

    const isSubReply = isElementSubReply(el);

    const replyOnClickText = //
      el.querySelector("a:has(> span.ico_reply)")?.getAttribute("onclick");
    if (!replyOnClickText) { // 删除了的吐槽，暂时没有确保能获取到用户数字 ID 的途径。
      continue;
    }

    // type, topic_id, post_id, sub_reply_id, sub_reply_uid, post_uid, sub_post_type
    const args = /\((.*)\)/.exec(replyOnClickText)?.[1]
      ?.split(",")
      ?.map((arg) => arg.trim());
    if (!args) continue;

    const userID = Number(isSubReply ? args.at(-3) : args.at(-2));
    if (Number.isNaN(userID)) continue;

    userIdToTextIdMap[userID as UserId] = textId;
  }

  return userIdToTextIdMap;
}

function isElementSubReply(el: Element): boolean {
  return !!el.closest(".topic_sub_reply");
}
