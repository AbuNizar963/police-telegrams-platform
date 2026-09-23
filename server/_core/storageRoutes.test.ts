import { describe, expect, it } from "vitest";
import { canAccessStorageKey } from "../storage";
import type { User } from "../../drizzle/schema";

const user: Pick<User, "id" | "role"> = {
  id: 7,
  role: "user",
};

const admin: Pick<User, "id" | "role"> = {
  id: 99,
  role: "admin",
};

describe("storage key authorization", () => {
  it("allows an officer to access only their own attachment prefix", () => {
    expect(canAccessStorageKey("telegrams/7/report.pdf", user)).toBe(true);
    expect(canAccessStorageKey("telegrams/8/report.pdf", user)).toBe(false);
  });

  it("allows administrators to access valid telegram attachment keys", () => {
    expect(canAccessStorageKey("telegrams/7/report.pdf", admin)).toBe(true);
  });

  it("rejects malformed or traversal keys", () => {
    expect(canAccessStorageKey("other/7/report.pdf", user)).toBe(false);
    expect(canAccessStorageKey("telegrams/7/../private.pdf", user)).toBe(false);
    expect(canAccessStorageKey("telegrams/not-a-user/report.pdf", user)).toBe(
      false,
    );
  });
});
