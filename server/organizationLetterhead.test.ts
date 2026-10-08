import { describe, expect, it } from "vitest";
import { resolveOrganizationLetterhead } from "./organizationLetterhead";

describe("resolveOrganizationLetterhead", () => {
  const shahbaa = "قسم شرطة الشهباء";
  const aleppoGovernorate = "قيادة الأمن الداخلي في محافظة حلب";

  it("replaces inherited parent identity in both header fields with the active organization name", () => {
    expect(
      resolveOrganizationLetterhead(
        {
          departmentName: aleppoGovernorate,
          unitName: aleppoGovernorate,
        },
        shahbaa,
        aleppoGovernorate
      )
    ).toEqual({ departmentName: shahbaa, unitName: shahbaa });
  });

  it("preserves custom names that differ from the parent organization", () => {
    expect(
      resolveOrganizationLetterhead(
        {
          departmentName: "قسم شرطة الشهباء",
          unitName: "وحدة العمليات الخاصة",
        },
        shahbaa,
        aleppoGovernorate
      )
    ).toEqual({
      departmentName: "قسم شرطة الشهباء",
      unitName: "وحدة العمليات الخاصة",
    });
  });

  it("leaves settings unchanged when parent identity is unavailable", () => {
    const settings = {
      departmentName: aleppoGovernorate,
      unitName: aleppoGovernorate,
    };

    expect(resolveOrganizationLetterhead(settings, shahbaa, null)).toBe(
      settings
    );
  });
});
