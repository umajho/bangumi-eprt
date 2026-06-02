import { AppClient } from "./clients/app-client";
import { AuthClient } from "./clients/auth-client";
import { BangumiClient } from "./clients/bangumi-client";
import {
  createSettingsTabSectionAuthInTheWildInstance,
  registerSettingsTab,
} from "./components/SettingsTab";
import {
  DEFAULT_API_ENTRYPOINT,
  DEFAULT_AUTH_ENTRYPOINT,
  EPRT_ID_HTML_SAFE,
  LEGACY_SEARCH_PARAMS_KEY_TOKEN_COUPON,
  LOCAL_STORAGE_KEY_SESSION_TOKEN,
  // LOCAL_STORAGE_KEY_SESSION_TOKEN,
} from "./definitions";
import { processEpPage } from "./page-processors/ep";
import { processRootPage } from "./page-processors/root";
import { processSubjectPage } from "./page-processors/subject";
import { processSubjectEpListPage } from "./page-processors/subject-ep-list";
import {
  type AuthStore,
  // type AuthStore,
  createAuthStore,
} from "./stores/persistent-stores/auth-store";
import { createEntryPointStore } from "./stores/persistent-stores/entrypoint-store";
import {
  createSettingsStore,
  type SettingsStore,
} from "./stores/persistent-stores/settings-store";
import { readonlyPageData } from "./stores/readonly-page-data";
import { createRevealedEpisodesStore } from "./stores/temporary-global-stores/revealed-episodes-store";
import { createScoreStore } from "./stores/temporary-global-stores/score-store";

async function main() {
  // 不在超展开页面执行。
  // NOTE: 在超展开页面，即使已经登录，`window.CHOBITS_UID` 也没有被定义。
  if (/^\/rakuen(\/|$)/.test(window.location.pathname)) {
    return;
  }

  await migrate();

  const settingsStore = createSettingsStore();

  const entrypointStore = createEntryPointStore({
    defaultAuthEntrypoint: DEFAULT_AUTH_ENTRYPOINT,
    defaultApiEntrypoint: DEFAULT_API_ENTRYPOINT,
  });
  const authClient = new AuthClient({ entrypointStore });
  const authStore = createAuthStore({ authClient });
  const appClient = new AppClient({ entrypointStore, authStore });
  const bgmClient = new BangumiClient();

  setUpAuthRelatedStuff({ authStore });

  setUpCustomizationPanelTab({ settingsStore, authStore, appClient });

  const revealedEpisodesStore = createRevealedEpisodesStore({ settingsStore });
  const scoreStore = //
    createScoreStore({ authStore, appClient, revealedEpisodesStore });

  switch (detectPageType()) {
    case "root": {
      processRootPage({
        settingsStore,
        appClient,
        bgmClient,
        authStore,
        scoreStore,
        revealedEpisodesStore,
      });
      break;
    }
    case "subject": {
      const subjectId = readonlyPageData.subjectId;
      if (subjectId) {
        processSubjectPage({
          appClient,
          authStore,
          scoreStore,
          revealedEpisodesStore,
          subjectId,
        });
      }

      break;
    }
    case "subject_ep_list": {
      const subjectId = readonlyPageData.subjectId;
      if (subjectId) {
        processSubjectEpListPage({
          appClient,
          authStore,
          scoreStore,
          revealedEpisodesStore,
          subjectId,
        });
      }
      break;
    }
    case "ep": {
      const subjectId = readonlyPageData.subjectId;
      const episodeId = readonlyPageData.episodeId;
      if (subjectId && episodeId) {
        processEpPage({
          settingsStore,
          appClient,
          authStore,
          scoreStore,
          revealedEpisodesStore,
          subjectId,
          episodeId,
        });
      }
      break;
    }
    default:
      // no-op
  }
}

async function migrate() {
  const LEGACI_LOCAL_STORAGE_KEY_SESSION_TOKEN = "bgm_ep_ratings_token";
  const LEGACY_LOCAL_STORAGE_KEY_ACCESS_TOKEN = "bgm_ep_ratings_jwt";

  const legacy_session_token = localStorage
    .getItem(LEGACI_LOCAL_STORAGE_KEY_SESSION_TOKEN);
  if (legacy_session_token) {
    localStorage.setItem(LOCAL_STORAGE_KEY_SESSION_TOKEN, legacy_session_token);
    localStorage.removeItem(LEGACI_LOCAL_STORAGE_KEY_SESSION_TOKEN);
    localStorage.removeItem(LEGACY_LOCAL_STORAGE_KEY_ACCESS_TOKEN);
  }
}

function setUpAuthRelatedStuff({ authStore }: { authStore: AuthStore }) {
  { // `showCustomizePanelWithTab` 用不了的替代方案：
    const aEl = document.querySelector(
      '[href="https://_/__umajho_bangumi_eprt__anchor_auth_status"]',
    );
    if (!aEl) return;
    const sectionAuthEl = //
      createSettingsTabSectionAuthInTheWildInstance({ authStore });
    aEl.replaceWith(sectionAuthEl.element);
  }

  const searchParams = new URLSearchParams(window.location.search);
  const tokenCoupon = searchParams.get(LEGACY_SEARCH_PARAMS_KEY_TOKEN_COUPON);
  if (tokenCoupon) {
    searchParams.delete(LEGACY_SEARCH_PARAMS_KEY_TOKEN_COUPON);
    let newURL = `${window.location.pathname}`;
    if (searchParams.size) {
      newURL += `?${searchParams.toString()}`;
    }
    window.history.replaceState(null, "", newURL);

    // 没用，也许是还没准备好：
    // chiiLib.ukagaka.showCustomizePanelWithTab(EPRT_ID_HTML_SAFE);

    authStore.redeemTokenCoupon(tokenCoupon);
  }
}

function setUpCustomizationPanelTab(opts: {
  settingsStore: SettingsStore;
  authStore: AuthStore;
  appClient: AppClient;
}) {
  chiiLib.ukagaka.addPanelTab({
    tab: EPRT_ID_HTML_SAFE,
    label: "单集评分",
    type: "custom",
    customContent: () => {
      const r = registerSettingsTab(opts);
      if (!/^[a-z-]+$/.test(r.tagName)) {
        throw new Error(
          `No way the tag name is \`${
            JSON.stringify(r.tagName)
          }\`. To prevent XSS, an error is thrown.`,
        );
      }
      return `<${r.tagName}></${r.tagName}>`;
    },
  });
}

type BANGUMI_PAGE_TYPE = "root" | "subject" | "subject_ep_list" | "ep";

function detectPageType(): BANGUMI_PAGE_TYPE | null {
  const pathParts = window.location.pathname.split("/").filter(Boolean);
  if (!pathParts.length) {
    return "root";
  } else if (pathParts.length === 2 && pathParts[0] === "subject") {
    return "subject";
  } else if (
    pathParts.length === 3 &&
    pathParts[0] === "subject" && pathParts[2] === "ep"
  ) {
    return "subject_ep_list";
  } else if (pathParts.length === 2 && pathParts[0] === "ep") {
    return "ep";
  } else {
    return null;
  }
}

main();
