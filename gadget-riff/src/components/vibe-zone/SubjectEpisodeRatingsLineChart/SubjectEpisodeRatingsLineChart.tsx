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

const CHART_HEIGHT = 400;
const PADDING_LEFT = 52;
const PADDING_RIGHT = 16;
const PADDING_TOP = 44; // 顶部预留图例空间
const PADDING_BOTTOM = 40;
const Y_MIN = 0;
const Y_MAX = 10;
const Y_TICK_STEP = 1;
const MIN_ZOOM = 1; // 全部剧集
const MAX_ZOOM = 64;
const MIN_PIXELS_PER_TICK = 56; // x 轴日期刻度最小间距
const DAY_MS = 24 * 60 * 60 * 1000;

// overall 点尺寸：以面积表示评分人数
const POINT_MIN_RADIUS = 2.5;
const POINT_MAX_RADIUS = 12; // 硬编码最大半径
// 面积缩放：面积与人数线性对应，并受最小/最大半径约束
function overallPointRadius(votes: number, maxVotes: number): number {
  if (votes <= 0 || maxVotes <= 0) return POINT_MIN_RADIUS;
  const t = Math.min(1, Math.max(0, votes / maxVotes));
  const minArea = POINT_MIN_RADIUS * POINT_MIN_RADIUS;
  const maxArea = POINT_MAX_RADIUS * POINT_MAX_RADIUS;
  const area = minArea + (maxArea - minArea) * t;
  return Math.min(POINT_MAX_RADIUS, Math.sqrt(area));
}

