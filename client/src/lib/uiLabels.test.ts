import { describe, expect, it } from "vitest";
import { categoryLabels, priorityLabels, statusLabels } from "./uiLabels";

describe("canonical Arabic UI labels", () => {
  it("uses the approved priority wording and order", () => {
    expect(Object.keys(priorityLabels)).toEqual(["urgent", "normal", "slow"]);
    expect(priorityLabels).toEqual({
      urgent: "عاجلة",
      normal: "عادية",
      slow: "بطيئة",
    });
  });

  it("uses the approved category terminology", () => {
    expect(Object.keys(categoryLabels).slice(0, 4)).toEqual([
      "administrative",
      "criminal",
      "traffic",
      "security",
    ]);
    expect(categoryLabels.tactical).toBe("عملياتي");
    expect(categoryLabels.training).toBe("تدريب وتأهيل");
    expect(categoryLabels.community).toBe("مجتمعي وشكاوى");
  });

  it("keeps every workflow status labeled", () => {
    expect(statusLabels.submitted).toBe("مرسلة للمراجعة");
    expect(statusLabels.pending).toBe("قيد الانتظار");
    expect(statusLabels.in_progress).toBe("قيد الإجراء");
    expect(statusLabels.resolved).toBe("منجزة");
    expect(statusLabels.archived).toBe("مؤرشفة");
  });
});
