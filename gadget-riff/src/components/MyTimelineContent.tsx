import {
  type Component,
  createEffect,
  createMemo,
  createSignal,
  For,
  Match,
  on,
  type Setter,
  Show,
  Switch,
} from "solid-js";
import { customElement, noShadowDOM } from "solid-element";
import { createVisibilityObserver } from "@solid-primitives/intersection-observer";

import {
  type EpisodeId,
  EPRT_ID_HTML_SAFE,
  makeCustomElementTagName,
  type Score,
  type SubjectId,
} from "../definitions";
import { PleaseDoAuth, PleaseDoRefetch } from "./PleaseDoAuth";
import type { GetUserTimeLineItemsResponseData } from "../shared/dto";
import { ErrorMessageWithRetry } from "./errors";
import { readonlyPageData } from "../stores/readonly-page-data";
import { SmallStars } from "./SmallStars";
import { L } from "./utils";
import {
  formatDatesDifferences,
  formatDateToTime,
} from "../utils/date-formatting";
import type { SubjectCacheEntry } from "../clients/bangumi-client";
import { Tooltip } from "./Tooltip";
import { EprtLinkSmallGrey } from "./EprtLink";
import type { Context } from "../context";

const TAG_NAME = makeCustomElementTagName("my-timeline-content");

export function createMyTimelineContentInstance(ctx: Context) {
  registerMyTimelineContent(ctx);
  const el = document.createElement(TAG_NAME);
  return { element: el };
}

let elementConstructor: CustomElementConstructor | null = null;

function registerMyTimelineContent(ctx: Context) {
  elementConstructor ??= customElement(TAG_NAME, {}, () => {
    noShadowDOM();

    return <MyTimelineContent ctx={ctx} />;
  });
}

const MyTimelineContent: Component<{
  ctx: Context;
}> = (props) => {
  type State =
    | ["idle"]
    | ["loading"]
    | ["error", string]
    | ["loaded", GetUserTimeLineItemsResponseData, { isFilled: boolean }];
  type StateUnion = {
    idle?: true;
    loading?: true;
    error?: string;
    loaded?: GetUserTimeLineItemsResponseData;
  };
  const [state, setState] = createSignal<State>(["idle"]);
  const statusUnion = createMemo((): StateUnion => {
    const s = state();
    switch (s[0]) {
      case "idle":
        return { idle: true };
      case "loading":
        return { loading: true };
      case "error":
        return { error: s[1] };
      case "loaded":
        return { loaded: s[1] };
    }
  });

  const [currentPageNumber, setCurrentPageNumber] = createSignal(1);

  createEffect(on(currentPageNumber, (currentPageNumber) => {
    if (props.ctx.authStore.statusUnion().withSessionToken) {
      loadPage(currentPageNumber);
    }
  }));

  async function loadPage(pageNumber: number) {
    setState(["loading"]);

    const resp = await props.ctx.appClient.getMyTimelineItems({ pageNumber });

    switch (resp[0]) {
      case "ok": {
        setState(["loaded", resp[1], {
          isFilled: resp[1].items.length ===
            props.ctx.appClient.TIMELINE_ITEMS_PER_PAGE,
        }]);
        break;
      }
      case "error": {
        setState(["error", resp[2]]);
        break;
      }
      case "auth_required": {
        props.ctx.authStore.clear();
        setState(["idle"]);
        break;
      }
    }
  }

  const hasPreviousPage = () => currentPageNumber() > 1;
  const hasNextPage = createMemo(() => {
    if (currentPageNumber() >= 10) return false;
    const s = state();
    if (s[0] !== "loaded") return false;
    return s[2].isFilled;
  });

  function removeTimelineItem(timestampMs: number) {
    const s = state();
    if (s[0] !== "loaded") return;
    setState([
      "loaded",
      {
        ...s[1],
        items: s[1].items.filter((item) => item[0] !== timestampMs),
      },
      s[2],
    ]);
  }

  const [tooltipStuff, setTooltipStuff] = //
    createSignal<TooltipStuff | null>(null);

  return (
    <div>
      <button
        onClick={() =>
          chiiLib.ukagaka.showCustomizePanelWithTab(EPRT_ID_HTML_SAFE)}
      >
        打开设置
      </button>
      <Show
        when={props.ctx.authStore.statusUnion().withSessionToken}
        fallback={<PleaseDoAuth ctx={props.ctx} />}
      >
        <Switch>
          <Match when={statusUnion().idle}>
            <PleaseDoRefetch onRequestRefetch={() => loadPage(1)} />
          </Match>
          <Match when={statusUnion().loading}>
            <Loading />
          </Match>
          <Match when={statusUnion().error}>
            {(message) => (
              <ErrorMessageWithRetry
                message={message()}
                onRetry={() => loadPage(currentPageNumber())}
              />
            )}
          </Match>
          <Match when={statusUnion().loaded}>
            {(data) => {
              // oxlint-disable-next-line no-unassigned-vars
              let ref!: HTMLDivElement;
              const refRect = () => ref.getBoundingClientRect();

              return (
                <div ref={ref} id="timeline" style="position: relative;">
                  <TimelineItems
                    ctx={props.ctx}
                    data={data()}
                    removeTimelineItem={removeTimelineItem}
                    setTooltipStuff={setTooltipStuff}
                  />
                  <Pager
                    currentPageNumber={currentPageNumber()}
                    setCurrentPageNumber={setCurrentPageNumber}
                    hasPreviousPage={hasPreviousPage()}
                    hasNextPage={hasNextPage()}
                  />
                  <Show when={tooltipStuff()}>
                    {(tooltipStuff) => (
                      <Tooltip
                        style={{ transform: "translate(-50%, -100%)" }}
                        left={tooltipStuff().left - refRect().left}
                        top={tooltipStuff().top - refRect().top}
                      >
                        {tooltipStuff().text}
                      </Tooltip>
                    )}
                  </Show>
                </div>
              );
            }}
          </Match>
        </Switch>
      </Show>
    </div>
  );
};

