import type { EpisodeId, SubjectId, SubjectType, UserId } from "../definitions";

export const readonlyPageData = {
  get appId(): string {
    return CHII_APP_ID;
  },

  get claimedUserId(): UserId | null {
    return window.CHOBITS_UID as UserId ?? null;
  },

  getClaimedUserTextIdAndName(): { textId: string; name: string } | null {
    const meAEl = document.querySelector("#dock .content .first > a");
    if (!meAEl) return null;
    const claimedUserTextId = meAEl.getAttribute("href")?.split("/").at(-1) ??
      null;
    const claimedUserName = meAEl.textContent?.trim() ?? null;
    if (claimedUserTextId && claimedUserName) {
      return { textId: claimedUserTextId, name: claimedUserName };
    } else {
      return null;
    }
  },

  get subjectId(): SubjectId | null {
    const pathParts = window.location.pathname.split("/").slice(1);
    if (pathParts[0] === "subject" && pathParts.length >= 2) {
      return Number(pathParts[1]) as SubjectId;
    }

    const a = document.querySelector("#headerSubject a");
    if (a) { // for pages like `/ep/42`.
      const aPathParts = a.getAttribute("href")?.split("/").slice(1);
      if (aPathParts && aPathParts[0] === "subject" && aPathParts.length >= 2) {
        return Number(aPathParts[1]) as SubjectId;
      }
    }

    return null;
  },

  get subjectType(): SubjectType | null {
    // NOTE: `document.querySelector("#headerSubject")?.getAttribute("typeof")`
    // 不能用：在章节列表页面中其值为 `"v:"`。

    for (const t of ["anime", "book", "music", "game", "real"] as const) {
      if (
        document.querySelector(`#navMenuNeue>li>a[href='/${t}']`)?.classList
          .contains("focus")
      ) {
        return t;
      }
    }
    return null;
  },

  get episodeId(): EpisodeId | null {
    const pathParts = window.location.pathname.split("/").slice(1);
    if (pathParts[0] === "ep" && pathParts.length >= 2) {
      return Number(pathParts[1]) as EpisodeId;
    }
    return null;
  },

  get gadgetPagePath(): string {
    return `/dev/app/${CHII_APP_ID}`;
  },
};
