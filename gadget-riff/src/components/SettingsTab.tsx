import {
  type Component,
  createMemo,
  createSignal,
  Index,
  type JSX,
  Match,
  Show,
  Switch,
} from "solid-js";
import { customElement, noShadowDOM } from "solid-element";

import { makeCustomElementTagName } from "../definitions";
import type {
  SettingsStatus,
} from "../stores/persistent-stores/settings-store";
import { PleaseDoAuth } from "./PleaseDoAuth";
import { ErrorMessage } from "./errors";
import { L } from "./utils";
import { readonlyPageData } from "../stores/readonly-page-data";
import type { PrimalContext } from "../context";

const TAG_NAME = makeCustomElementTagName("settings-tab");
const TAG_NAME_SECTION_AUTH_IN_THE_WILD = //
  makeCustomElementTagName("settings-tab-section-auth-in-the-wild");

let elementConstructor: CustomElementConstructor | null = null;
let elementConstructorSectionAuth: CustomElementConstructor | null = null;

export function registerSettingsTab(
  ctx: PrimalContext,
): { tagName: typeof TAG_NAME } {
  elementConstructor ??= customElement(TAG_NAME, {}, () => {
    noShadowDOM();

    return <SettingsTab ctx={ctx} />;
  });

  return { tagName: TAG_NAME };
}

const SettingsTab: Component<{ ctx: PrimalContext }> = (props) => {
  const status = props.ctx.settingsStore.getStatusSignal();

  return (
    <div
      style={status().saving ? { cursor: "wait" } : undefined}
    >
      <Switch>
        <Match when={status().saving}>
          正在保存…
        </Match>
        <Match when={status().error}>
          {(error) => <ErrorMessage message={error()} />}
        </Match>
        <Match when={true}>
          <br />
        </Match>
      </Switch>

      <div style={{ "text-align": "center" }}>
        <L _blank href={readonlyPageData.gadgetPagePath}>组件页</L>
      </div>
      <SectionAuth ctx={props.ctx} />
      <SectionExportData ctx={props.ctx} />
      <SectionAntiSpoiler ctx={props.ctx} status={status()} />
      <SectionAntiSpoilerForMusic ctx={props.ctx} status={status()} />
      <SectionTimelineTabButtonLocation ctx={props.ctx} status={status()} />
      <SectionEpisodePageOverviewStyle ctx={props.ctx} status={status()} />
    </div>
  );
};

export function createSettingsTabSectionAuthInTheWildInstance(
  ctx: PrimalContext,
) {
  const r = registerSettingsTabSectionAuthInTheWild(ctx);
  const el = document.createElement(r.tagName);
  return { element: el };
}

function registerSettingsTabSectionAuthInTheWild(
  ctx: PrimalContext,
): { tagName: typeof TAG_NAME_SECTION_AUTH_IN_THE_WILD } {
  elementConstructorSectionAuth ??= customElement(
    TAG_NAME_SECTION_AUTH_IN_THE_WILD,
    {},
    () => {
      noShadowDOM();

      return <SectionAuthInTheWild ctx={ctx} />;
    },
  );

  return { tagName: TAG_NAME_SECTION_AUTH_IN_THE_WILD };
}

const SectionAuthInTheWild: Component<{ ctx: PrimalContext }> = (props) => {
  return (
    <div style={{ "border-style": "dotted" }}>
      <SectionAuth ctx={props.ctx} />
    </div>
  );
};

const SectionAuth: Component<{ ctx: PrimalContext }> = (props) => {
  return (
    <DisableableSection disabled={false}>
      <div class="title">身份认证（用于单集评分服务器）</div>
      <div style={{ display: "flex", "justify-content": "space-between" }}>
        <div>状态</div>
        <div style={{ display: "flex", "flex-direction": "column" }}>
          <div>
            <Switch>
              <Match when={props.ctx.authStore.statusUnion().noSessionToken}>
                <PleaseDoAuth ctx={props.ctx} />
              </Match>
              <Match when={props.ctx.authStore.statusUnion().withSessionToken}>
                <span style={{ color: "green" }}>已取得身份认证令牌。</span>
                {/* TODO: 允许 deactivate 该令牌。 */}
              </Match>
              <Match
                when={props.ctx.authStore.statusUnion().redeemingSessionToken}
              >
                <span style={{ color: "orange" }}>正在兑换身份认证令牌…</span>
              </Match>
            </Switch>
          </div>
          <Show when={props.ctx.authStore.tabClosureCountdownSeconds()}>
            {(countdown) => (
              <div>
                此标签页将于 <span style={{ color: "red" }}>{countdown()}</span>
                {" "}
                秒后自动关闭。
                <br />
                <button
                  onClick={() => props.ctx.authStore.stopTabClosureCountdown()}
                >
                  不要自动关闭！
                </button>
              </div>
            )}
          </Show>
        </div>
      </div>
    </DisableableSection>
  );
};