interface TooltipStuff {
  left: number;
  top: number;
  text: string;
}

type ItemUser = {
  textId: string;
  name: string;
  smallAvatarUrl: string;
  shouldShowAvatar: boolean;
};
type ItemUnion = {
  timestampMs: number;
  timestamp: Date;
  rate_episode?: {
    subjectId: SubjectId;
    episodeId: EpisodeId;
    score: Score | null;
  };
};

const TimelineItems: Component<{
  ctx: Context;
  data: GetUserTimeLineItemsResponseData;
  removeTimelineItem: (timestampMs: number) => void;
  setTooltipStuff: Setter<TooltipStuff | null>;
}> = (props) => {
  // XXX: 非 reactive。
  const now = new Date();

  const itemsByDateHeader = createMemo(() => {
    const episodeToSubjectMap: Record<EpisodeId, SubjectId> = {};
    for (
      const [subjectId, { episode_ids }] of Object.entries(props.data.subjects)
    ) {
      for (const episodeId of episode_ids) {
        episodeToSubjectMap[episodeId as EpisodeId] = Number(
          subjectId,
        ) as SubjectId;
      }
    }

    const groups: {
      header: string;
      items: (ItemUnion & { user: ItemUser })[];
    }[] = [];

    const userSelf_ = readonlyPageData.getClaimedUserTextIdAndName();
    if (!userSelf_) throw new Error("unreachable!");
    const userSelf = {
      ...userSelf_,
      smallAvatarUrl: `https://api.bgm.tv/v0/users/${
        encodeURIComponent(userSelf_.textId)
      }/avatar?type=small`,
    };

    for (const item of props.data.items) {
      const date = new Date(item[0]);
      const dateStr = date.toLocaleDateString();
      if (groups.at(-1)?.header !== dateStr) {
        groups.push({ header: dateStr, items: [] });
      }
      const isFirst = !groups.at(-1)!.items.length;

      const itemUnion = ((): ItemUnion | null => {
        switch (item[1]) {
          case "rate-episode": {
            const episodeId = item[2].episode_id as EpisodeId;
            const subjectId = episodeToSubjectMap[episodeId];
            if (!subjectId) throw new Error("unreachable!");
            return {
              timestampMs: item[0],
              timestamp: date,
              rate_episode: {
                subjectId,
                episodeId,
                score: item[2].score as Score | null,
              },
            };
          }
          default:
            return null;
        }
      })();
      if (!itemUnion) continue;

      groups.at(-1)!.items.push({
        ...itemUnion,
        user: { ...userSelf, shouldShowAvatar: isFirst },
      });
    }

    return groups;
  });

  const useVisibilityObserver = createVisibilityObserver();

  async function deleteTimelineItem(timestampMs: number) {
    const result = await props.ctx.appClient
      .deleteMyTimelineItem({ timestampMs });
    switch (result[0]) {
      case "ok":
        props.removeTimelineItem(timestampMs);
        break;
      case "error":
        // TODO: 也许应该以更好的方式呈现错误？
        alert("删除单集评分时间线项目失败：" + result[2]);
        break;
      case "auth_required":
        // TODO: 同上。
        alert("认证失败。");
        props.ctx.appClient.authStore.clear();
        break;
      default:
        result satisfies never;
    }
  }

  return (
    <div id="timeline" style="position: relative;">
      <For each={itemsByDateHeader()}>
        {(group) => (
          <>
            <h4 class="Header">{group.header}</h4>
            <ul>
              <For each={group.items}>
                {(item) => (
                  <TimelineItem
                    ctx={props.ctx}
                    item={item}
                    now={now}
                    deleteTimelineItem={deleteTimelineItem}
                    useVisibilityObserver={useVisibilityObserver}
                    setTooltipStuff={props.setTooltipStuff}
                  />
                )}
              </For>
            </ul>
          </>
        )}
      </For>
    </div>
  );
};

