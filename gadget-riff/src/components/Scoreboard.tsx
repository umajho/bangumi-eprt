import { type Component, Show } from "solid-js";
import { customElement, noShadowDOM } from "solid-element";

import {
  describeScore,
  type EpisodeId,
  makeCustomElementTagName,
  type SubjectId,
} from "../definitions";
import * as epDataHelpers from "../utils/episode-data-helpers";
import { EprtLinkSmallGrey } from "./EprtLink";
import type { Context } from "../context";

const TAG_NAME = makeCustomElementTagName("scoreboard");

export function createScoreboardInstance(ctx: Context, opts: {
  subjectId: SubjectId;
  episodeId: EpisodeId;
}) {
  registerScoreboard(ctx);
  const el = document.createElement(TAG_NAME);
  el.setAttribute("subject-id", String(opts.subjectId));
  el.setAttribute("episode-id", String(opts.episodeId));

  return { element: el };
}

let elementConstructor: CustomElementConstructor | null = null;

function registerScoreboard(ctx: Context) {
  elementConstructor ??= customElement(TAG_NAME, {
    subjectId: null,
    episodeId: null,
  }, (props) => {
    noShadowDOM();

    return (
      <Show
        when={Number.isInteger(props.subjectId) &&
          Number.isInteger(props.episodeId)}
      >
        <ScoreboardWrapped
          ctx={ctx}
          subjectId={props.subjectId!}
          episodeId={props.episodeId!}
        />
      </Show>
    );
  });
}

const ScoreboardWrapped: Component<{
  ctx: Context;
  subjectId: SubjectId;
  episodeId: EpisodeId;
}> = (props) => {
  const dataResp = props.ctx.scoreStore.queryEpisodeDataTracked(
    props.subjectId,
    props.episodeId,
    { prefersFetchingCompleteSubjectVotes: false },
  );

  const isLoading = epDataHelpers.createIsLoading(dataResp);
  const data = epDataHelpers.createData(dataResp);

  return (
    <div style="float: right;">
      <Show
        when={!isLoading()}
        fallback={<div style="color: grey">单集评分加载中…</div>}
      >
        <Show when={data()}>
          {(data) => {
            const epComputed = epDataHelpers.createComputedFromData(data);
            return <Scoreboard episodeComputed={epComputed} />;
          }}
        </Show>
      </Show>
    </div>
  );
};

export const Scoreboard: Component<{
  episodeComputed: epDataHelpers.Computed;
}> = (props) => {
  const { averageScore } = props.episodeComputed;

  return (
    <div class="global_score">
      <span class="number" property="v:average">
        {Number.isNaN(averageScore())
          ? 0..toFixed(1)
          : averageScore().toFixed(4)}
      </span>
      <span property="v:best" {...{ content: "10.0" }} />{" "}
      <span class="description">
        {Number.isNaN(averageScore()) ? "--" : describeScore(averageScore())}
      </span>
      <div>
        <EprtLinkSmallGrey />
      </div>
    </div>
  );
};
