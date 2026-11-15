import { describe, expect, it } from "vitest";
import { isSessionVersionValid } from "./_core/auth";

const authUserId = "00000000-0000-4000-8000-000000000001";
const rotatedSessionVersion = "00000000-0000-4000-8000-000000000002";

describe("session version validation", () => {
  it("accepts legacy JWTs before the account session version is rotated", () => {
    expect(isSessionVersionValid(undefined, authUserId, authUserId)).toBe(true);
  });

  it("rejects legacy JWTs after the account session version is rotated", () => {
    expect(
      isSessionVersionValid(undefined, rotatedSessionVersion, authUserId)
    ).toBe(false);
  });

  it("accepts a JWT with the current session version", () => {
    expect(
      isSessionVersionValid(
        rotatedSessionVersion,
        rotatedSessionVersion,
        authUserId
      )
    ).toBe(true);
  });

  it("rejects a JWT with an outdated session version", () => {
    expect(
      isSessionVersionValid(authUserId, rotatedSessionVersion, authUserId)
    ).toBe(false);
  });
});