const SectionExportData: Component<{ ctx: PrimalContext }> = (props) => {
  type State = ["normal"] | ["processing"] | ["error", string];
  type StateUnion = {
    normal?: true;
    processing?: true;
    error?: { message: string };
  };

  const hasSessionToken = () =>
    props.ctx.authStore.statusUnion().withSessionToken;

  const [state, setState] = createSignal<State>(["normal"]);
  const stateUnion = createMemo((): StateUnion => {
    const s = state();
    switch (s[0]) {
      case "normal":
        return { normal: true };
      case "processing":
        return { processing: true };
      case "error":
        return { error: { message: s[1] } };
      default:
        s[0] satisfies never;
        throw new Error("unreachable!");
    }
  });

  async function exportData() {
    setState(["processing"]);

    const resp = await props.ctx.appClient.downloadMyEpisodeRatingsData();
    switch (resp[0]) {
      case "ok": {
        setState(["normal"]);
        break;
      }
      case "error": {
        setState(["error", resp[2]]);
        break;
      }
      case "auth_required": {
        props.ctx.authStore.clear();
        setState(["normal"]);
        break;
      }
      default:
        resp[0] satisfies never;
    }
  }

  return (
    <DisableableSection disabled={state()[0] === "processing"}>
      <div class="title">
        数据导出<span
          style={{ "color": hasSessionToken() ? undefined : "orange" }}
        >
          （需取得身份认证令牌）
        </span>
      </div>
      <Switch>
        <Match when={stateUnion().processing}>
          <div style={{ color: "gray" }}>处理中…</div>
        </Match>
        <Match when={stateUnion().error}>
          {(error) => <ErrorMessage message={error().message} />}
        </Match>
      </Switch>
      <button onClick={exportData} disabled={!hasSessionToken()}>
        导出我的单集评分数据
      </button>
    </DisableableSection>
  );
};

const SectionAntiSpoiler: Component<{
  ctx: PrimalContext;
  status: SettingsStatus;
}> = (props) => {
  const optAntiSpoiler = props.ctx.settingsStore.getAntiSpoilerSignal();

  return (
    <DisableableSection disabled={!!props.status.saving}>
      <div class="title">章节评分防剧透</div>
      <RadioGroup
        currentValue={optAntiSpoiler()}
        options={props.ctx.settingsStore.getAntiSpoilerValues()}
        getLabel={(value) =>
          props.ctx.settingsStore.getAntiSpoilerValueLabelText(value)}
        setValue={(v) => props.ctx.settingsStore.updateAntiSpoiler(v)}
      />
    </DisableableSection>
  );
};

const SectionAntiSpoilerForMusic: Component<{
  ctx: PrimalContext;
  status: SettingsStatus;
}> = (props) => {
  const optAntiSpoilerForMusic = props.ctx.settingsStore
    .getAntiSpoilerForMusicSignal();

  return (
    <DisableableSection disabled={!!props.status.saving}>
      <div class="title">音乐概览页面各曲目的整体评分</div>
      <RadioGroup
        currentValue={optAntiSpoilerForMusic()}
        options={props.ctx.settingsStore.getAntiSpoilerForMusicValues()}
        getLabel={(value) =>
          props.ctx.settingsStore.getAntiSpoilerForMusicValueLabelText(value)}
        setValue={(v) => props.ctx.settingsStore.updateAntiSpoilerForMusic(v)}
      />
    </DisableableSection>
  );
};

const SectionTimelineTabButtonLocation: Component<{
  ctx: PrimalContext;
  status: SettingsStatus;
}> = (props) => {
  const optTimelineTabButtonLocation = props.ctx.settingsStore
    .getTimelineTabButtonLocationSignal();

  return (
    <DisableableSection disabled={!!props.status.saving}>
      <div class="title">时间线标签页按钮位置</div>
      <RadioGroup
        currentValue={optTimelineTabButtonLocation()}
        options={props.ctx.settingsStore.getTimelineTabButtonLocationValues()}
        getLabel={(value) =>
          props.ctx.settingsStore.getTimelineTabButtonLocationValueLabelText(
            value,
          )}
        setValue={(v) =>
          props.ctx.settingsStore.updateTimelineTabButtonLocation(v)}
      />
    </DisableableSection>
  );
};

const SectionEpisodePageOverviewStyle: Component<{
  ctx: PrimalContext;
  status: SettingsStatus;
}> = (props) => {
  const optEpisodePageOverviewStyle = props.ctx.settingsStore
    .getEpisodePageOverviewStyleSignal();

  return (
    <DisableableSection disabled={!!props.status.saving}>
      <div class="title">章节页面概览显示风格</div>
      <RadioGroup
        currentValue={optEpisodePageOverviewStyle()}
        options={props.ctx.settingsStore.getEpisodePageOverviewStyleValues()}
        getLabel={(value) =>
          props.ctx.settingsStore.getEpisodePageOverviewStyleValueLabelText(
            value,
          )}
        setValue={(v) =>
          props.ctx.settingsStore.updateEpisodePageOverviewStyle(v)}
      />
    </DisableableSection>
  );
};

const DisableableSection: Component<{
  disabled: boolean;
  children: JSX.Element;
}> = (props) => {
  return (
    <div style={props.disabled ? { cursor: "not-allowed" } : undefined}>
      <div
        class="section"
        style={props.disabled
          ? { filter: "grayscale(100%)", "pointer-events": "none" }
          : undefined}
      >
        {props.children}
      </div>
    </div>
  );
};

function RadioGroup<T extends string>(props: {
  currentValue: T;
  options: T[];
  getLabel: (value: T) => string;
  setValue: (newValue: T) => void;
}) {
  return (
    <div class="options-container">
      <Index each={props.options}>
        {(value) => (
          <div class="option-item">
            <input
              type="radio"
              value={value()}
              checked={props.currentValue === value()}
              // 目前并不起作用：
              onInput={() => props.setValue(value())}
            />
            <label
              // 真正起作用的：
              onClick={() => props.setValue(value())}
            >
              <span class="radio-custom" />
              <span class="label-text">{props.getLabel(value())}</span>
            </label>
          </div>
        )}
      </Index>
    </div>
  );
}
