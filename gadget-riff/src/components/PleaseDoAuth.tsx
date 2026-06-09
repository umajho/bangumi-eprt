import { type Component, Show } from "solid-js";

import type { AuthStore } from "../stores/persistent-stores/auth-store";
import { L } from "./utils";

export const PleaseDoAuth: Component<{
  authStore: AuthStore;
  shorter?: boolean;
}> = (props) => {
  return (
    <div>
      <Show when={!props.shorter}>
        尚未取得用于身份认证的令牌。
        <br />
      </Show>
      若要查看自己非公开评分或提交评分，
      <br />
      请<L _blank href={props.authStore.URL_AUTH_BANGUMI_PAGE}>
        授权此应用
      </L>。（用于确认登录者）
    </div>
  );
};

export const PleaseDoRefetch: Component<{ onRequestRefetch: () => void }> = (
  props,
) => {
  return (
    <div>
      点击<button onClick={props.onRequestRefetch}>
        此处
      </button>或刷新本页以获取。
    </div>
  );
};