const TimelineItem: Component<{
  ctx: Context;
  item: ItemUnion & { user: ItemUser };
  now: Date;
  deleteTimelineItem: (timestampMs: number) => void;
  useVisibilityObserver: ReturnType<typeof createVisibilityObserver>;
  setTooltipStuff: Setter<TooltipStuff | null>;
}> = (props) => {
  const [isHovering, setIsHovering] = createSignal(false);

  const [subject, setSubject] = createSignal<SubjectCacheEntry | null>(null);
  const [epTitle, setEpTitle] = createSignal<string | null>(null);

  const [visRef, setVisRef] = createSignal<HTMLElement | null>(null);
  const isVisible = props.useVisibilityObserver(visRef);
  createEffect(on(isVisible, (isVisible) => {
    if (isVisible) {
      setVisRef(null);

      const subjectId = (() => {
        if (props.item.rate_episode) {
          return props.item.rate_episode.subjectId;
        }
      })();
      if (subjectId) {
        props.ctx.bgmClient.getSubjectEntry(subjectId).then(setSubject);
      }

      const episodeId = (() => {
        if (props.item.rate_episode) {
          return props.item.rate_episode.episodeId;
        }
      })();
      if (episodeId) {
        props.ctx.bgmClient.getEpisodeTitle(episodeId).then(setEpTitle);
      }
    }
  }));

  return (
    <li
      ref={setVisRef}
      class="clearit tml_item"
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      <Show when={props.item.user.shouldShowAvatar}>
        <Avatar user={props.item.user} />
      </Show>
      <Switch>
        <Match when={props.item.rate_episode}>
          {(data) => (
            <TimelineItemRateEpisode
              timestamp={props.item.timestamp}
              user={props.item.user}
              data={data()}
              now={props.now}
              episodeTitle={epTitle()}
              subject={subject()}
              setTooltipStuff={props.setTooltipStuff}
            />
          )}
        </Match>
      </Switch>
      <a
        title="删除这条时间线"
        class="tml_del"
        style={{
          display: isHovering() ? "block" : "none",
          cursor: "pointer",
        }}
        onClick={() => props.deleteTimelineItem(props.item.timestampMs)}
      >
        del
      </a>
    </li>
  );
};

