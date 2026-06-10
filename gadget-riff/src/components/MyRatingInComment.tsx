import { type Component, createMemo, onMount, Show } from "solid-js";
import { customElement, noShadowDOM } from "solid-element";

import {
  type EpisodeData,
  type EpisodeId,
  makeCustomElementTagName,
  makeHtmlId,
  type Score,
  type SubjectId,
} from "../definitions";
import * as epDataHelpers from "../utils/episode-data-helpers";
import { readonlyPageData } from "../stores/readonly-page-data";
import { SmallStars } from "./SmallStars";
import { MyRating } from "./MyRating";
import { render } from "solid-js/web";
import type { Context } from "../context";

const TAG_NAME = makeCustomElementTagName("my-rating-in-comment");

export function createMyRatingInCommentInstance(
  ctx: Context,
  opts: { subjectId: SubjectId; episodeId: EpisodeId },
) {
  registerMyRatingInComment(ctx);
  const el = document.createElement(TAG_NAME);
  el.setAttribute("subject-id", String(opts.subjectId));
  el.setAttribute("episode-id", String(opts.episodeId));

  return { element: el };
}

let elementConstructor: CustomElementConstructor | null = null;

const RATE_DIALOG_ID = makeHtmlId("rate-dialog");

function registerMyRatingInComment(ctx: Context) {
  elementConstructor ??= customElement(TAG_NAME, {
    subjectId: null,
    episodeId: null,
  }, (props) => {
    noShadowDOM();

    onMount(() => {
      if (document.getElementById(RATE_DIALOG_ID)) return;

      const wrapper = document.createElement("div");
      document.body.appendChild(wrapper);

      render(() => {
        return (
          <dialog id={RATE_DIALOG_ID}>
            <MyRating
              displayMode="normal"
              noFloat
              shouldEnableVisibilityControl
              prefersFetchingCompleteSubjectVotes={false}
              ctx={ctx}
              subjectId={props.subjectId!}
              episodeId={props.episodeId!}
              isPrimary
            />
            <div style={{ height: "0.5rem" }} />
            <button command="close" commandfor={RATE_DIALOG_ID}>关闭</button>
          </dialog>
        );
      }, wrapper);
    });

    return (
      <Show
        when={Number.isInteger(props.subjectId) &&
          Number.isInteger(props.episodeId)}
      >
        <MyRatingInCommentWrapped
          ctx={ctx}
          subjectId={props.subjectId!}
          episodeId={props.episodeId!}
        />
      </Show>
    );
  });
}

const MyRatingInCommentWrapped: Component<{
  ctx: Context;
  subjectId: SubjectId;
  episodeId: EpisodeId;
}> = (props) => {
  const dataResp = props.ctx.scoreStore.queryEpisodeDataTracked(
    props.subjectId,
    props.episodeId,
    { prefersFetchingCompleteSubjectVotes: false },
  );

  const data = epDataHelpers.createData(dataResp);

  return (
    <Show when={data()}>
      {(episodeData) => <MyRatingInComment data={episodeData()} />}
    </Show>
  );
};

const MyRatingInComment: Component<{
  data: EpisodeData;
}> = (props) => {
  const scoreAndHint = createMemo(
    (): {
      score: Score | null;
      hintType: "public" | "private" | "unknown" | null; // 实际上不应该进入 `unknown` 状态。
    } | null => {
      if (props.data.myRating) {
        if (props.data.myRating.score === null) {
          return { score: null, hintType: null };
        }
        return {
          score: props.data.myRating.score,
          hintType: ((v) => {
            if (v === "unknown") return "unknown";
            return v.isVisible ? "public" : "private";
          })(props.data.myRating.visibility),
        };
      }
      if (!readonlyPageData.claimedUserId) return null;
      if (!props.data.publicVotersByScore) return null;
      for (
        const [scoreStr, voters] of Object.entries(
          props.data.publicVotersByScore,
        )
      ) {
        if (
          voters.some((voter) => voter === readonlyPageData.claimedUserId)
        ) {
          return { score: Number(scoreStr) as Score, hintType: "public" };
        }
      }
      return null;
    },
  );

  return (
    <Show when={scoreAndHint()}>
      {(scoreAndHint) => (
        <>
          <SmallStars
            score={scoreAndHint().score}
            shouldShowNumber={false}
          />
          <Show when={scoreAndHint().hintType} fallback={<ShowModalButton />}>
            <span class="tip_j">
              (<ShowModalButton />
              {((type) => {
                switch (type) {
                  case "public":
                    return "公开";
                  case "private":
                    return "不公开";
                  case "unknown":
                    return "可见性未知";
                }
              })(scoreAndHint().hintType)})
            </span>
          </Show>
          {" "}
        </>
      )}
    </Show>
  );
};

const ShowModalButton: Component<{}> = () => {
  return (
    <button
      command="show-modal"
      commandfor={RATE_DIALOG_ID}
      style={{ "font-size": "12px", padding: 0 }}
    >
      评分
    </button>
  );
};