// y 轴渐变色：从底部（冷色）到顶部（暖色），light/dark 各一套
function yGradientColors(dark: boolean): string[] {
  // 11 个刻度（0..10），从低到高
  if (dark) {
    return [
      "#5b7fff",
      "#5f86f6",
      "#6a8dec",
      "#7994de",
      "#8b9bcc",
      "#9da3b8",
      "#aeaba6",
      "#bfb294",
      "#d0ba82",
      "#e1c170",
      "#f2c95e",
    ];
  }
  return [
    "#3f51b5",
    "#4556ab",
    "#51619b",
    "#616f86",
    "#757d6f",
    "#8a8b58",
    "#a09943",
    "#b7a72f",
    "#cfb51c",
    "#e7c30a",
    "#ffd400",
  ];
}

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
  const [selectedIndex, setSelectedIndex] = createSignal<number | null>(null);
  const [hoveredLinkId, setHoveredLinkId] = createSignal<number | null>(null);
  const [dark, setDark] = createSignal(isDarkMode());

  // 触摸设备检测（用于区分 tap/click 交互模式）
  const isTouchDevice = "ontouchstart" in window ||
    (navigator.maxTouchPoints ?? 0) > 0;

  let containerRef: HTMLDivElement | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let mo: MutationObserver | null = null;

  const measure = () => {
    if (containerRef) setContainerWidth(containerRef.clientWidth);
  };

  onCleanup(() => {
    resizeObserver?.disconnect();
    mo?.disconnect();
    if (wheelGestureTimer !== null) clearTimeout(wheelGestureTimer);
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

  // 拖动平移（鼠标 / 单指触摸）
  let dragging = false;
  let dragStartX = 0;
  let dragStartPan = 0;
  let dragMoved = false; // 是否产生过位移（用于区分 tap 与 drag）

  const startDrag = (clientX: number) => {
    dragging = true;
    dragMoved = false;
    dragStartX = clientX;
    dragStartPan = panOffset();
  };

  const moveDrag = (clientX: number) => {
    if (!dragging) return false;
    const dx = clientX - dragStartX;
    if (Math.abs(dx) > 3) dragMoved = true;
    const v = viewDomain();
    const timeDelta = -(dx / (innerWidth() || 1)) * v.visibleSpan;
    const newPan = dragStartPan + timeDelta;
    setPanOffset(Math.min(Math.max(0, newPan), v.maxPan));
    return dragMoved;
  };

  const endDrag = () => {
    dragging = false;
  };

  const onPointerDown = (ev: PointerEvent) => {
    if (ev.pointerType === "touch") return; // 触摸由 touch 处理器处理
    startDrag(ev.clientX);
    (ev.target as Element).setPointerCapture?.(ev.pointerId);
  };

  const onPointerMove = (ev: PointerEvent) => {
    if (ev.pointerType === "touch") return;
    if (dragging) moveDrag(ev.clientX);
    onHoverMove(ev);
  };

  const onPointerUp = (ev: PointerEvent) => {
    if (ev.pointerType === "touch") return;
    endDrag();
    (ev.target as Element).releasePointerCapture?.(ev.pointerId);
  };

  // 滚轮 / 触摸板：
  //   - 垂直滚动（鼠标滚轮 / 触摸板双指垂直）→ 水平缩放（围绕指针位置）
  //   - 触摸板双指捏合（ctrlKey）→ 缩放
  //   - 触摸板水平手势（|deltaX| 主导）→ 水平平移
  // 手势锁定：在连续 wheel 事件中保持首次分类不变，避免水平平移过程中
  // 因垂直漂移事件误触发缩放；事件空闲超过阈值后手势结束，重新分类。
  let wheelGesture: "none" | "pan" | "zoom" = "none";
  let wheelGestureTimer: ReturnType<typeof setTimeout> | null = null;
  const WHEEL_GESTURE_IDLE_MS = 200;

  const onWheel = (ev: WheelEvent) => {
    ev.preventDefault();
    if (!containerRef) return;

    // 续期手势：每次 wheel 事件都重置空闲计时器
    if (wheelGestureTimer !== null) clearTimeout(wheelGestureTimer);
    wheelGestureTimer = setTimeout(() => {
      wheelGesture = "none";
      wheelGestureTimer = null;
    }, WHEEL_GESTURE_IDLE_MS);

    // 手势起始时按主轴分类；一旦分类，在本手势内保持不变
    if (wheelGesture === "none") {
      const isPinch = ev.ctrlKey || ev.metaKey;
      if (isPinch) wheelGesture = "zoom";
      else if (Math.abs(ev.deltaX) > Math.abs(ev.deltaY)) wheelGesture = "pan";
      else wheelGesture = "zoom";
    }

    if (wheelGesture === "pan") {
      // 遵循平台原生滚动方向：向右滑动 → 查看右侧（更晚）内容 → pan 增大
      if (ev.deltaX === 0) return;
      const v = viewDomain();
      const timeDelta = (ev.deltaX / (innerWidth() || 1)) * v.visibleSpan;
      const newPan = panOffset() + timeDelta;
      setPanOffset(Math.min(Math.max(0, newPan), v.maxPan));
      return;
    }

    // 缩放（鼠标滚轮 / 触摸板垂直 / 捏合）：围绕指针位置
    if (ev.deltaY === 0) return;

    const rect = containerRef.getBoundingClientRect();
    const mouseX = ev.clientX - rect.left;
    const innerX = Math.min(
      Math.max(0, mouseX - PADDING_LEFT),
      innerWidth(),
    );
    const ratio = innerWidth() > 0 ? innerX / innerWidth() : 0;

    const oldZoom = zoom();
    const factor = ev.deltaY < 0 ? 1.1 : 1 / 1.1;
    const newZoom = Math.min(
      Math.max(MIN_ZOOM, oldZoom * factor),
      MAX_ZOOM,
    );
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

  // 触摸交互：单指拖动平移 + tap 选择；双指捏合缩放
  const pointers = new Map<number, { x: number; y: number }>();
  let pinchStartDist = 0;
  let pinchStartZoom = 1;
  let pinchStartPan = 0;
  let pinchCenterRatio = 0;
  // 单指拖动状态（与 pinch 互斥）
  let touchDragPointerId: number | null = null;

  const onTouchPointerDown = (ev: PointerEvent) => {
    if (ev.pointerType !== "touch") return;
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    (ev.target as Element).setPointerCapture?.(ev.pointerId);

    if (pointers.size === 1) {
      // 开始单指拖动
      touchDragPointerId = ev.pointerId;
      startDrag(ev.clientX);
    } else if (pointers.size === 2) {
      // 切换到双指缩放，取消单指拖动
      touchDragPointerId = null;
      endDrag();
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
    } else if (
      pointers.size === 1 && touchDragPointerId === ev.pointerId
    ) {
      moveDrag(ev.clientX);
    }
  };

  const onTouchPointerUp = (ev: PointerEvent) => {
    if (ev.pointerType !== "touch") return;
    const wasDragPointer = touchDragPointerId === ev.pointerId;
    const hadMoved = dragMoved;
    pointers.delete(ev.pointerId);
    (ev.target as Element).releasePointerCapture?.(ev.pointerId);

    if (pointers.size < 2) pinchStartDist = 0;

    if (wasDragPointer) {
      endDrag();
      touchDragPointerId = null;
      // 未移动 → 视为 tap：选择最近的 episode
      if (!hadMoved) {
        handleTap(ev.clientX, ev.target as Element);
      }
    } else if (pointers.size === 1 && touchDragPointerId === null) {
      // 从双指变单指：剩余手指接管拖动
      const [remaining] = [...pointers.entries()];
      if (remaining) {
        touchDragPointerId = remaining[0];
        startDrag(remaining[1].x);
      }
    }
  };

  // tap 处理：选择最近 episode；若点击标题且已选中则跳转
  const handleTap = (clientX: number, target: Element) => {
    if (!containerRef) return;
    const rect = containerRef.getBoundingClientRect();
    const mouseX = clientX - rect.left;
    const eps = episodes();
    if (eps.length === 0) return;

    // 检查是否点中了 episode 标题链接
    const titleEl = target.closest("[data-ep-link]") as
      | SVGAElement
      | null;
    if (titleEl) {
      const epId = Number(titleEl.dataset.epLinkId);
      const idx = eps.findIndex((e) => e.episodeId as number === epId);
      if (idx >= 0) {
        if (selectedIndex() === idx) {
          // 已选中 → 跳转
          window.open(`/ep/${epId}`, "_blank");
          return;
        }
        // 未选中 → 仅选中
        setSelectedIndex(idx);
        setHoverIndex(idx);
        return;
      }
    }

    // 普通区域 tap：选择最近的 episode
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
    setSelectedIndex(nearest);
    setHoverIndex(nearest);
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

  // y 轴渐变色（从低到高）
  const yGradient = createMemo(() => yGradientColors(dark()));

  const width = () => Math.max(containerWidth(), 1);

  // 当前 subject 中最大的评分人数（用于图例最大点）
  const maxVotes = createMemo(() => {
    let max = 0;
    for (const e of episodes()) {
      if (e.overallVotes > max) max = e.overallVotes;
    }
    return max;
  });

  // 图例示例点：最小、中间值、最大（最大 = 实际最大评分人数）
  const legendExamples = createMemo(() => {
    const mx = maxVotes();
    if (mx <= 1) return [1];
    // 选择 3-4 个示例：1, 中间, 最大
    const mid = Math.max(2, Math.round(mx / 2));
    if (mx <= 2) return [1, mx];
    if (mx <= 10) return [1, mid, mx];
    return [1, mid, mx];
  });

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

          {/* 水平网格线 + y 轴刻度（渐变色） */}
          <Index each={yTicks}>
            {(tick, idx) => {
              const y = () => yScale(tick());
              const color = () => yGradient()[idx];
              return (
                <g>
                  <line
                    x1={PADDING_LEFT}
                    y1={y()}
                    x2={width() - PADDING_RIGHT}
                    y2={y()}
                    stroke={color()}
                    stroke-width={tick() === 0 ? 1.5 : 0.5}
                    opacity={tick() === 0 ? 1 : 0.55}
                  />
                  <text
                    x={PADDING_LEFT - 8}
                    y={y()}
                    text-anchor="end"
                    dominant-baseline="middle"
                    font-size="11"
                    fill={color()}
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

          {/* episode 引导线 + 竖排标题链接（仅可见项） */}
          <Index each={visibleEpisodeIndices()}>
            {(i) => {
              const ep = () => episodes()[i()];
              const x = () => xScale(ep().timestamp);
              const isSelected = () => selectedIndex() === i();
              const isHovered = () =>
                hoveredLinkId() === (ep().episodeId as number);
              const titleText = () => ep().title ?? "";
              const titleFill = () => {
                if (isSelected() || isHovered()) return colors().overall;
                return colors().guideText;
              };
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
                  <text
                    x={x() + 4}
                    y={CHART_HEIGHT - PADDING_BOTTOM - 4}
                    transform={`rotate(-90, ${x() + 4}, ${
                      CHART_HEIGHT - PADDING_BOTTOM - 4
                    })`}
                    text-anchor="start"
                    font-size="10"
                    fill={titleFill()}
                    font-weight={isSelected() || isHovered()
                      ? "bold"
                      : "normal"}
                    data-ep-link="true"
                    data-ep-link-id={ep().episodeId as number}
                    style={{
                      cursor: "pointer",
                      "text-decoration": isSelected() || isHovered()
                        ? "underline"
                        : "none",
                      "pointer-events": "auto",
                    }}
                    onMouseEnter={() =>
                      setHoveredLinkId(ep().episodeId as number)}
                    onMouseLeave={() => setHoveredLinkId(null)}
                    onClick={(ev) => {
                      // 触摸设备：由 pointerup → handleTap 统一处理选择/跳转，
                      // 此处仅阻止默认行为，避免重复触发导致直接跳转。
                      if (isTouchDevice) {
                        ev.preventDefault();
                        ev.stopPropagation();
                        return;
                      }
                      // 非触摸设备：点击标题立即跳转
                      ev.preventDefault();
                      window.open(`/ep/${ep().episodeId}`, "_blank");
                    }}
                  >
                    {titleText()}
                  </text>
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
              const overallR = () =>
                overallPointRadius(ep().overallVotes, maxVotes());
              return (
                <g>
                  <Show when={ep().overallRating !== null}>
                    <circle
                      cx={x()}
                      cy={yScale(ep().overallRating!)}
                      r={overallR()}
                      fill={colors().overall}
                      fill-opacity={0.85}
                      stroke={colors().bg}
                      stroke-width={0.5}
                    />
                  </Show>
                  <Show when={ep().myRating !== null}>
                    <circle
                      cx={x()}
                      cy={yScale(ep().myRating!)}
                      r={2.5}
                      fill={colors().my}
                      stroke={colors().bg}
                      stroke-width={0.5}
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
                    r={overallPointRadius(td().e.overallVotes, maxVotes())}
                    fill={colors().overall}
                    fill-opacity={0.85}
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

          {/* 评分人数图例（绘图区上方，右侧） */}
          {(() => {
            const examples = legendExamples();
            const legendRight = width() - PADDING_RIGHT;
            const labelY = 12;
            const pointsY = 28;
            // 从右向左排列，间距基于最大点半径 + 文本宽度
            const slotWidth = 2 * POINT_MAX_RADIUS + 24;
            return (
              <g style={{ "pointer-events": "none" }}>
                <text
                  x={legendRight}
                  y={labelY}
                  text-anchor="end"
                  font-size="9"
                  fill={colors().text}
                >
                  点面积 = 评分人数
                </text>
                <Index each={examples}>
                  {(n, idx) => {
                    // 从右向左：idx=0 最靠右
                    const cx = () =>
                      legendRight - POINT_MAX_RADIUS - idx * slotWidth;
                    const r = () => overallPointRadius(n(), maxVotes());
                    return (
                      <g>
                        <circle
                          cx={cx()}
                          cy={pointsY}
                          r={r()}
                          fill={colors().overall}
                          fill-opacity={0.85}
                          stroke={colors().bg}
                          stroke-width={0.5}
                        />
                        <text
                          x={cx()}
                          y={pointsY}
                          text-anchor="middle"
                          dominant-baseline="middle"
                          font-size="9"
                          font-weight="700"
                          fill={colors().bg}
                          stroke={colors().text}
                          stroke-width="0.9"
                          paint-order="stroke"
                        >
                          {n()}
                        </text>
                      </g>
                    );
                  }}
                </Index>
              </g>
            );
          })()}
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
                  整体评分：{td().e.overallRating!.toFixed(4)}
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
                  整体评分：暂无
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
