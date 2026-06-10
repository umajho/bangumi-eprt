import type { Context } from "../context";
import type { SubjectId } from "../definitions";
import { processCluetip } from "../element-processors/cluetip";
import { processMusicSubjectEpSection } from "../element-processors/music-subject-ep-section";
import { processPrgList } from "../element-processors/prg-list";

export function processSubjectPage(ctx: Context, opts: {
  subjectId: SubjectId;
}) {
  const { initializeCluetip } = processCluetip(ctx);

  const prgListEl = document.querySelector("ul.prg_list");
  if (prgListEl) {
    processPrgList(ctx, {
      initializeCluetip,
      prgListElement: prgListEl as HTMLUListElement,
      subjectId: opts.subjectId,
    });
  }

  if (
    document.querySelector("#headerSubject")?.getAttribute("typeof") ===
      "v:Music"
  ) {
    const subjectEpSection = document
      .querySelector<HTMLDivElement>(".subject_ep_section");
    if (subjectEpSection) {
      processMusicSubjectEpSection(ctx, {
        subjectEpSection,
        subjectId: opts.subjectId,
      });
    }
  }
}
