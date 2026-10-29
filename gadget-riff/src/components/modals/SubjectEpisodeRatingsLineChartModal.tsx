import { createMemo, createSignal, Show, untrack } from "solid-js";
import { render } from "solid-js/web";

import type { Context } from "../../context";
import { makeHtmlId, type SubjectId } from "../../definitions";
import {
  type DataPoint,
  type DataShown,
  SubjectEpisodeRatingsLineChart,
} from "../vibe-zone/SubjectEpisodeRatingsLineChart/SubjectEpisodeRatingsLineChart";

const DIALOG_ID = makeHtmlId("subject-episode-ratings-line-chart-modal-dialog");

interface Options {
  subjectId: SubjectId;
  dataPoints: DataPoint[];
}

export interface SubjectEpisodeRatingsLineChartModalInstance {
  open(opts: Options): void;
  close(): void;
}

let instance: SubjectEpisodeRatingsLineChartModalInstance | null = null;

export function getSubjectEpisodeRatingsLineChartModalSingletonInstance(
  ctx: Context,
) {
  return instance ??= ((): SubjectEpisodeRatingsLineChartModalInstance => {
    const dataShownDefaultRaw = ctx.settingsStore
      .getSubjectEpisodeRatingsLineChartDataShownOnOpenSignal();
    const dataShownDefault = createMemo(() => {
      switch (dataShownDefaultRaw()) {
        case "overall":
          return { overallRating: true, myRating: false };
        case "my":
          return { overallRating: false, myRating: true };
        case "overall+my":
        default:
          return { overallRating: true, myRating: true };
      }
    });

    const wrapper = document.createElement("div");
    document.body.appendChild(wrapper);

    const [opts, setOpts] = createSignal<Options | null>(null);
    const [dataShown, setDataShown] = //
      createSignal<DataShown>(untrack(dataShownDefault));

    render(() => {
      // oxlint-disable-next-line no-unassigned-vars
      let ref!: HTMLDialogElement;

      return (
        <dialog id={DIALOG_ID} ref={ref}>
          <Show when={opts()}>
            {(opts) => {
              return (
                <div class="modal-panel" style={{ display: "block" }}>
                  <div class="header">
                    <h4>单集评分折线图</h4>
                    <span class="close" onClick={() => ref.close()}>
                      关闭
                    </span>
                  </div>
                  <div
                    class="content"
                    style={{
                      "margin-top": 0,
                      "margin-right": 0,
                      "margin-left": 0,
                      "padding-top": 0,
                      "padding-right": 0,
                      "padding-left": 0,
                    }}
                  >
                    <div
                      class="section"
                      style={{
                        "margin-top": 0,
                        "margin-right": 0,
                        "margin-left": 0,
                        "padding-top": 0,
                        "padding-right": 0,
                        "padding-left": 0,
                      }}
                    >
                      <SubjectEpisodeRatingsLineChart
                        ctx={ctx}
                        subjectId={opts().subjectId}
                        dataPoints={opts().dataPoints}
                        dataShown={dataShown()}
                        setDataShown={setDataShown}
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
        setDataShown(untrack(dataShownDefault));
        dialogEl.showModal();
      },
      close() {
        dialogEl.close();
        setOpts(null);
      },
    };
  })();
}
