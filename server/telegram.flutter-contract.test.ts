import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const fixture = {
  id: 7,
  serialNumber: 1001,
  serialCode: "POL-2026-09-29-01001",
  createdByUserId: 42,
  creatorName: "موظف",
  creatorEmail: "officer@example.com",
  creatorBadgeId: null,
  organizationId: "00000000-0000-4000-8000-000000000007",
  currentOrganizationId: "00000000-0000-4000-8000-000000000007",
  creatorIp: null,
  creatorFingerprint: null,
  subject: "موضوع اختبار العقد",
  recipient: "غرفة العمليات",
  body: "محتوى البرقية",
  classification: "normal",
  priority: "urgent",
  category: "security",
  status: "pending",
  attachmentManifest: null,
  gpsLatitude: null,
  gpsLongitude: null,
  telegramDate: new Date("2026-09-29T08:30:00.000Z"),
  archivedAt: null,
  createdAt: new Date("2026-09-29T08:30:00.000Z"),
  updatedAt: new Date("2026-09-29T08:30:00.000Z"),
};

const db = vi.hoisted(() => ({
  getTelegramById: vi.fn(),
}));
const organizations = vi.hoisted(() => ({
  getOrganizationByIdIncludingInactive: vi.fn(),
  getUserOrganizationMembership: vi.fn(),
}));
vi.mock("./db", async importOriginal => ({
  ...(await importOriginal<typeof import("./db")>()),
  ...db,
}));
vi.mock("./organization", async importOriginal => ({
  ...(await importOriginal<typeof import("./organization")>()),
  ...organizations,
}));

function callerContext(): TrpcContext {
  return {
    user: {
      id: 42,
      authUserId: "00000000-0000-4000-8000-000000000042",
      name: "موظف",
      badgeNumber: null,
      email: "officer@example.com",
      loginMethod: "local",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

function dartFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    return entry.isDirectory()
      ? dartFiles(path)
      : path.endsWith(".dart")
        ? [path]
        : [];
  });
}

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const dartRoot = join(repositoryRoot, "mobile", "lib");
const dartSource = existsSync(dartRoot)
  ? dartFiles(dartRoot)
      .map(path => readFileSync(path, "utf8"))
      .join("\n")
  : "";
const requiredMobileProcedures = [
  "telegrams.get",
  "telegrams.list",
  "telegrams.actions",
  "telegrams.attachments",
  "telegrams.versions",
  "telegrams.incomingRoutes",
];
const flutterProcedures = dartSource
  ? [
      ...dartSource.matchAll(
        /\.call\s*\(\s*['"]([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+)['"]/g
      ),
    ]
      .map(match => match[1]!)
      .filter(name => !name.startsWith("https."))
  : requiredMobileProcedures;

function routerProcedure(path: string): unknown {
  let node: any = (appRouter as any)._def.record;
  for (const segment of path.split(".")) {
    node = node?.[segment]?._def?.record ?? node?.[segment];
  }
  return node?._def?.procedure;
}

describe("Flutter tRPC API contract", () => {
  it("exposes every statically named Flutter procedure", () => {
    expect(flutterProcedures.length).toBeGreaterThan(0);
    const missing = [...new Set(flutterProcedures)].filter(
      path => !routerProcedure(path)
    );
    expect(missing).toEqual([]);
  });

  it("accepts only a positive integer id and returns the runtime telegram contract", async () => {
    db.getTelegramById.mockResolvedValue(fixture);
    organizations.getOrganizationByIdIncludingInactive.mockResolvedValue({
      id: fixture.organizationId,
      name: "قسم شرطة الاختبار",
    });
    organizations.getUserOrganizationMembership.mockResolvedValue({
      organizationId: fixture.organizationId,
      role: "member",
      isActive: true,
    });
    const caller = appRouter.createCaller(callerContext());
    for (const id of [0, -1, 1.5, "7", null]) {
      await expect(
        caller.telegrams.get({ id: id as number })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }

    const result = await caller.telegrams.get({ id: 7 });
    const contract: Record<string, (value: unknown) => boolean> = {
      id: Number.isInteger,
      serialNumber: Number.isInteger,
      serialCode: value => typeof value === "string",
      createdByUserId: Number.isInteger,
      creatorName: value => typeof value === "string",
      creatorEmail: value => typeof value === "string",
      creatorBadgeId: value => value === null || typeof value === "string",
      organizationId: value => typeof value === "string",
      currentOrganizationId: value => typeof value === "string",
      subject: value => typeof value === "string",
      recipient: value => typeof value === "string",
      body: value => typeof value === "string",
      classification: value => typeof value === "string",
      priority: value => typeof value === "string",
      category: value => typeof value === "string",
      status: value => typeof value === "string",
      senderOrganizationName: value =>
        value === null || typeof value === "string",
      attachmentManifest: value =>
        value === null || Array.isArray(value) || typeof value === "object",
      gpsLatitude: value => value === null || typeof value === "number",
      gpsLongitude: value => value === null || typeof value === "number",
      telegramDate: value => value instanceof Date || typeof value === "string",
      createdAt: value => value instanceof Date || typeof value === "string",
    };
    for (const [field, accepts] of Object.entries(contract)) {
      expect(accepts((result as any)[field]), `${field} type/nullability`).toBe(
        true
      );
    }
    expect(result).toMatchObject({
      id: 7,
      serialNumber: 1001,
      serialCode: "POL-2026-09-29-01001",
      subject: "موضوع اختبار العقد",
      recipient: "غرفة العمليات",
      body: "محتوى البرقية",
      classification: "normal",
      priority: "urgent",
      category: "security",
      status: "pending",
      organizationId: fixture.organizationId,
      currentOrganizationId: fixture.currentOrganizationId,
      creatorName: "موظف",
      creatorEmail: "officer@example.com",
      senderOrganizationName: "قسم شرطة الاختبار",
      attachmentManifest: null,
      gpsLatitude: null,
      gpsLongitude: null,
    });
  });

  it("keeps the fields consumed by Flutter represented in the checked contract", () => {
    const consumed = [
      "id",
      "serialNumber",
      "serialCode",
      "creatorName",
      "organizationId",
      "currentOrganizationId",
      "subject",
      "recipient",
      "body",
      "classification",
      "priority",
      "category",
      "status",
      "senderOrganizationName",
      "gpsLatitude",
      "gpsLongitude",
      "telegramDate",
      "createdAt",
    ];
    const contractFields = new Set([
      "id",
      "serialNumber",
      "serialCode",
      "createdByUserId",
      "creatorName",
      "creatorEmail",
      "creatorBadgeId",
      "organizationId",
      "currentOrganizationId",
      "subject",
      "recipient",
      "body",
      "classification",
      "priority",
      "category",
      "status",
      "senderOrganizationName",
      "attachmentManifest",
      "gpsLatitude",
      "gpsLongitude",
      "telegramDate",
      "createdAt",
    ]);
    const missing = consumed.filter(
      field =>
        !contractFields.has(field) ||
        (dartSource.length > 0 &&
          !new RegExp(`\\[['"]${field}['"]\\]`).test(dartSource))
    );
    expect(missing).toEqual([]);
  });
});