const TimelineItemRateEpisode: Component<{
  timestamp: Date;
  user: ItemUser;
  data: NonNullable<ItemUnion["rate_episode"]>;
  now: Date;
  episodeTitle: string | null;
  subject: SubjectCacheEntry | null;
  setTooltipStuff: Setter<TooltipStuff | null>;
}> = (props) => {
  return (
    <span class="info clearit">
      <L href={`/user/${props.user.textId}`}>{props.user.name}</L> 为剧集{" "}
      <Show
        when={props.episodeTitle}
        fallback={
          <>
            <L href={`/ep/${props.data.episodeId}`}>{props.data.episodeId}</L>
            <span style={{ color: "gray" }}>（加载中…）</span>
          </>
        }
      >
        {(epTitle) => <L href={`/ep/${props.data.episodeId}`}>{epTitle()}</L>}
      </Show>{" "}
      <Show when={props.data.score !== null} fallback={"取消评分"}>
        评分 <SmallStars score={props.data.score!} shouldShowNumber={false} />
      </Show>
      <div class="card card_tiny">
        <div class="container">
          <a href={`/subject/${props.data.subjectId}`}>
            <span class="cover">
              <img
                loading="lazy"
                src={`https://api.bgm.tv/v0/subjects/${props.data.subjectId}/image?type=grid`}
              />
            </span>
          </a>
          <Show
            when={props.subject}
            fallback={
              <div class="inner">
                <p class="title">
                  <a href={`/subject/${props.data.subjectId}`}>
                    <span style={{ color: "gray" }}>（加载中…）</span>
                  </a>
                </p>
              </div>
            }
          >
            {(subject) => (
              <div class="inner">
                <p class="title">
                  <a href={`/subject/${props.data.subjectId}`}>
                    {subject().nameCn ?? subject().name}
                  </a>
                </p>
                <p class="info tip">
                  <Show when={subject().eps !== null}>
                    {` ${subject().eps}话`}
                  </Show>
                </p>
              </div>
            )}
          </Show>
        </div>
      </div>
      <div class="post_actions date">
        <span
          class="titleTip"
          onMouseOver={(ev) => {
            const el = ev.currentTarget;
            const rect = el.getBoundingClientRect();
            props.setTooltipStuff({
              left: rect.left + rect.width / 2,
              top: rect.top,
              text: formatDateToTime(props.timestamp),
            });
          }}
          onMouseOut={() => props.setTooltipStuff(null)}
        >
          {formatDatesDifferences(props.timestamp, props.now)}
        </span>
        ·{" "}
        <small class="grey">
          <EprtLinkSmallGrey />
        </small>
      </div>
    </span>
  );
};

const Avatar: Component<
  { user: { textId: string; name: string; smallAvatarUrl: string } }
> = (props) => {
  return (
    <span class="avatar">
      <a href={`/user/${props.user.textId}`} class="avatar">
        <span
          class="avatarNeue avatarReSize40 ll"
          style={{ "background-image": `url(${props.user.smallAvatarUrl})` }}
        />
      </a>
    </span>
  );
};

const Loading: Component<{}> = () => {
  return (
    <div class="loading">
      <img src="/img/loadingAnimation.gif" />
    </div>
  );
};

const Pager: Component<{
  currentPageNumber: number;
  setCurrentPageNumber: (pageNumber: number) => void;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
}> = (props) => {
  return (
    <div id="tmlPager">
      <div class="page_inner">
        <Show when={props.hasPreviousPage}>
          <a
            class="p"
            style={{
              cursor: "pointer", // 不知为何，不指定光标就是 `I`。
            }}
            onClick={() =>
              props.setCurrentPageNumber(props.currentPageNumber - 1)}
          >
            ‹‹上一页
          </a>
        </Show>
        <Show
          when={props.hasNextPage}
          fallback={<span>没有下一页了…</span>}
        >
          <a
            class="p"
            style={{
              cursor: "pointer", // 不知为何，不指定光标就是 `I`。
            }}
            onClick={() =>
              props.setCurrentPageNumber(props.currentPageNumber + 1)}
          >
            下一页››
          </a>
        </Show>
      </div>
    </div>
  );
};
