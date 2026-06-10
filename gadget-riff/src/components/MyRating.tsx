import {
  type Component,
  createEffect,
  createMemo,
  createSignal,
  Index,
  Match,
  on,
  Show,
  Switch,
} from "solid-js";
import { customElement, noShadowDOM } from "solid-element";

import {
  describeScore,
  type EpisodeId,
  makeCustomElementTagName,
  type Score,
  scores,
  type SubjectId,
} from "../definitions";
import { PleaseDoAuth, PleaseDoRefetch } from "./PleaseDoAuth";
import { cls } from "../utils/cls";
import { ErrorMessageWithRetry } from "./errors";
import { Tooltip } from "./Tooltip";
import { readonlyPageData } from "../stores/readonly-page-data";
import type { Context } from "../context";

const TAG_NAME = makeCustomElementTagName("my-rating");

type DisplayMode = "normal" | "inline_compact";

export function createMyRatingInstance(ctx: Context, opts: {
  displayMode?: DisplayMode;
  noFloat?: boolean;

  shouldEnableVisibilityControl?: boolean;
  prefersFetchingCompleteSubjectVotes: boolean;

  subjectId: SubjectId;
  episodeId: EpisodeId;
  isPrimary?: boolean;
}) {
  registerMyRating(ctx, {
    shouldEnableVisibilityControl: opts.shouldEnableVisibilityControl ?? false,
    prefersFetchingCompleteSubjectVotes:
      opts.prefersFetchingCompleteSubjectVotes,
  });
  const el = document.createElement(TAG_NAME);
  if (opts.displayMode) {
    el.setAttribute("display-mode", opts.displayMode);
  }
  if (opts.noFloat) {
    el.setAttribute("no-float", "1");
  }
  el.setAttribute("subject-id", String(opts.subjectId));
  el.setAttribute("episode-id", String(opts.episodeId));
  if (opts.isPrimary) {
    el.setAttribute("is-primary", "1");
  }

  return { element: el };
}

let elementConstructor: CustomElementConstructor | null = null;

function registerMyRating(ctx: Context, opts: {
  shouldEnableVisibilityControl: boolean;
  prefersFetchingCompleteSubjectVotes: boolean;
}) {
  elementConstructor ??= customElement(TAG_NAME, {
    displayMode: null,
    noFloat: null,
    episodeId: null,
    subjectId: null,
    isPrimary: null,
  }, (props) => {
    noShadowDOM();

    return (
      <Show
        when={Number.isInteger(props.subjectId) &&
          Number.isInteger(props.episodeId)}
      >
        <MyRating
          displayMode={props.displayMode ?? "normal"}
          noFloat={!!props.noFloat}
          shouldEnableVisibilityControl={opts.shouldEnableVisibilityControl}
          prefersFetchingCompleteSubjectVotes={opts
            .prefersFetchingCompleteSubjectVotes}
          ctx={ctx}
          subjectId={props.subjectId!}
          episodeId={props.episodeId!}
          isPrimary={!!props.isPrimary}
        />
      </Show>
    );
  });
}

type Status = {
  normal?: Data;
  processing?: Data;
  loading?: true;
  error?: string;
  requiring_auth?: true;
  requiring_fetch?: true;
};
interface Data {
  ratedScore: Score | null;
  visibility: boolean | null;
}

function convertVisibility(
  vis: { isVisible: boolean } | "unknown" | undefined,
): boolean | null {
  if (vis === "unknown" || vis === undefined) return null;
  return vis.isVisible;
}

