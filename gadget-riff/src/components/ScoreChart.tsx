import {
  type Component,
  createMemo,
  createSignal,
  Index,
  type Setter,
  Show,
} from "solid-js";
import { customElement, noShadowDOM } from "solid-element";

import {
  type EpisodeId,
  makeCustomElementTagName,
  type Score,
  scoresReversed,
  type SubjectId,
} from "../definitions";
import * as epDataHelpers from "../utils/episode-data-helpers";
import { Tooltip } from "./Tooltip";
import type { Context } from "../context";

const TAG_NAME = makeCustomElementTagName("score-chart");

export function createScoreChartInstance(ctx: Context, opts: {
  subjectId: SubjectId;
  episodeId: EpisodeId;
}) {
  registerScoreChart(ctx);
  const el = document.createElement(TAG_NAME);
  el.setAttribute("subject-id", String(opts.subjectId));
  el.setAttribute("episode-id", String(opts.episodeId));

  return { element: el };
}

let elementConstructor: CustomElementConstructor | null = null;

function registerScoreChart(ctx: Context) {
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
        <ScoreChartWrapped
          ctx={ctx}
          subjectId={props.subjectId!}
          episodeId={props.episodeId!}
        />
      </Show>
    );
  });
}

const ScoreChartWrapped: Component<{
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
    <div style="float: right; width: 218px;">
      <Show when={data()}>
        {(data) => {
          const epComputed = epDataHelpers.createComputedFromData(data);
          return <ScoreChart episodeComputed={epComputed} />;
        }}
      </Show>
    </div>
  );
};

export const ScoreChart: Component<{
  episodeComputed: epDataHelpers.Computed;
}> = (props) => {
  // oxlint-disable-next-line no-unassigned-vars
  let ref!: HTMLDivElement;

  const [tooltipStuff, setTooltipStuff] = //
    createSignal<TooltipStuff | null>(null);

  return (
    <div ref={ref} id="ChartWarpper" class="chartWrapper">
      <div class="chart_desc">
        <small class="grey">
          <span property="v:votes">{props.episodeComputed.totalVotes()}</span>
          {" "}
          votes
        </small>
      </div>
      <ul class="horizontalChart">
        <Index each={scoresReversed}>
          {(score) => (
            <Bar
              score={score()}
              episodeComputed={props.episodeComputed}
              setTooltipStuff={setTooltipStuff}
            />
          )}
        </Index>
        <Show when={tooltipStuff()}>
          {(tooltipStuff) => (
            <Tooltip
              style={{ transform: "translateX(-50%)" }}
              left={tooltipStuff().left - ref.getBoundingClientRect().left}
              top={-34}
            >
              {tooltipStuff().text}
            </Tooltip>
          )}
        </Show>
      </ul>
    </div>
  );
};

interface TooltipStuff {
  left: number;
  text: string;
}

const Bar: Component<{
  score: Score;
  episodeComputed: epDataHelpers.Computed;
  setTooltipStuff: Setter<TooltipStuff | null>;
}> = (props) => {
  const votes = createMemo(() =>
    props.episodeComputed.votes()[props.score] ?? 0
  );
  const tip = createMemo(() => {
    const totalVotes = props.episodeComputed.totalVotes();
    const percentage = ((votes() / totalVotes * 100) || 0).toFixed(2);
    return `${percentage}% (${votes()}人)`;
  });

  const height = createMemo(() => {
    const votesOfMostVotedScore = props.episodeComputed.votesOfMostVotedScore();
    return (votes() / votesOfMostVotedScore * 100 || 0) + "%";
  });

  return (
    <li
      onMouseEnter={(ev) => {
        const rect = ev.currentTarget.getBoundingClientRect();

        return props.setTooltipStuff({
          left: rect.left + rect.width / 2,
          text: tip(),
        });
      }}
      onMouseLeave={() => props.setTooltipStuff(null)}
    >
      <a class="textTip" data-original-title={tip()}>
        <span class="label">{props.score}</span>
        <span class="count" style={{ height: height() }}>{votes()}</span>
      </a>
    </li>
  );
};
