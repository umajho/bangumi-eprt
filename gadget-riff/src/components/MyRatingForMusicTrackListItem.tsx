import { type Component, Match, Show, Switch } from "solid-js";
import { customElement, noShadowDOM } from "solid-element";

import type { Context } from "../context";
import {
  type EpisodeId,
  makeCustomElementTagName,
  type SubjectId,
} from "../definitions";
import { MyRating } from "./MyRating";
import { MyRatingCompact } from "./MyRatingCompact";

const TAG_NAME = //
  makeCustomElementTagName("my-rating-for-music-track-list-item");

export function createMyRatingForTrackListItemInstance(ctx: Context, opts: {
  subjectId: SubjectId;
  episodeId: EpisodeId;
  isPrimary?: boolean;
}) {
  registerMyRatingForTrackListItem(ctx);
  const el = document.createElement(TAG_NAME);
  el.setAttribute("subject-id", String(opts.subjectId));
  el.setAttribute("episode-id", String(opts.episodeId));
  if (opts.isPrimary) {
    el.setAttribute("is-primary", "true");
  }

  return { element: el };
}

let elementConstructor: CustomElementConstructor | null = null;

function registerMyRatingForTrackListItem(ctx: Context) {
  elementConstructor ??= customElement(TAG_NAME, {
    subjectId: null,
    episodeId: null,
    isPrimary: null,
  }, (props) => {
    noShadowDOM();

    return (
      <Show
        when={Number.isInteger(props.subjectId) &&
          Number.isInteger(props.episodeId)}
      >
        <MyRatingForTrackListItemWrapped
          ctx={ctx}
          subjectId={props.subjectId!}
          episodeId={props.episodeId!}
          isPrimary={!!props.isPrimary}
        />
      </Show>
    );
  });
}

const MyRatingForTrackListItemWrapped: Component<{
  ctx: Context;
  subjectId: SubjectId;
  episodeId: EpisodeId;
  isPrimary: boolean;
}> = (props) => {
  const displayOption = props.ctx.settingsStore
    .getMusicSubjectPageTrackListRaterDisplaySignal();
  const styleOption = props.ctx.settingsStore
    .getMusicSubjectPageTrackListRaterStyleSignal();

  return (
    <Switch>
      <Match
        when={displayOption() === "hide" ||
          (displayOption() === "switch" &&
            !props.ctx.miscStore.shouldShowRater())}
      >
        <></>
      </Match>
      <Match when={styleOption() === "direct"}>
        <MyRating
          displayMode={"inline_compact"}
          noFloat={true}
          prefersFetchingCompleteSubjectVotes={true}
          ctx={props.ctx}
          subjectId={props.subjectId}
          episodeId={props.episodeId}
          isPrimary={props.isPrimary}
        />
      </Match>
      <Match when={styleOption() === "compact"}>
        <MyRatingCompact
          label="我："
          prefersFetchingCompleteSubjectVotes={true}
          ctx={props.ctx}
          subjectId={props.subjectId}
          episodeId={props.episodeId}
          noVisibilityHint={true}
        />
      </Match>
    </Switch>
  );
};