export const MyRating: Component<{
  displayMode: DisplayMode;
  noFloat: boolean;

  /**
   * TODO: 未来应该常为 `true`。（即应去掉这个选项。）
   *
   * 现在需要这个是因为只有章节的 API 的返回内容包含了可见性的信息，未来所有 API
   * 都应该包含此信息。
   */
  shouldEnableVisibilityControl?: boolean;
  prefersFetchingCompleteSubjectVotes: boolean;

  ctx: Context;

  subjectId: SubjectId;
  episodeId: EpisodeId;
  isPrimary: boolean;
}> = (props) => {
  const [status, setStatus] = createSignal(((): Status => {
    if (props.ctx.authStore.statusUnion().withSessionToken) {
      return { loading: true };
    } else {
      return { requiring_auth: true };
    }
  })());
  const [claimedScore, setClaimedScore] = createSignal<Score | null>(null);

  function queryEpisodeDataTracked(opts: { shouldRefetch: boolean }) {
    return props.ctx.scoreStore.queryEpisodeDataTracked(
      props.subjectId,
      props.episodeId,
      {
        prefersFetchingCompleteSubjectVotes:
          props.prefersFetchingCompleteSubjectVotes,
        shouldRefetch: opts.shouldRefetch,
      },
    );
  }
  function refetchEpisodeData() {
    queryEpisodeDataTracked({ shouldRefetch: true });
  }

  const epDataResp = queryEpisodeDataTracked({ shouldRefetch: false });
  createEffect(() => {
    const resp = epDataResp();
    switch (resp[0]) {
      case "ok": {
        const epData = resp[1];
        if (epData.myRating) {
          setStatus({
            normal: {
              ratedScore: epData.myRating.score ?? null,
              visibility: convertVisibility(epData.myRating.visibility),
            },
          });
        } else {
          setStatus(
            props.ctx.authStore.statusUnion().withSessionToken
              ? { requiring_fetch: true }
              : { requiring_auth: true },
          );
          const score = Object.entries(epData.publicVotersByScore ?? [])
            .find(([_, voters]) =>
              voters.includes(readonlyPageData.claimedUserId!)
            )?.[0];
          setClaimedScore(score ? Number(score) as Score : null);
        }
        break;
      }
      case "error": {
        setStatus({ error: resp[2] });
        setClaimedScore(null);
        break;
      }
      case "loading": {
        setStatus({ loading: true });
        setClaimedScore(null);
        break;
      }
      case "processing": {
        setStatus({
          processing: {
            ratedScore: resp[1].oldData?.myRating?.score ?? null,
            visibility: convertVisibility(
              resp[1].oldData?.myRating?.visibility,
            ),
          },
        });
        setClaimedScore(null);
        break;
      }
      default:
        resp satisfies never;
    }
  });
  createEffect(on([props.ctx.authStore.statusUnion], ([statusUnion]) => {
    if (statusUnion.withSessionToken) {
      setStatus({ requiring_fetch: true });
    } else {
      setStatus({ requiring_auth: true });
    }
    setClaimedScore(null);
  }, { defer: true }));

  return (
    <Show
      when={props.isPrimary ||
        ((status) =>
          !status.loading && !status.requiring_auth && !status.requiring_fetch)(
            status(),
          )}
    >
      <InnerMyRating
        displayMode={props.displayMode}
        noFloat={props.noFloat}
        shouldEnableVisibilityControl={props.shouldEnableVisibilityControl ??
          false}
        refetchEpisodeData={refetchEpisodeData}
        ctx={props.ctx}
        subjectId={props.subjectId}
        episodeId={props.episodeId}
        status={status()}
        claimedScore={claimedScore()}
      />
    </Show>
  );
};

export const InnerMyRating: Component<{
  displayMode: DisplayMode;
  noFloat: boolean;

  shouldEnableVisibilityControl: boolean;

  refetchEpisodeData: () => void;

  ctx: Context;

  subjectId: SubjectId;
  episodeId: EpisodeId;
  status: Status;
  claimedScore: Score | null;
}> = (props) => {
  const [alarmScore, setAlarmScore] = createSignal<Score | null>(null);

  const data = createMemo(() => {
    if (props.status.normal) return props.status.normal;
    if (props.status.processing) return props.status.processing;
    return null;
  });

  const knownIsVisible = createMemo((): boolean | null => {
    if (!props.shouldEnableVisibilityControl) return null;
    return data()?.visibility ?? null;
  });

  function updateMyScore(score: Score | null) {
    props.ctx.scoreStore.updateMyRating(
      props.subjectId,
      props.episodeId,
      { score },
    );
  }

  function updateMyVisibility(isVisible: boolean) {
    props.ctx.scoreStore.updateMyRating(
      props.subjectId,
      props.episodeId,
      { visibility: { isVisible } },
    );
  }

  return (
    <div
      style={{
        display: props.displayMode === "normal" ? "flex" : "inline-flex",
        ...(props.noFloat ? {} : { float: "right" }),
        "flex-direction": "column",
      }}
    >
      <Show when={props.displayMode === "normal"}>
        <div
          style={{
            display: "flex",
            "justify-content": "space-between",
            // 防止 `VisibilityControl` 与 `Stars` 离得太近。
            "padding-bottom": "0.5rem",
          }}
        >
          <Header alarmScore={alarmScore()} />
          <Show when={knownIsVisible() !== null}>
            <VisibilityControl
              isVisible={knownIsVisible()!}
              setIsVisible={updateMyVisibility}
            />
          </Show>
        </div>
      </Show>
      <Switch>
        <Match when={props.status.normal}>
          {(data) => (
            <div style={{ display: "flex" }}>
              <Stars
                ratedScore={data().ratedScore}
                onRateEpisode={updateMyScore}
                setAlarmScore={setAlarmScore}
              />
              <Show
                when={props.displayMode === "inline_compact" &&
                  knownIsVisible() !== null}
              >
                <VisibilityControl
                  isVisible={knownIsVisible()!}
                  setIsVisible={updateMyVisibility}
                />
              </Show>
            </div>
          )}
        </Match>
        <Match when={props.status.processing}>
          {(data) => (
            <>
              <div style={{ display: "flex" }}>
                <Stars ratedScore={data().ratedScore} />
                <Show
                  when={props.displayMode === "inline_compact" &&
                    knownIsVisible() !== null}
                >
                  <VisibilityControl isVisible={knownIsVisible()!} />
                </Show>
              </div>
              <div style={{ color: "gray" }}>处理中…</div>
            </>
          )}
        </Match>
        <Match when={props.status.loading}>
          <div style={{ color: "gray" }}>加载中…</div>
        </Match>
        <Match when={props.status.error}>
          <ErrorMessageWithRetry
            message={props.status.error!}
            onRetry={props.refetchEpisodeData}
          />
        </Match>
        <Match when={props.status.requiring_auth}>
          <Show when={props.claimedScore !== null}>
            <Stars ratedScore={props.claimedScore} />
          </Show>
          <PleaseDoAuth ctx={props.ctx} shorter />
        </Match>
        <Match when={props.status.requiring_fetch}>
          <Show when={props.claimedScore !== null}>
            <Stars ratedScore={props.claimedScore} />
          </Show>
          <PleaseDoRefetch
            onRequestRefetch={props.refetchEpisodeData}
          />
        </Match>
      </Switch>
    </div>
  );
};

