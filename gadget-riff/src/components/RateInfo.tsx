import { customElement, noShadowDOM } from "solid-element";
import {
  type Component,
  createEffect,
  createMemo,
  createSignal,
  Match,
  Show,
  Switch,
} from "solid-js";

import {
  type EpisodeId,
  type EpisodeVotes,
  makeCustomElementTagName,
  type SubjectId,
} from "../definitions";
import type { AppClient } from "../clients/app-client";
import type { ScoreStore } from "../stores/temporary-global-stores/score-store";
import { SmallStars } from "./SmallStars";
import { ErrorMessageWithRetry } from "./errors";
import type { RevealedEpisodesStore } from "../stores/temporary-global-stores/revealed-episodes-store";
import * as epDataHelpers from "../utils/episode-data-helpers";
import type { SettingsStore } from "../stores/persistent-stores/settings-store";

const TAG_NAME = makeCustomElementTagName("rate-info");

type DisplayMode = "normal" | "inline_compact";

export function createRateInfoInstance(opts: {
  displayMode?: DisplayMode;

  settingsStore: SettingsStore;
  appClient: AppClient;
  scoreStore: ScoreStore;
  revealedEpisodesStore: RevealedEpisodesStore;

  subjectId: SubjectId;
  episodeId: EpisodeId;
  isMusic?: boolean;
  isPrimary?: boolean;
  revealAllButton?: boolean;
}) {
  registerRateInfo({
    settingsStore: opts.settingsStore,
    appClient: opts.appClient,
    scoreStore: opts.scoreStore,
    revealedEpisodesStore: opts.revealedEpisodesStore,
  });
  const el = document.createElement(TAG_NAME);
  if (opts.displayMode) {
    el.setAttribute("display-mode", opts.displayMode);
  }
  el.setAttribute("subject-id", String(opts.subjectId));
  el.setAttribute("episode-id", String(opts.episodeId));
  if (opts.isMusic) {
    el.setAttribute("is-music", "1");
  }
  if (opts.isPrimary) {
    el.setAttribute("is-primary", "1");
  }
  if (opts.revealAllButton) {
    el.setAttribute("reveal-all-button", "1");
  }

  return { element: el };
}

let elementConstructor: CustomElementConstructor | null = null;

function registerRateInfo(opts: {
  settingsStore: SettingsStore;
  appClient: AppClient;
  scoreStore: ScoreStore;
  revealedEpisodesStore: RevealedEpisodesStore;
}) {
  elementConstructor ??= customElement(TAG_NAME, {
    displayMode: null,
    episodeId: null,
    subjectId: null,
    isMusic: null,
    isPrimary: null,
    revealAllButton: null,
  }, (props) => {
    noShadowDOM();

    return (
      <Show
        when={Number.isInteger(props.subjectId) &&
          Number.isInteger(props.episodeId)}
      >
        <RateInfo
          displayMode={props.displayMode ?? "normal"}
          settingsStore={opts.settingsStore}
          appClient={opts.appClient}
          scoreStore={opts.scoreStore}
          revealedEpisodesStore={opts.revealedEpisodesStore}
          subjectId={props.subjectId!}
          episodeId={props.episodeId!}
          isMusic={!!props.isMusic}
          isPrimary={!!props.isPrimary}
          revealAllButton={!!props.revealAllButton}
        />
      </Show>
    );
  });
}

const RateInfo: Component<{
  displayMode: DisplayMode;

  settingsStore: SettingsStore;
  appClient: AppClient;
  scoreStore: ScoreStore;
  revealedEpisodesStore: RevealedEpisodesStore;

  subjectId: SubjectId;
  episodeId: EpisodeId;
  isMusic: boolean;
  isPrimary: boolean;
  revealAllButton: boolean;
}> = (props) => {
  function queryEpisodeDataTracked(opts: { shouldRefetch: boolean }) {
    return props.scoreStore.queryEpisodeDataTracked(
      props.subjectId,
      props.episodeId,
      {
        prefersFetchingCompleteSubjectVotes: true,
        shouldRefetch: opts.shouldRefetch,
      },
    );
  }
  function refetchEpisodeData() {
    queryEpisodeDataTracked({ shouldRefetch: true });
  }

  const [shouldHide, setShouldHide] = createSignal(false);
  if (props.isMusic) {
    const antiSpoilerOption = props.settingsStore
      .getAntiSpoilerForMusicSignal();
    createEffect(() => {
      setShouldHide(antiSpoilerOption() === "not-showing-at-all");
    });
  }

  const epDataResp = queryEpisodeDataTracked({ shouldRefetch: false });
  const votesOk = createMemo((): EpisodeVotes | null => {
    const resp = epDataResp();
    return resp[0] === "ok" ? resp[1].votes : null;
  });
  const errorMessage = createMemo(() => {
    const resp = epDataResp();
    return resp[0] === "error" ? resp[2] : null;
  });
  const isRevealedSignal = props.revealedEpisodesStore
    .getIsRevealedAccessor(props.episodeId, { isMusic: props.isMusic });

  return ( // `div` 用于确保换行。
    <div
      style={{
        display: props.displayMode === "inline_compact"
          ? "inline-block"
          : "block",
      }}
    >
      <Switch>
        <Match when={votesOk()}>
          {(votes) => (
            <Show when={!shouldHide()}>
              <RateInfoInner
                displayMode={props.displayMode}
                revealAllButton={props.revealAllButton}
                votes={votes()}
                isRevealed={isRevealedSignal()}
                reveal={() =>
                  props.revealedEpisodesStore.reveal(props.episodeId)}
                revealAll={() => props.revealedEpisodesStore.revealAll()}
              />
            </Show>
          )}
        </Match>
        <Match when={epDataResp()[0] === "loading"}>
          <Show when={props.isPrimary}>
            <div style="color: grey">
              单集评分加载中…
            </div>
          </Show>
        </Match>
        <Match when={errorMessage()}>
          {(message) => (
            <ErrorMessageWithRetry
              message={message()}
              onRetry={refetchEpisodeData}
            />
          )}
        </Match>
      </Switch>
    </div>
  );
};

const RateInfoInner: Component<{
  displayMode: DisplayMode;
  revealAllButton: boolean;
  votes: EpisodeVotes;
  isRevealed: boolean;
  reveal: () => void;
  revealAll: () => void;
}> = (props) => {
  const { totalVotes, averageScore } = epDataHelpers
    .createComputed(() => props.votes);

  createEffect(() => {
    if (totalVotes() === 0) {
      props.reveal();
    }
  });

  const shouldHideStars = () =>
    props.displayMode === "inline_compact" && totalVotes() === 0;

  return (
    <Show
      when={props.isRevealed}
      fallback={
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button type="button" onClick={() => props.reveal()}>
            揭开评分
          </button>
          <Show when={props.revealAllButton}>
            <button type="button" onClick={() => props.revealAll()}>
              揭开全部评分
            </button>
          </Show>
        </div>
      }
    >
      <div class="rateInfo">
        <Show when={!shouldHideStars()}>
          <SmallStars score={averageScore()} shouldShowNumber={true} />
          {" "}
        </Show>
        <span class="tip_j">({totalVotes()}人评分)</span>
      </div>
    </Show>
  );
};
