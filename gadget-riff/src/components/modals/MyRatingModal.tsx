import { createEffect, createSignal, Show } from "solid-js";
import { render } from "solid-js/web";

import type { Context } from "../../context";
import { type EpisodeId, makeHtmlId, type SubjectId } from "../../definitions";
import { MyRating } from "../MyRating";

const DIALOG_ID = makeHtmlId("my-rating-modal-dialog");

interface Options {
  prefersFetchingCompleteSubjectVotes: boolean;
  subjectId: SubjectId;
  episodeId: EpisodeId;
}

export interface MyRatingModalInstance {
  open(opts: Options): void;
  close(): void;
}

let instance: MyRatingModalInstance | null = null;

export function getMyRatingModalSingletonInstance(ctx: Context) {
  return instance ??= ((): MyRatingModalInstance => {
    const wrapper = document.createElement("div");
    document.body.appendChild(wrapper);

    const [opts, setOpts] = createSignal<Options | null>(null);

    render(() => {
      // oxlint-disable-next-line no-unassigned-vars
      let ref!: HTMLDialogElement;

      return (
        <dialog id={DIALOG_ID} ref={ref}>
          <Show when={opts()}>
            {(opts) => {
              const [epTitle, setEpTitle] = createSignal<string | null>(null);

              createEffect(() => {
                // 由于曲目信息已经预先在 `music-subject-ep-section.ts` 中填充了
                // 缓存，此处的 Promise 会立即有结果，因此不会有 race condition。
                ctx.bgmClient.getEpisodeTitle(opts().episodeId)
                  .then(setEpTitle);
              });

              return (
                <div class="modal-panel" style={{ display: "block" }}>
                  <div class="header">
                    <h4>单集评分：{epTitle() ?? "…"}</h4>
                    <span class="close" onClick={() => ref.close()}>
                      关闭
                    </span>
                  </div>
                  <div class="content">
                    <div class="section">
                      <MyRating
                        displayMode="normal"
                        noFloat
                        shouldEnableVisibilityControl
                        prefersFetchingCompleteSubjectVotes={opts()
                          .prefersFetchingCompleteSubjectVotes}
                        ctx={ctx}
                        subjectId={opts().subjectId}
                        episodeId={opts().episodeId}
                        isPrimary
                      />
                    </div>
                  </div>
                </div>
              );
            }}
          </Show>
        </dialog>
      );
    }, wrapper);

    const dialogEl = wrapper.firstChild! as HTMLDialogElement;

    return {
      open(opts) {
        setOpts(opts);
        dialogEl.showModal();
      },
      close() {
        dialogEl.close();
        setOpts(null);
      },
    };
  })();
}
