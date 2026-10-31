import { describe, expect, it } from "vitest";
import { getIssuedLetterheadForContentEdit } from "./issuedTelegramLetterhead";

const oldLetterhead = {
  organizationId: "org-1",
  organizationName: "قسم شرطة الشهباء",
  departmentName: "قسم شرطة الشهباء",
  unitChiefRank: "المقدم",
  unitChiefName: "غسان صالح كنو",
  logoStorageKey: "department/logos/org-1/old-logo.png",
};

describe("getIssuedLetterheadForContentEdit", () => {
  it("keeps the first issuer when later content snapshots contain current settings", () => {
    const versions = [
      { snapshot: { letterhead: oldLetterhead } },
      {
        snapshot: {
          letterhead: {
            ...oldLetterhead,
            unitChiefRank: "العقيد",
            unitChiefName: "الرئيس الجديد",
            logoStorageKey: "department/logos/org-1/new-logo.png",
          },
        },
      },
    ];

    expect(getIssuedLetterheadForContentEdit(versions, "org-1")).toEqual(
      oldLetterhead
    );
  });

  it("uses the most recent reissue identity as the new issuance anchor", () => {
    const reissuedLetterhead = {
      ...oldLetterhead,
      unitChiefRank: "العقيد",
      unitChiefName: "الرئيس الجديد",
      logoStorageKey: "department/logos/org-1/reissued-logo.png",
    };
    const versions = [
      { snapshot: { letterhead: oldLetterhead } },
      {
        snapshot: {
          letterhead: reissuedLetterhead,
          issuance: { type: "reissue" },
        },
      },
      {
        snapshot: {
          letterhead: {
            ...reissuedLetterhead,
            unitChiefName: "بيانات حية لاحقة غير معتمدة",
          },
        },
      },
    ];

    expect(getIssuedLetterheadForContentEdit(versions, "org-1")).toEqual(
      reissuedLetterhead
    );
  });

  it("does not invent a historical signer when no saved issuance snapshot exists", () => {
    expect(
      getIssuedLetterheadForContentEdit(
        [{ snapshot: { subject: "برقية قديمة بلا لقطة تاريخية" } }],
        "org-1"
      )
    ).toBeNull();
  });

  it("rejects a letterhead belonging to another organization", () => {
    expect(
      getIssuedLetterheadForContentEdit(
        [
          {
            snapshot: {
              letterhead: { ...oldLetterhead, organizationId: "org-2" },
            },
          },
        ],
        "org-1"
      )
    ).toBeNull();
  });
});
