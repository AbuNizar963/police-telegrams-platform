import { describe, expect, it } from "vitest";
import { assertProductionEnvironment, ENV } from "./env";

describe("assertProductionEnvironment", () => {
  const validEnvironment = {
    ...ENV,
    isProduction: true,
    supabaseUrl: "https://example.supabase.co",
    supabaseSecretKey: "sb_secret_test_key",
    authSessionSecret: "a".repeat(32),
  };

  it("accepts a valid production environment", () => {
    expect(() => assertProductionEnvironment(validEnvironment)).not.toThrow();
  });

  it("does not enforce production secrets in development", () => {
    expect(() =>
      assertProductionEnvironment({
        ...validEnvironment,
        isProduction: false,
        supabaseUrl: "",
        supabaseSecretKey: "",
        authSessionSecret: "",
      })
    ).not.toThrow();
  });

  it("rejects a missing Supabase secret key", () => {
    expect(() =>
      assertProductionEnvironment({
        ...validEnvironment,
        supabaseSecretKey: "",
      })
    ).toThrow("SUPABASE_SECRET_KEY");
  });

  it("rejects a missing or weak session secret", () => {
    expect(() =>
      assertProductionEnvironment({
        ...validEnvironment,
        authSessionSecret: "too-short",
      })
    ).toThrow("AUTH_SESSION_SECRET");
  });

  it("rejects malformed or non-HTTPS Supabase URLs", () => {
    expect(() =>
      assertProductionEnvironment({
        ...validEnvironment,
        supabaseUrl: "not-a-url",
      })
    ).toThrow("valid absolute URL");

    expect(() =>
      assertProductionEnvironment({
        ...validEnvironment,
        supabaseUrl: "http://localhost:54321",
      })
    ).toThrow("must use HTTPS");
  });
});
