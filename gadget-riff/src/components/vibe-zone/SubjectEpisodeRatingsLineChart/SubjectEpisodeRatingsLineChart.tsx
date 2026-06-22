import {
  type Component,
  createMemo,
  createSignal,
  Index,
  onCleanup,
  onMount,
  Show,
} from "solid-js";

import type { Context } from "../../../context";
import {
  type EpisodeData,
  type EpisodeId,
  type EpisodeVotes,
  type MyRating,
  scores,
  type SubjectData,
  type SubjectId,
} from "../../../definitions";
import type { SubjectDataResponse } from "../../../stores/temporary-global-stores/score-store";

export interface DataPoint {
  episodeId: EpisodeId;
  date: `${number}-${number}-${number}`; // YYYY-MM-DD
}

const CHART_HEIGHT = 360;
const PADDING_LEFT = 52;
const PADDING_RIGHT = 16;
const PADDING_TOP = 16;
const PADDING_BOTTOM = 40;
const Y_MIN = 0;
const Y_MAX = 10;
const Y_TICK_STEP = 1;
const MIN_ZOOM = 1; // 全部剧集
const MAX_ZOOM = 64;
const MIN_PIXELS_PER_TICK = 56; // x 轴日期刻度最小间距
const DAY_MS = 24 * 60 * 60 * 1000;

