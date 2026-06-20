import { type Component, Show } from "solid-js";
import { customElement, noShadowDOM } from "solid-element";

import type { Context } from "../context";
import { makeCustomElementTagName } from "../definitions";

const TAG_NAME = makeCustomElementTagName("music-track-list-rater-switch");

export function createMusicTrackListRaterSwitchInstance(ctx: Context) {
  registerMusicTrackListRaterSwitch(ctx);
  const el = document.createElement(TAG_NAME);

  return { element: el };
}

let elementConstructor: CustomElementConstructor | null = null;

function registerMusicTrackListRaterSwitch(ctx: Context) {
  elementConstructor ??= customElement(TAG_NAME, {}, () => {
    noShadowDOM();

    return <MusicTrackListRaterSwitch ctx={ctx} />;
  });
}

const MusicTrackListRaterSwitch: Component<{
  ctx: Context;
}> = (props) => {
  const displayOption = props.ctx.settingsStore
    .getMusicSubjectPageTrackListRaterDisplaySignal();

  return (
    <Show when={displayOption() === "switch"}>
      <label style={{ float: "right" }}>
        <div
          style={{ display: "flex", "align-items": "center", gap: "0.125rem" }}
        >
          <input
            type="checkbox"
            checked={props.ctx.miscStore.shouldShowRater()}
            onInput={(e) =>
              props.ctx.miscStore.setShouldShowRater(e.currentTarget.checked)}
          >
          </input>
          <div style={{ "font-size": "small", "user-select": "none" }}>
            评分模式
          </div>
        </div>
      </label>
    </Show>
  );
};