const Header: Component<{ alarmScore?: Score | null }> = (props) => {
  const alarmText = createMemo(() =>
    props.alarmScore && describeScore(props.alarmScore)
  );

  return (
    <p style="font-size: 12px;">
      我的评价:{" "}
      <Show when={alarmText()}>
        {(alarmText) => <span class="alarm">{alarmText()}</span>}
      </Show>
    </p>
  );
};

const VisibilityControl: Component<{
  isVisible: boolean;
  setIsVisible?: (value: boolean) => void;
}> = (props) => {
  return (
    <select
      value={props.isVisible ? "public" : "private"}
      onInput={(e) => props.setIsVisible?.(e.currentTarget.value === "public")}
    >
      <option value="public">公开</option>
      <option value="private">不公开</option>
    </select>
  );
};

const Stars: Component<{
  ratedScore: Score | null;
  onRateEpisode?: (score: Score | null) => void;
  setAlarmScore?: (score: Score | null) => void;
}> = (props) => {
  // oxlint-disable-next-line no-unassigned-vars
  let ref!: HTMLDivElement;

  const [hoveredScore, setHoveredScore] = //
    createSignal<Score | null | "cancel">(null);
  createEffect(() => {
    const s = hoveredScore();
    if (s === "cancel") {
      // 与 bangumi 自身的行为保持一致，即：悬浮在取消图标上时，显示原先打的分的
      // 评价文本。
      props.setAlarmScore?.(props.ratedScore);
    } else {
      props.setAlarmScore?.(s ?? props.ratedScore);
    }
  });
  const scoreToHighlight = createMemo((): Score | null => {
    const score = hoveredScore();
    if (score === "cancel") return null;
    return score ?? props.ratedScore;
  });

  const [extremeStarLeft, setExtremeStarLeft] = //
    createSignal<number | null>(null);

  return (
    <div
      ref={ref}
      style={{
        position: "relative",
        ...props.onRateEpisode ? undefined : { cursor: "not-allowed" },
      }}
    >
      <div
        style={props.onRateEpisode
          ? undefined
          : { filter: "grayscale(100%)", "pointer-events": "none" }}
      >
        <div
          class="rating-cancel"
          onMouseOver={() => setHoveredScore("cancel")}
          onMouseOut={() => setHoveredScore(null)}
          onClick={() => props.onRateEpisode?.(null)}
        >
          <a title="Cancel Rating" />
        </div>
        <Index each={scores}>
          {(score) => (
            <div
              class={cls(
                "star-rating",
                (() => {
                  const s = scoreToHighlight();
                  if (s === null || score() > s) return;
                  return hoveredScore() === null
                    ? "star-rating-on"
                    : "star-rating-hover";
                })(),
              )}
              onMouseOver={(ev) => {
                setHoveredScore(score());
                if (score() === 1 || score() === 10) {
                  const rect = ev.currentTarget.getBoundingClientRect();
                  setExtremeStarLeft(rect.left + rect.width / 2);
                }
              }}
              onMouseOut={() => {
                setHoveredScore(null);
                setExtremeStarLeft(null);
              }}
              onClick={() => props.onRateEpisode?.(score())}
            >
              <a title={describeScoreEx(score())}>{score()}</a>
            </div>
          )}
        </Index>
      </div>
      <Show when={extremeStarLeft()}>
        {(left) => (
          <Tooltip
            pos="bottom"
            style={{ transform: "translateX(-50%)" }}
            left={left() - ref.getBoundingClientRect().left}
            top={17}
          >
            请谨慎评价
          </Tooltip>
        )}
      </Show>
    </div>
  );
};

function describeScoreEx(score: Score) {
  let description = `${describeScore(score)} ${score}`;
  if (score === 1 || score === 10) {
    description += " (请谨慎评价) ";
  }

  return description;
}
