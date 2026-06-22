import {
  type Component,
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
} from "solid-js";

import type { Context } from "../../../context";
import {
  type EpisodeId,
  type EpisodeVotes,
  scores,
  type SubjectId,
} from "../../../definitions";
import * as epDataHelpers from "../../../utils/episode-data-helpers";

export interface DataPoint {
  episodeId: EpisodeId;
  date: `${number}-${number}-${number}`; // YYYY-MM-DD
}

const CHART_HEIGHT = 360;
const PADDING_LEFT = 44;
const PADDING_RIGHT = 16;
const PADDING_TOP = 16;
const PADDING_BOTTOM = 28;
const Y_MIN = 0;
const Y_MAX = 10;
const Y_TICK_STEP = 1;
const MIN_ZOOM = 1; // 全部剧集
const MAX_ZOOM = 32;

function parseDate(s: `${number}-${number}-${number}`): number {
  const [y, m, d] = s.split("-").map(Number);
  // 使用 UTC 时间戳以避免时区偏移影响排序与定位
  return Date.UTC(y, m - 1, d);
}

function isDarkMode(): boolean {
  return document.documentElement.dataset.theme === "dark";
}

function averageScore(votes: EpisodeVotes): number | null {
  let total = 0;
  let sum = 0;
  for (const score of scores) {
    const v = votes[score] ?? 0;
    if (v) {
      total += v;
      sum += score * v;
    }
  }
  if (total === 0) return null;
  return sum / total;
}

function totalVotes(votes: EpisodeVotes): number {
  let total = 0;
  for (const score of scores) {
    total += votes[score] ?? 0;
  }
  return total;
}

interface EpisodeInfo {
  episodeId: EpisodeId;
  date: `${number}-${number}-${number}`;
  timestamp: number;
  overallRating: number | null;
  overallVotes: number;
  myRating: number | null;
  title: string | null;
}

