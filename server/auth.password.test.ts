import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./_core/auth";

describe("local password compatibility", () => {
  it("creates a scrypt hash that verifies with the original password", async () => {
    const password = "Existing-owner-password!2026";
    const encodedHash = await hashPassword(password);

    expect(encodedHash).toMatch(/^scrypt\$16384\$8\$1\$/);
    expect(await verifyPassword(password, encodedHash)).toBe(true);
  });

  it("rejects an incorrect password without changing the stored hash", async () => {
    const encodedHash = await hashPassword("Correct-password!2026");

    expect(await verifyPassword("Incorrect-password!2026", encodedHash)).toBe(
      false
    );
    expect(encodedHash).toMatch(/^scrypt\$16384\$8\$1\$/);
  });

  it.each([
    "",
    "not-a-hash",
    "scrypt$1$1$1$salt$hash",
    "scrypt$16384$8$1$invalid$invalid",
    "scrypt$16384$8$1$" + "A".repeat(16) + "$" + "B".repeat(86),
  ])("fails closed for malformed stored hashes: %s", async encodedHash => {
    await expect(verifyPassword("any-password", encodedHash)).resolves.toBe(
      false
    );
  });
});
