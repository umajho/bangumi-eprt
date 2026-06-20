import { createEffect, on } from "solid-js";

import { createMyTimelineContentInstance } from "../components/MyTimelineContent";
import type { EpisodeId, SubjectId } from "../definitions";
import { processCluetip } from "../element-processors/cluetip";
import { processPrgList } from "../element-processors/prg-list";
import type { Context } from "../context";

export function processRootPage(ctx: Context) {
  collectCacheEntries(ctx);

  const { initializeCluetip } = processCluetip(ctx);

  for (const prgListEl of document.querySelectorAll("ul.prg_list")) {
    const subjectId = (() => {
      const epGrid = prgListEl.closest(".epGird");
      if (!epGrid) return;
      const a = epGrid.querySelector("a[data-subject-id]");
      if (!a) return;
      return Number(a.getAttribute("data-subject-id")) as SubjectId;
    })();
    if (subjectId === undefined || Number.isNaN(subjectId)) continue;

    processPrgList(ctx, {
      initializeCluetip,
      prgListElement: prgListEl as HTMLUListElement,
      subjectId,
    });
  }

  processTimelineColumn(ctx);
}

function collectCacheEntries(ctx: Context) {
  for (const tinyHeaderEl of document.querySelectorAll(".tinyHeader")) {
    const textTipEl = tinyHeaderEl
      .querySelector<HTMLAnchorElement>(".textTip");
    if (!textTipEl) continue;

    const subjectId = Number(textTipEl.dataset.subjectId) as SubjectId;
    if (isNaN(subjectId)) continue;

    const name = textTipEl.textContent;
    const nameCn = textTipEl.dataset.subjectNameCn;
    const eps = ((): number | null => {
      const smallEl = tinyHeaderEl.querySelector(".progress_percent_text");
      if (!smallEl) return null;
      const m = /\[\d+\/(\d+)\]/.exec(smallEl.textContent);
      if (!m) return null;
      const eps = Number(m[1]);
      return Number.isNaN(eps) ? null : eps;
    })();

    ctx.bgmClient.putEntryIntoSubjectCache(subjectId, {
      name,
      ...(nameCn ? { nameCn } : {}),
      eps,
    });
  }

  for (const epInfoEl of document.querySelectorAll(".load-epinfo")) {
    const href = epInfoEl.getAttribute("href");
    const title = epInfoEl.getAttribute("title");
    if (!href || !title) continue;

    const episodeId = Number(href.split("/").at(-1)) as EpisodeId;
    const m = /^ep\.(.+?) (.+)$/.exec(title);
    if (isNaN(episodeId) || !m) continue;

    const sort = Number(m[1]);
    const name = m[2];
    if (isNaN(sort)) continue;

    ctx.bgmClient.putEntryIntoEpisodeCache(episodeId, { name, sort });
  }
}

function processTimelineColumn(ctx: Context) {
  const topUl = document.querySelector("ul#timelineTabs > li:has(a.top) > ul");
  const topLi = topUl?.closest("li");
  if (!topUl || !topLi) return;

  let currentTabButtonLiEl: HTMLElement | null = null;

  function replaceTimelineContent(ev: Event) {
    ev.preventDefault();

    const containerEl = document.querySelector("#tmlContent");
    if (!containerEl) return;

    document.querySelector("#timelineTabs > li > a.focus")?.classList
      .remove("focus");
    focus();

    containerEl.innerHTML = "";

    const myTimelineContentInstance = createMyTimelineContentInstance(ctx);
    containerEl.appendChild(myTimelineContentInstance.element);
  }

  function focus() {
    currentTabButtonLiEl?.querySelector("a")?.classList.add("focus");
  }
  function hasFocus() {
    return currentTabButtonLiEl?.querySelector("a")?.classList
      .contains("focus");
  }

  createEffect(
    on(ctx.settingsStore.getTimelineTabButtonLocationSignal(), (s) => {
      const hadFocus = hasFocus();
      currentTabButtonLiEl?.remove();
      switch (s) {
        case "more-dropdown": {
          const myTimelineTabButton = document.createElement("li");
          currentTabButtonLiEl = myTimelineTabButton;
          myTimelineTabButton.innerHTML =
            `<a href="#"><span class="ico"></span><span>我的单集评分</span></a>`;
          myTimelineTabButton.addEventListener("click", replaceTimelineContent);
          topUl.appendChild(myTimelineTabButton);

          break;
        }
        case "main-row": {
          const myTimelineTabButton = document.createElement("li");
          currentTabButtonLiEl = myTimelineTabButton;
          myTimelineTabButton.innerHTML = `<a href="#">我的单集评分</a>`;
          myTimelineTabButton.addEventListener("click", replaceTimelineContent);
          topLi.insertAdjacentElement("beforebegin", myTimelineTabButton);

          break;
        }
        default:
          s satisfies never;
      }

      if (hadFocus) {
        focus();
      }
    }),
  );
}