export const SubjectEpisodeRatingsLineChart: Component<{
  ctx: Context;
  subjectId: SubjectId;
  dataPoints: DataPoint[];
}> = (props) => {
  const [containerWidth, setContainerWidth] = createSignal(0);
  const [zoom, setZoom] = createSignal(1);
  const [panOffset, setPanOffset] = createSignal(0); // 像素偏移（向右为正）
  const [hoverIndex, setHoverIndex] = createSignal<number | null>(null);
  const [dark, setDark] = createSignal(isDarkMode());

  let containerRef: HTMLDivElement | null = null;

  // 监听容器宽度变化
  let resizeObserver: ResizeObserver | null = null;
  const measure = () => {
    if (containerRef) {
      setContainerWidth(containerRef.clientWidth);
    }
  };
  // 在 onCleanup 中清理
  onCleanup(() => {
    resizeObserver?.disconnect();
    mo?.disconnect();
  });

  // 监听 data-theme 变化
  let mo: MutationObserver | null = null;

  // 初始化副作用：在 onMount 中执行，此时 ref 已绑定
  onMount(() => {
    measure();
    resizeObserver = new ResizeObserver(measure);
    if (containerRef) resizeObserver.observe(containerRef);

    mo = new MutationObserver(() => setDark(isDarkMode()));
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
  });

  // 为每个 episode 查询评分数据
  const episodeDataAccessors = createMemo(() => {
    return props.dataPoints.map((dp) => {
      const resp = props.ctx.scoreStore.queryEpisodeDataTracked(
        props.subjectId,
        dp.episodeId,
        { prefersFetchingCompleteSubjectVotes: true },
      );
      const data = epDataHelpers.createData(resp);
      return { dp, data };
    });
  });

  // 为每个 episode 异步加载标题
  const [titles, setTitles] = createSignal<Record<number, string>>({});
  createMemo(() => {
    for (const dp of props.dataPoints) {
      const id = dp.episodeId as number;
      if (titles()[id] === undefined) {
        props.ctx.bgmClient.getEpisodeTitle(dp.episodeId).then((title) => {
          setTitles((prev) => ({ ...prev, [id]: title }));
        });
      }
    }
  });

  // 合并后的 episode 信息（按日期排序）
  const episodes = createMemo<EpisodeInfo[]>(() => {
    const accessors = episodeDataAccessors();
    const t = titles();
    return accessors.map(({ dp, data }) => {
      const d = data();
      const votes = d?.votes ?? {};
      const overall = averageScore(votes);
      const tv = totalVotes(votes);
      const my = d?.myRating?.score ?? null;
      return {
        episodeId: dp.episodeId,
        date: dp.date,
        timestamp: parseDate(dp.date),
        overallRating: overall,
        overallVotes: tv,
        myRating: my === null ? null : my,
        title: t[dp.episodeId as number] ?? null,
      };
    }).sort((a, b) => a.timestamp - b.timestamp);
  });

  const innerWidth = () =>
    Math.max(0, containerWidth() - PADDING_LEFT - PADDING_RIGHT);
  const innerHeight = () => CHART_HEIGHT - PADDING_TOP - PADDING_BOTTOM;

  // x 轴域（时间戳范围）
  const xDomain = createMemo(() => {
    const eps = episodes();
    if (eps.length === 0) return { min: 0, max: 1 };
    if (eps.length === 1) {
      const t = eps[0].timestamp;
      return { min: t - 1, max: t + 1 };
    }
    return { min: eps[0].timestamp, max: eps[eps.length - 1].timestamp };
  });

  // 缩放后的可视时间范围（以 panOffset/zoom 控制）
  // zoom=1 时显示全部；zoom>1 时按比例缩小可见时间范围
  const viewDomain = createMemo(() => {
    const dom = xDomain();
    const span = dom.max - dom.min;
    const visibleSpan = span / zoom();
    // panOffset 取值范围 [0, span - visibleSpan]
    const maxPan = Math.max(0, span - visibleSpan);
    const pan = Math.min(Math.max(0, panOffset()), maxPan);
    const min = dom.min + pan;
    const max = min + visibleSpan;
    return { min, max, pan, maxPan };
  });

  const xScale = (timestamp: number): number => {
    const v = viewDomain();
    const span = v.max - v.min || 1;
    const ratio = (timestamp - v.min) / span;
    return PADDING_LEFT + ratio * innerWidth();
  };

  const yScale = (value: number): number => {
    const ratio = (value - Y_MIN) / (Y_MAX - Y_MIN);
    return PADDING_TOP + (1 - ratio) * innerHeight();
  };

  // 生成折线 path，遇到 null 值断开
  const buildLinePath = (
    eps: EpisodeInfo[],
    getValue: (e: EpisodeInfo) => number | null,
  ): string => {
    let path = "";
    let started = false;
    for (const e of eps) {
      const v = getValue(e);
      if (v === null) {
        started = false;
        continue;
      }
      const x = xScale(e.timestamp);
      const y = yScale(v);
      path += `${started ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)} `;
      started = true;
    }
    return path.trim();
  };

  // 拖动平移
  let dragging = false;
  let dragStartX = 0;
  let dragStartPan = 0;

  const onPointerDown = (ev: PointerEvent) => {
    if (ev.pointerType === "touch") return; // 触摸由 pinch 处理
    dragging = true;
    dragStartX = ev.clientX;
    dragStartPan = panOffset();
    (ev.target as Element).setPointerCapture?.(ev.pointerId);
  };

  const onPointerMove = (ev: PointerEvent) => {
    if (dragging) {
      const dx = ev.clientX - dragStartX;
      const dom = xDomain();
      const span = dom.max - dom.min || 1;
      // 将像素位移转换为时间位移
      const visibleSpan = span / zoom();
      const timeDelta = -(dx / innerWidth()) * visibleSpan;
      const newPan = dragStartPan + timeDelta;
      const maxPan = Math.max(0, span - visibleSpan);
      setPanOffset(Math.min(Math.max(0, newPan), maxPan));
    }
  };

  const onPointerUp = (ev: PointerEvent) => {
    dragging = false;
    (ev.target as Element).releasePointerCapture?.(ev.pointerId);
  };

  // 滚轮缩放
  const onWheel = (ev: WheelEvent) => {
    ev.preventDefault();
    if (!containerRef) return;
    const rect = containerRef.getBoundingClientRect();
    const mouseX = ev.clientX - rect.left;
    // 鼠标在内部坐标系的相对位置 [0,1]
    const innerX = Math.min(
      Math.max(0, mouseX - PADDING_LEFT),
      innerWidth(),
    );
    const ratio = innerWidth() > 0 ? innerX / innerWidth() : 0;

    const oldZoom = zoom();
    const factor = ev.deltaY < 0 ? 1.15 : 1 / 1.15;
    const newZoom = Math.min(
      Math.max(MIN_ZOOM, oldZoom * factor),
      MAX_ZOOM,
    );
    if (newZoom === oldZoom) return;

    // 以鼠标位置为锚点缩放
    const dom = xDomain();
    const span = dom.max - dom.min || 1;
    const oldVisible = span / oldZoom;
    const oldPan = panOffset();
    const anchorTime = dom.min + oldPan + ratio * oldVisible;

    const newVisible = span / newZoom;
    let newPan = anchorTime - dom.min - ratio * newVisible;
    const maxPan = Math.max(0, span - newVisible);
    newPan = Math.min(Math.max(0, newPan), maxPan);

    setZoom(newZoom);
    setPanOffset(newPan);
  };

  // 双指捏合缩放
  const pointers = new Map<number, { x: number; y: number }>();
  let pinchStartDist = 0;
  let pinchStartZoom = 1;
  let pinchStartPan = 0;
  let pinchCenterRatio = 0;

  const onTouchPointerDown = (ev: PointerEvent) => {
    if (ev.pointerType !== "touch") return;
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    (ev.target as Element).setPointerCapture?.(ev.pointerId);
    if (pointers.size === 2) {
      const pts = [...pointers.values()];
      pinchStartDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      pinchStartZoom = zoom();
      pinchStartPan = panOffset();
      if (!containerRef) return;
      const rect = containerRef.getBoundingClientRect();
      const cx = (pts[0].x + pts[1].x) / 2 - rect.left;
      const innerX = Math.min(
        Math.max(0, cx - PADDING_LEFT),
        innerWidth(),
      );
      pinchCenterRatio = innerWidth() > 0 ? innerX / innerWidth() : 0;
    }
  };

  const onTouchPointerMove = (ev: PointerEvent) => {
    if (ev.pointerType !== "touch") return;
    if (!pointers.has(ev.pointerId)) return;
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (pointers.size === 2 && pinchStartDist > 0) {
      const pts = [...pointers.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const factor = dist / pinchStartDist;
      const newZoom = Math.min(
        Math.max(MIN_ZOOM, pinchStartZoom * factor),
        MAX_ZOOM,
      );
      const dom = xDomain();
      const span = dom.max - dom.min || 1;
      const oldVisible = span / pinchStartZoom;
      const anchorTime = dom.min + pinchStartPan +
        pinchCenterRatio * oldVisible;
      const newVisible = span / newZoom;
      let newPan = anchorTime - dom.min - pinchCenterRatio * newVisible;
      const maxPan = Math.max(0, span - newVisible);
      newPan = Math.min(Math.max(0, newPan), maxPan);
      setZoom(newZoom);
      setPanOffset(newPan);
    }
  };

  const onTouchPointerUp = (ev: PointerEvent) => {
    if (ev.pointerType !== "touch") return;
    pointers.delete(ev.pointerId);
    (ev.target as Element).releasePointerCapture?.(ev.pointerId);
    if (pointers.size < 2) {
      pinchStartDist = 0;
    }
  };

  // hover 处理：吸附到最近的 episode
  const onHoverMove = (ev: MouseEvent) => {
    if (pointers.size >= 2) return; // 缩放中不处理 hover
    if (!containerRef) return;
    const rect = containerRef.getBoundingClientRect();
    const mouseX = ev.clientX - rect.left;
    const eps = episodes();
    if (eps.length === 0) {
      setHoverIndex(null);
      return;
    }
    let nearest = 0;
    let nearestDist = Infinity;
    for (let i = 0; i < eps.length; i++) {
      const x = xScale(eps[i].timestamp);
      const d = Math.abs(x - mouseX);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = i;
      }
    }
    setHoverIndex(nearest);
  };

  const onHoverLeave = () => {
    setHoverIndex(null);
  };

  const yTicks = Array.from(
    { length: (Y_MAX - Y_MIN) / Y_TICK_STEP + 1 },
    (_, i) => Y_MIN + i * Y_TICK_STEP,
  );

  const colors = createMemo(() => {
    if (dark()) {
      return {
        bg: "#1a1a1a",
        text: "#e0e0e0",
        grid: "#333333",
        axis: "#555555",
        overall: "#4fc3f7",
        my: "#ffb74d",
        guide: "#3a3a3a",
        guideText: "#999999",
        cursor: "#ffffff",
        tooltipBg: "#2a2a2a",
        tooltipBorder: "#555555",
        tooltipText: "#e0e0e0",
      };
    }
    return {
      bg: "#ffffff",
      text: "#333333",
      grid: "#eeeeee",
      axis: "#cccccc",
      overall: "#1976d2",
      my: "#f57c00",
      guide: "#dddddd",
      guideText: "#888888",
      cursor: "#333333",
      tooltipBg: "#ffffff",
      tooltipBorder: "#cccccc",
      tooltipText: "#333333",
    };
  });

  const width = () => Math.max(containerWidth(), 320);

  const tooltipData = createMemo(() => {
    const idx = hoverIndex();
    if (idx === null) return null;
    const eps = episodes();
    if (idx < 0 || idx >= eps.length) return null;
    const e = eps[idx];
    const x = xScale(e.timestamp);
    return { e, x };
  });

  return (
    <div
      ref={(el) => (containerRef = el)}
      style={{
        width: "100%",
        position: "relative",
        "user-select": "none",
        "-webkit-user-select": "none",
        "touch-action": "none",
      }}
    >
      <svg
        width={width()}
        height={CHART_HEIGHT}
        style={{ display: "block", "touch-action": "none" }}
        onPointerDown={(ev) => {
          if (ev.pointerType === "touch") {
            onTouchPointerDown(ev);
          } else {
            onPointerDown(ev);
          }
        }}
        onPointerMove={(ev) => {
          if (ev.pointerType === "touch") {
            onTouchPointerMove(ev);
          } else {
            onPointerMove(ev);
            onHoverMove(ev);
          }
        }}
        onPointerUp={(ev) => {
          if (ev.pointerType === "touch") {
            onTouchPointerUp(ev);
          } else {
            onPointerUp(ev);
          }
        }}
        onPointerLeave={onHoverLeave}
        onMouseMove={onHoverMove}
        onMouseLeave={onHoverLeave}
        onWheel={onWheel}
      >
        {/* 背景 */}
        <rect
          x={0}
          y={0}
          width={width()}
          height={CHART_HEIGHT}
          fill={colors().bg}
        />

        {/* 水平网格线 + y 轴刻度 */}
        <For each={yTicks}>
          {(tick) => {
            const y = yScale(tick);
            return (
              <g>
                <line
                  x1={PADDING_LEFT}
                  y1={y}
                  x2={width() - PADDING_RIGHT}
                  y2={y}
                  stroke={colors().grid}
                  stroke-width={tick === 0 ? 1.5 : 0.5}
                />
                <text
                  x={PADDING_LEFT - 8}
                  y={y}
                  text-anchor="end"
                  dominant-baseline="middle"
                  font-size="11"
                  fill={colors().text}
                >
                  {tick.toFixed(1)}
                </text>
              </g>
            );
          }}
        </For>

        {/* y 轴线 */}
        <line
          x1={PADDING_LEFT}
          y1={PADDING_TOP}
          x2={PADDING_LEFT}
          y2={CHART_HEIGHT - PADDING_BOTTOM}
          stroke={colors().axis}
          stroke-width={1}
        />

        {/* episode 引导线 + 竖排标题 */}
        <For each={episodes()}>
          {(e) => {
            const x = xScale(e.timestamp);
            const inView = x >= PADDING_LEFT - 50 &&
              x <= width() - PADDING_RIGHT + 50;
            return (
              <Show when={inView}>
                <line
                  x1={x}
                  y1={PADDING_TOP}
                  x2={x}
                  y2={CHART_HEIGHT - PADDING_BOTTOM}
                  stroke={colors().guide}
                  stroke-width={1}
                  stroke-dasharray="2,3"
                />
                <Show when={e.title}>
                  <text
                    x={x}
                    y={CHART_HEIGHT - PADDING_BOTTOM + 6}
                    transform={`rotate(-90, ${x}, ${
                      CHART_HEIGHT - PADDING_BOTTOM + 6
                    })`}
                    text-anchor="end"
                    font-size="10"
                    fill={colors().guideText}
                  >
                    {e.title}
                  </text>
                </Show>
              </Show>
            );
          }}
        </For>

        {/* Overall 折线 */}
        <path
          d={buildLinePath(episodes(), (e) => e.overallRating)}
          fill="none"
          stroke={colors().overall}
          stroke-width={2}
          stroke-linejoin="round"
          stroke-linecap="round"
        />

        {/* My 折线 */}
        <path
          d={buildLinePath(episodes(), (e) => e.myRating)}
          fill="none"
          stroke={colors().my}
          stroke-width={2}
          stroke-linejoin="round"
          stroke-linecap="round"
        />

        {/* 数据点标记 */}
        <For each={episodes()}>
          {(e) => {
            const x = xScale(e.timestamp);
            const inView = x >= PADDING_LEFT - 10 &&
              x <= width() - PADDING_RIGHT + 10;
            return (
              <Show when={inView}>
                <Show when={e.overallRating !== null}>
                  <circle
                    cx={x}
                    cy={yScale(e.overallRating!)}
                    r={2.5}
                    fill={colors().overall}
                  />
                </Show>
                <Show when={e.myRating !== null}>
                  <circle
                    cx={x}
                    cy={yScale(e.myRating!)}
                    r={2.5}
                    fill={colors().my}
                  />
                </Show>
              </Show>
            );
          }}
        </For>

        {/* hover 游标线 */}
        <Show when={tooltipData()}>
          {(td) => (
            <g>
              <line
                x1={td().x}
                y1={PADDING_TOP}
                x2={td().x}
                y2={CHART_HEIGHT - PADDING_BOTTOM}
                stroke={colors().cursor}
                stroke-width={1}
                stroke-dasharray="4,2"
              />
              <Show when={td().e.overallRating !== null}>
                <circle
                  cx={td().x}
                  cy={yScale(td().e.overallRating!)}
                  r={4}
                  fill={colors().overall}
                  stroke={colors().bg}
                  stroke-width={1.5}
                />
              </Show>
              <Show when={td().e.myRating !== null}>
                <circle
                  cx={td().x}
                  cy={yScale(td().e.myRating!)}
                  r={4}
                  fill={colors().my}
                  stroke={colors().bg}
                  stroke-width={1.5}
                />
              </Show>
            </g>
          )}
        </Show>
      </svg>

      {/* tooltip（HTML 层，便于换行） */}
      <Show when={tooltipData()}>
        {(td) => {
          const e = td().e;
          const x = td().x;
          const tipWidth = 180;
          let left = x + 12;
          if (left + tipWidth > width()) left = x - tipWidth - 12;
          if (left < 0) left = 8;
          const top = PADDING_TOP;
          return (
            <div
              style={{
                position: "absolute",
                left: `${left}px`,
                top: `${top}px`,
                width: `${tipWidth}px`,
                background: colors().tooltipBg,
                border: `1px solid ${colors().tooltipBorder}`,
                color: colors().tooltipText,
                padding: "8px 10px",
                "border-radius": "4px",
                "font-size": "12px",
                "line-height": "1.5",
                "pointer-events": "none",
                "box-shadow": "0 2px 8px rgba(0,0,0,0.15)",
                "z-index": "10",
              }}
            >
              <div style={{ "font-weight": "bold", "margin-bottom": "4px" }}>
                {e.date}
              </div>
              <Show when={e.overallRating !== null}>
                <div>
                  <span
                    style={{
                      display: "inline-block",
                      width: "10px",
                      height: "10px",
                      background: colors().overall,
                      "border-radius": "50%",
                      "margin-right": "6px",
                      "vertical-align": "middle",
                    }}
                  />
                  总评：{e.overallRating!.toFixed(2)}
                  <span style={{ opacity: 0.7 }}>
                    {" "}（{e.overallVotes} 人）
                  </span>
                </div>
              </Show>
              <Show when={e.overallRating === null}>
                <div style={{ opacity: 0.6 }}>
                  <span
                    style={{
                      display: "inline-block",
                      width: "10px",
                      height: "10px",
                      background: colors().overall,
                      "border-radius": "50%",
                      "margin-right": "6px",
                      "vertical-align": "middle",
                      opacity: 0.4,
                    }}
                  />
                  总评：暂无
                </div>
              </Show>
              <Show when={e.myRating !== null}>
                <div>
                  <span
                    style={{
                      display: "inline-block",
                      width: "10px",
                      height: "10px",
                      background: colors().my,
                      "border-radius": "50%",
                      "margin-right": "6px",
                      "vertical-align": "middle",
                    }}
                  />
                  我的评分：{e.myRating!.toFixed(0)}
                </div>
              </Show>
              <Show when={e.myRating === null}>
                <div style={{ opacity: 0.6 }}>
                  <span
                    style={{
                      display: "inline-block",
                      width: "10px",
                      height: "10px",
                      background: colors().my,
                      "border-radius": "50%",
                      "margin-right": "6px",
                      "vertical-align": "middle",
                      opacity: 0.4,
                    }}
                  />
                  我的评分：暂无
                </div>
              </Show>
            </div>
          );
        }}
      </Show>

      {/* 缩放控制提示 */}
      <div
        style={{
          "font-size": "11px",
          color: colors().text,
          opacity: 0.6,
          "text-align": "right",
          "margin-top": "4px",
        }}
      >
        滚轮/双指缩放 · 拖动平移 · 当前缩放 {zoom().toFixed(1)}x
      </div>
    </div>
  );
};
