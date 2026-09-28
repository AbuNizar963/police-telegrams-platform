import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  getUser: vi.fn(),
  upsertUser: vi.fn(),
  getUserByOpenId: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mocked.getUser },
  })),
}));

vi.mock("./db", () => ({
  upsertUser: mocked.upsertUser,
  getUserByOpenId: mocked.getUserByOpenId,
}));

describe("Supabase Auth server adapter", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_PUBLISHABLE_KEY = "publishable-test-key";
    mocked.upsertUser.mockResolvedValue(undefined);
    mocked.getUserByOpenId.mockResolvedValue({
      id: 7,
      openId: "supabase-user-7",
      name: "ضابط الاختبار",
      email: "officer@example.com",
      loginMethod: "email",
      role: "user",
    });
  });

  it("verifies the bearer token and synchronizes the Supabase identity", async () => {
    mocked.getUser.mockResolvedValue({
      data: {
        user: {
          id: "supabase-user-7",
          email: "officer@example.com",
          user_metadata: { full_name: "ضابط الاختبار" },
          app_metadata: { provider: "email" },
        },
      },
      error: null,
    });
    const { authenticateSupabaseRequest, isSupabaseAuthConfigured } =
      await import("./_core/supabaseAuth");

    const result = await authenticateSupabaseRequest({
      headers: { authorization: "Bearer access-token" },
    } as never);

    expect(isSupabaseAuthConfigured).toBe(true);
    expect(mocked.getUser).toHaveBeenCalledWith("access-token");
    expect(mocked.upsertUser).toHaveBeenCalledWith(
      expect.objectContaining({
        openId: "supabase-user-7",
        name: "ضابط الاختبار",
        email: "officer@example.com",
        loginMethod: "email",
      })
    );
    expect(result?.openId).toBe("supabase-user-7");
  });

  it("rejects a missing or invalid bearer token without touching the database", async () => {
    mocked.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: "Invalid JWT" },
    });
    const { authenticateSupabaseRequest } = await import(
      "./_core/supabaseAuth"
    );

    const result = await authenticateSupabaseRequest({
      headers: {},
    } as never);

    expect(result).toBeNull();
    expect(mocked.getUser).not.toHaveBeenCalled();
    expect(mocked.upsertUser).not.toHaveBeenCalled();
  });

  it("supports the VITE-prefixed Supabase URL used by Vercel builds", async () => {
    delete process.env.SUPABASE_URL;
    process.env.VITE_SUPABASE_URL = "https://vercel-project.supabase.co";
    const { isSupabaseAuthConfigured } = await import("./_core/supabaseAuth");

    expect(isSupabaseAuthConfigured).toBe(true);
  });
});
