// NOTE: 直接用 `import PackageJson …` 会导致整个 package.json 被打包进输出文件。
import * as PackageJson from "../package.json";
import type { APIResponse } from "./shared/dto";

export const EPRT_ID_HTML_SAFE = "umajho-bangumi-eprt";
export const EPRT_ID_ASCII_SAFE = "umajho.bangumi.eprt";

export function makeCustomElementTagName<T extends string>(
  name: T,
): `${typeof EPRT_ID_HTML_SAFE}-${T}` {
  return `${EPRT_ID_HTML_SAFE}-${name}`;
}

export function makeDataAttributeName<T extends string>(
  name: T,
): `data-${typeof EPRT_ID_HTML_SAFE}-${T}` {
  return `data-${EPRT_ID_HTML_SAFE}-${name}`;
}

export function makeBroadcastChannelName<T extends string>(
  name: T,
): `${typeof EPRT_ID_ASCII_SAFE}:${T}` {
  return `${EPRT_ID_ASCII_SAFE}:${name}`;
}

export function makeLocalStorageKeyName<T extends string>(
  name: T,
): `${typeof EPRT_ID_ASCII_SAFE}:${T}` {
  return `${EPRT_ID_ASCII_SAFE}:${name}`;
}

export function makeHtmlId<T extends string>(
  name: T,
): `${typeof EPRT_ID_HTML_SAFE}-${T}` {
  return `${EPRT_ID_HTML_SAFE}-${name}`;
}

export function makeSpecialAnchorUrl<T extends string>(
  name: T,
): `https://_/${typeof EPRT_ID_ASCII_SAFE}/${T}` {
  return `https://_/${EPRT_ID_ASCII_SAFE}/${name}`;
}

export const GADGET_VERSION = PackageJson.version;

export const LOCAL_STORAGE_KEY_SESSION_TOKEN = //
  makeLocalStorageKeyName("session-token");
export const LOCAL_STORAGE_KEY_ACCESS_TOKEN = //
  makeLocalStorageKeyName("access-token");
export const LEGACY_SEARCH_PARAMS_KEY_TOKEN_COUPON =
  "bgm_ep_ratings_token_coupon";

export const DEFAULT_AUTH_ENTRYPOINT =
  (import.meta as unknown as { env: Record<string, string> }).env
    .VITE_DEFAULT_AUTH_ENTRYPOINT;
export const DEFAULT_API_ENTRYPOINT =
  (import.meta as unknown as { env: Record<string, string> }).env
    .VITE_DEFAULT_API_ENTRYPOINT;

export type SubjectId = number & { readonly __tag: unique symbol };
export type EpisodeId = number & { readonly __tag: unique symbol };
export type UserId = number & { readonly __tag: unique symbol };

export const scores = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
export type Score = typeof scores[number];
export const scoresReversed = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1] as const;

export function describeScore(score: number) {
  return ([
    [9.5, "超神作"],
    [8.5, "神作"],
    [7.5, "力荐"],
    [6.5, "推荐"],
    [5.5, "还行"],
    [4.5, "不过不失"],
    [3.5, "较差"],
    [2.5, "差"],
    [1.5, "很差"],
  ] as const)
    .find(([min, _]) => score >= min)?.[1] ?? "不忍直视";
}

export type EpisodeVotes = { [S in Score]?: number };
export interface EpisodeData {
  votes: EpisodeVotes;
  /**
   * `undefined` 在没有有效的身份认证令牌时，为 `undefined`。
   */
  myRating?: MyRating;
  publicVotersByScore?: { [S in Score]?: number[] };
}
export interface SubjectData {
  episodes: {
    [episodeId: EpisodeId]:
      | APIResponse<EpisodeData>
      | ["loading", opts: { oldData?: EpisodeData }]
      | ["processing", opts: { oldData?: EpisodeData }];
  };
  isComplete: boolean;
  hasMyRatings: boolean;
}

export interface MyRating {
  score: Score | null;
  /**
   * TODO: 去掉 `"unknown"`。
   */
  visibility: { isVisible: boolean } | "unknown";
}
