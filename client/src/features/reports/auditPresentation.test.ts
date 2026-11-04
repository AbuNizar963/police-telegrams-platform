import { describe, expect, it } from "vitest";
import {
  auditActionLabel,
  auditDeviceLabel,
  auditEntitySummary,
  auditUserAgentSummary,
  readableAuditFields,
} from "./auditPresentation";

describe("audit log presentation", () => {
  it("translates known actions and never exposes an unknown action code", () => {
    expect(auditActionLabel("telegram.create")).toBe("إنشاء برقية");
    expect(auditActionLabel("telegram.document.print")).toBe(
      "طباعة وثيقة برقية"
    );
    expect(auditActionLabel("unknown.action_code")).toBe("إجراء مسجل");
  });

  it("uses a readable resource reference and hides non-numeric IDs", () => {
    expect(auditEntitySummary("telegram", "93")).toBe("البرقية رقم 93");
    expect(
      auditEntitySummary("telegram", "550e8400-e29b-41d4-a716-446655440000")
    ).toBe("البرقية");
  });

  it("translates structured metadata and omits technical IDs and user agents", () => {
    const fields = readableAuditFields(
      JSON.stringify({
        serialNumber: 788,
        classification: "normal",
        format: "pdf",
        actorUserId: 23,
        userAgent: "Mozilla/5.0 (Android) Chrome/156.0",
      })
    );

    expect(fields.map(field => field.label)).toEqual([
      "رقم البرقية",
      "درجة السرية",
      "صيغة الملف",
    ]);
    expect(fields[1]?.value).toBe("عادية");
    expect(fields[2]?.value).toBe("ملف PDF");
    expect(fields.some(field => field.value.includes("Mozilla"))).toBe(false);
  });

  it("shows a friendly device and browser summary instead of raw user-agent text", () => {
    expect(auditDeviceLabel("mobile")).toBe("تطبيق الهاتف");
    expect(auditDeviceLabel("web")).toBe("موقع الويب");
    expect(
      auditUserAgentSummary(
        "Mozilla/5.0 (Linux; Android 10) AppleWebKit Chrome/156.0 Mobile Safari/537.36"
      )
    ).toBe("Google Chrome على Android");
  });
});
