import { type Component, Show } from "solid-js";
import { customElement, noShadowDOM } from "solid-element";

import type { Context } from "../context";
import { makeCustomElementTagName, type SubjectId } from "../definitions";
import { getSubjectEpisodeRatingsLineChartModalSingletonInstance } from "./modals/SubjectEpisodeRatingsLineChartModal";
import type { DataPoint } from "./vibe-zone/SubjectEpisodeRatingsLineChart/SubjectEpisodeRatingsLineChart";

const TAG_NAME = makeCustomElementTagName(
  "show-subject-episode-ratings-line-chart-modal-button",
);

export function createShowSubjectEpisodeRatingsLineChartModalButtonInstance(
  ctx: Context,
  opts: {
    subjectId: SubjectId;
    collectDataPoints: (subjectId: SubjectId) => DataPoint[];
  },
) {
  registerShowSubjectEpisodeRatingsLineChartModalButton(ctx, {
    collectDataPoints: opts.collectDataPoints,
  });
  const el = document.createElement(TAG_NAME);
  el.setAttribute("subject-id", String(opts.subjectId));

  return { element: el };
}

let elementConstructor: CustomElementConstructor | null = null;

function registerShowSubjectEpisodeRatingsLineChartModalButton(
  ctx: Context,
  opts: {
    collectDataPoints: (subjectId: SubjectId) => DataPoint[];
  },
) {
  elementConstructor ??= customElement(TAG_NAME, {
    subjectId: null,
  }, (props) => {
    noShadowDOM();

    return (
      <Show when={Number.isInteger(props.subjectId)}>
        <ShowModalButton
          ctx={ctx}
          collectDataPoints={opts.collectDataPoints}
          subjectId={props.subjectId!}
        />
      </Show>
    );
  });
}

const ShowModalButton: Component<{
  ctx: Context;
  collectDataPoints: (subjectId: SubjectId) => DataPoint[];

  subjectId: SubjectId;
}> = (props) => {
  const singleton = //
    getSubjectEpisodeRatingsLineChartModalSingletonInstance(props.ctx);

  return (
    <a
      class="chiiBtn"
      href="#"
      onClick={(ev) => {
        ev.preventDefault();
        singleton.open({
          subjectId: props.subjectId,
          dataPoints: props.collectDataPoints(props.subjectId),
        });
      }}
    >
      打开单集评分折线图
    </a>
  );
};