function parseDate(s: `${number}-${number}-${number}`): number {
  const [y, m, d] = s.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function formatDateLabel(ms: number): string {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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

// 选择合适的日期刻度间隔（天），使刻度间距不小于 MIN_PIXELS_PER_TICK
function chooseTickIntervalDays(visibleSpanMs: number, innerW: number): number {
  const minDays = Math.max(
    1,
    Math.ceil((visibleSpanMs / DAY_MS) / (innerW / MIN_PIXELS_PER_TICK)),
  );
  const niceSteps = [1, 2, 7, 14, 30, 60, 90, 180, 365, 730, 1095];
  for (const s of niceSteps) {
    if (s >= minDays) return s;
  }
  return Math.ceil(minDays / 365) * 365;
}

export const SubjectEpisodeRatingsLineChart: Component<{
  ctx: Context;
  subjectId: SubjectId;
  dataPoints: DataPoint[];
}> = (props) => {
  const [containerWidth, setContainerWidth] = createSignal(0);
  const [zoom, setZoom] = createSignal(1);
  const [panOffset, setPanOffset] = createSignal(0); // 时间偏移（毫秒）
  const [hoverIndex, setHoverIndex] = createSignal<number | null>(null);
  const [dark, setDark] = createSignal(isDarkMode());

  let containerRef: HTMLDivElement | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let mo: MutationObserver | null = null;

  const measure = () => {
    if (containerRef) setContainerWidth(containerRef.clientWidth);
  };

  onCleanup(() => {
    resizeObserver?.disconnect();
    mo?.disconnect();
  });

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

  // 单次查询整个 subject 的评分数据（一次网络请求覆盖所有 episode）
  const subjectDataResp: () => SubjectDataResponse = () =>
    props.ctx.scoreStore.queryCompleteSubjectDataTracked(props.subjectId)();

  const subjectData = createMemo<SubjectData | undefined>(() => {
    const r = subjectDataResp();
    if (r[0] !== "ok") return undefined;
    return r[1];
  });

  // 异步加载标题（按需，仅对可见 episode）
  const [titles, setTitles] = createSignal<Record<number, string>>({});
  const titleRequested = new Set<number>();
  const ensureTitle = (episodeId: EpisodeId) => {
    const id = episodeId as number;
    if (titleRequested.has(id)) return;
    titleRequested.add(id);
    props.ctx.bgmClient.getEpisodeTitle(episodeId).then((title) => {
      setTitles((prev) => ({ ...prev, [id]: title }));
    });
  };

  // 合并 episode 信息：严格保持 props.dataPoints 的顺序（权威排序）
  const episodes = createMemo<EpisodeInfo[]>(() => {
    const sd = subjectData();
    const t = titles();
    const result: EpisodeInfo[] = [];
    for (const dp of props.dataPoints) {
      const epResp = sd?.episodes[dp.episodeId];
      let votes: EpisodeVotes = {};
      let myRating: MyRating | undefined;
      if (epResp && epResp[0] === "ok") {
        const ed: EpisodeData = epResp[1];
        votes = ed.votes ?? {};
        myRating = ed.myRating;
      }
      const overall = averageScore(votes);
      const tv = totalVotes(votes);
      const my = myRating?.score ?? null;
      result.push({
        episodeId: dp.episodeId,
        date: dp.date,
        timestamp: parseDate(dp.date),
        overallRating: overall,
        overallVotes: tv,
        myRating: my === null ? null : my,
        title: t[dp.episodeId as number] ?? null,
      });
    }
    return result;
  });

  const innerWidth = () =>
    Math.max(0, containerWidth() - PADDING_LEFT - PADDING_RIGHT);
  const innerHeight = () => CHART_HEIGHT - PADDING_TOP - PADDING_BOTTOM;

  // x 轴域（时间戳范围），基于 dataPoints 中的日期
  const xDomain = createMemo(() => {
    const eps = episodes();
    if (eps.length === 0) return { min: 0, max: 1 };
    let min = Infinity;
    let max = -Infinity;
    for (const e of eps) {
      if (e.timestamp < min) min = e.timestamp;
      if (e.timestamp > max) max = e.timestamp;
    }
    if (min === max) return { min: min - DAY_MS, max: max + DAY_MS };
    return { min, max };
  });

  // 缩放后的可视时间范围
  const viewDomain = createMemo(() => {
    const dom = xDomain();
    const span = dom.max - dom.min || 1;
    const visibleSpan = span / zoom();
    const maxPan = Math.max(0, span - visibleSpan);
    const pan = Math.min(Math.max(0, panOffset()), maxPan);
    const min = dom.min + pan;
    const max = min + visibleSpan;
    return { min, max, pan, maxPan, span, visibleSpan };
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

  // 生成折线 path：按 dataPoints 顺序连接相邻有效点，遇 null 断开
  const buildPath = (getValue: (e: EpisodeInfo) => number | null) => {
    const eps = episodes();
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

  const overallPath = createMemo(() => buildPath((e) => e.overallRating));
  const myPath = createMemo(() => buildPath((e) => e.myRating));

  // 可见 episode 索引列表（视口剔除），同时按需加载标题
  const visibleEpisodeIndices = createMemo(() => {
    const eps = episodes();
    const left = PADDING_LEFT - 20;
    const right = containerWidth() - PADDING_RIGHT + 20;
    const indices: number[] = [];
    for (let i = 0; i < eps.length; i++) {
      const x = xScale(eps[i].timestamp);
      if (x >= left && x <= right) {
        indices.push(i);
        if (eps[i].title === null) ensureTitle(eps[i].episodeId);
      }
    }
    return indices;
  });

  // 拖动平移
  let dragging = false;
  let dragStartX = 0;
  let dragStartPan = 0;

  const onPointerDown = (ev: PointerEvent) => {
    if (ev.pointerType === "touch") return;
    dragging = true;
    dragStartX = ev.clientX;
    dragStartPan = panOffset();
    (ev.target as Element).setPointerCapture?.(ev.pointerId);
  };

  const onPointerMove = (ev: PointerEvent) => {
    if (!dragging) return;
    const dx = ev.clientX - dragStartX;
    const v = viewDomain();
    const timeDelta = -(dx / (innerWidth() || 1)) * v.visibleSpan;
    const newPan = dragStartPan + timeDelta;
    setPanOffset(Math.min(Math.max(0, newPan), v.maxPan));
  };

  const onPointerUp = (ev: PointerEvent) => {
    dragging = false;
    (ev.target as Element).releasePointerCapture?.(ev.pointerId);
  };

  // 滚轮缩放（以鼠标位置为锚点）
  const onWheel = (ev: WheelEvent) => {
    ev.preventDefault();
    if (!containerRef) return;
    const rect = containerRef.getBoundingClientRect();
    const mouseX = ev.clientX - rect.left;
    const innerX = Math.min(
      Math.max(0, mouseX - PADDING_LEFT),
      innerWidth(),
    );
    const ratio = innerWidth() > 0 ? innerX / innerWidth() : 0;

    const oldZoom = zoom();
    const factor = ev.deltaY < 0 ? 1.15 : 1 / 1.15;
    const newZoom = Math.min(Math.max(MIN_ZOOM, oldZoom * factor), MAX_ZOOM);
    if (newZoom === oldZoom) return;

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
      const innerX = Math.min(Math.max(0, cx - PADDING_LEFT), innerWidth());
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
    if (pointers.size < 2) pinchStartDist = 0;
  };

  // hover：吸附到最近的 episode（按 x 距离）
  const onHoverMove = (ev: MouseEvent) => {
    if (pointers.size >= 2) return;
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

  const onHoverLeave = () => setHoverIndex(null);

  const yTicks = Array.from(
    { length: (Y_MAX - Y_MIN) / Y_TICK_STEP + 1 },
    (_, i) => Y_MIN + i * Y_TICK_STEP,
  );

  // x 轴日期刻度
  const xTicks = createMemo(() => {
    const v = viewDomain();
    const innerW = innerWidth();
    if (innerW <= 0) return [];
    const intervalDays = chooseTickIntervalDays(v.visibleSpan, innerW);
    const intervalMs = intervalDays * DAY_MS;
    const startMs = Math.ceil(v.min / intervalMs) * intervalMs;
    const ticks: { ms: number; label: string }[] = [];
    for (let ms = startMs; ms <= v.max; ms += intervalMs) {
      ticks.push({ ms, label: formatDateLabel(ms) });
    }
    return ticks;
  });

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

  const width = () => Math.max(containerWidth(), 1);

  const tooltipData = createMemo(() => {
    const idx = hoverIndex();
    if (idx === null) return null;
    const eps = episodes();
    if (idx < 0 || idx >= eps.length) return null;
    const e = eps[idx];
    const x = xScale(e.timestamp);
    return { e, x };
  });

  const ready = () => containerWidth() > 0;

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
      <Show
        when={ready()}
        fallback={<div style={{ height: `${CHART_HEIGHT}px` }} />}
      >
        <svg
          width={width()}
          height={CHART_HEIGHT}
          style={{ display: "block", "touch-action": "none" }}
          onPointerDown={(ev) => {
            if (ev.pointerType === "touch") onTouchPointerDown(ev);
            else onPointerDown(ev);
          }}
          onPointerMove={(ev) => {
            if (ev.pointerType === "touch") onTouchPointerMove(ev);
            else {
              onPointerMove(ev);
              onHoverMove(ev);
            }
          }}
          onPointerUp={(ev) => {
            if (ev.pointerType === "touch") onTouchPointerUp(ev);
            else onPointerUp(ev);
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
          <Index each={yTicks}>
            {(tick) => {
              const y = () => yScale(tick());
              return (
                <g>
                  <line
                    x1={PADDING_LEFT}
                    y1={y()}
                    x2={width() - PADDING_RIGHT}
                    y2={y()}
                    stroke={colors().grid}
                    stroke-width={tick() === 0 ? 1.5 : 0.5}
                  />
                  <text
                    x={PADDING_LEFT - 8}
                    y={y()}
                    text-anchor="end"
                    dominant-baseline="middle"
                    font-size="11"
                    fill={colors().text}
                  >
                    {tick().toFixed(1)}
                  </text>
                </g>
              );
            }}
          </Index>

          {/* y 轴线 */}
          <line
            x1={PADDING_LEFT}
            y1={PADDING_TOP}
            x2={PADDING_LEFT}
            y2={CHART_HEIGHT - PADDING_BOTTOM}
            stroke={colors().axis}
            stroke-width={1}
          />

          {/* x 轴线 */}
          <line
            x1={PADDING_LEFT}
            y1={CHART_HEIGHT - PADDING_BOTTOM}
            x2={width() - PADDING_RIGHT}
            y2={CHART_HEIGHT - PADDING_BOTTOM}
            stroke={colors().axis}
            stroke-width={1}
          />

          {/* x 轴日期刻度 */}
          <Index each={xTicks()}>
            {(tick) => {
              const x = () => xScale(tick().ms);
              return (
                <g>
                  <line
                    x1={x()}
                    y1={CHART_HEIGHT - PADDING_BOTTOM}
                    x2={x()}
                    y2={CHART_HEIGHT - PADDING_BOTTOM + 4}
                    stroke={colors().axis}
                    stroke-width={1}
                  />
                  <text
                    x={x()}
                    y={CHART_HEIGHT - PADDING_BOTTOM + 16}
                    text-anchor="middle"
                    font-size="10"
                    fill={colors().text}
                  >
                    {tick().label}
                  </text>
                </g>
              );
            }}
          </Index>

          {/* episode 引导线 + 竖排标题（仅可见项） */}
          <Index each={visibleEpisodeIndices()}>
            {(i) => {
              const ep = () => episodes()[i()];
              const x = () => xScale(ep().timestamp);
              return (
                <g>
                  <line
                    x1={x()}
                    y1={PADDING_TOP}
                    x2={x()}
                    y2={CHART_HEIGHT - PADDING_BOTTOM}
                    stroke={colors().guide}
                    stroke-width={1}
                    stroke-dasharray="2,3"
                  />
                  <Show when={ep().title}>
                    <text
                      x={x() + 4}
                      y={CHART_HEIGHT - PADDING_BOTTOM - 4}
                      transform={`rotate(-90, ${x() + 4}, ${
                        CHART_HEIGHT - PADDING_BOTTOM - 4
                      })`}
                      text-anchor="start"
                      font-size="10"
                      fill={colors().guideText}
                    >
                      {ep().title}
                    </text>
                  </Show>
                </g>
              );
            }}
          </Index>

          {/* Overall 折线 */}
          <path
            d={overallPath()}
            fill="none"
            stroke={colors().overall}
            stroke-width={2}
            stroke-linejoin="round"
            stroke-linecap="round"
          />

          {/* My 折线 */}
          <path
            d={myPath()}
            fill="none"
            stroke={colors().my}
            stroke-width={2}
            stroke-linejoin="round"
            stroke-linecap="round"
          />

          {/* 数据点标记（仅可见项） */}
          <Index each={visibleEpisodeIndices()}>
            {(i) => {
              const ep = () => episodes()[i()];
              const x = () => xScale(ep().timestamp);
              return (
                <g>
                  <Show when={ep().overallRating !== null}>
                    <circle
                      cx={x()}
                      cy={yScale(ep().overallRating!)}
                      r={2.5}
                      fill={colors().overall}
                    />
                  </Show>
                  <Show when={ep().myRating !== null}>
                    <circle
                      cx={x()}
                      cy={yScale(ep().myRating!)}
                      r={2.5}
                      fill={colors().my}
                    />
                  </Show>
                </g>
              );
            }}
          </Index>

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
      </Show>

      {/* tooltip（HTML 层） */}
      <Show when={tooltipData()}>
        {(td) => {
          const tipWidth = 180;
          const left = () => {
            const x = td().x;
            let l = x + 12;
            if (l + tipWidth > width()) l = x - tipWidth - 12;
            if (l < 0) l = 8;
            return l;
          };
          return (
            <div
              style={{
                position: "absolute",
                left: `${left()}px`,
                top: `${PADDING_TOP}px`,
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
                {td().e.date}
              </div>
              <Show when={td().e.overallRating !== null}>
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
                  总评：{td().e.overallRating!.toFixed(2)}
                  <span style={{ opacity: 0.7 }}>
                    {" "}（{td().e.overallVotes} 人）
                  </span>
                </div>
              </Show>
              <Show when={td().e.overallRating === null}>
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
              <Show when={td().e.myRating !== null}>
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
                  我的评分：{td().e.myRating!.toFixed(0)}
                </div>
              </Show>
              <Show when={td().e.myRating === null}>
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
