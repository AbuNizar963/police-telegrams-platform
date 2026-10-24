import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRateLimit, resetRateLimitStoreForTests } from "./rateLimit";

function createResponse() {
  const headers = new Map<string, string>();
  let statusCode = 200;
  type FakeResponse = {
    setHeader: (name: string, value: string) => FakeResponse;
    status: (status: number) => FakeResponse;
    json: ReturnType<typeof vi.fn>;
  };
  const response: FakeResponse = {
    setHeader: (name: string, value: string) => {
      headers.set(name.toLowerCase(), value);
      return response;
    },
    status: (status: number) => {
      statusCode = status;
      return response;
    },
    json: vi.fn(() => response),
  };

  return {
    response: response as unknown as Response,
    headers,
    get statusCode() {
      return statusCode;
    },
  };
}

describe("createRateLimit", () => {
  beforeEach(() => {
    resetRateLimitStoreForTests();
  });

  it("allows requests within the window and rejects requests over the limit",
    () => {
      const middleware = createRateLimit({
        windowMs: 60_000,
        maxRequests: 2,
        keyGenerator: () => "test-client",
      });
      const next = vi.fn();

      const first = createResponse();
      middleware({} as Request, first.response, next);
      const second = createResponse();
      middleware({} as Request, second.response, next);
      const third = createResponse();
      middleware({} as Request, third.response, next);

      expect(next).toHaveBeenCalledTimes(2);
      expect(first.statusCode).toBe(200);
      expect(second.headers.get("ratelimit-remaining")).toBe("0");
      expect(third.statusCode).toBe(429);
      expect(third.headers.get("retry-after")).toBeDefined();
      expect(third.response.json).toHaveBeenCalledWith({
        error: "طلبات كثيرة؛ أعد المحاولة لاحقًا",
      });
    }
  );

  it("starts a fresh window after the current window expires", () => {
    vi.useFakeTimers();
    try {
      const middleware = createRateLimit({
        windowMs: 1_000,
        maxRequests: 1,
        keyGenerator: () => "test-client",
      });
      const next = vi.fn();

      middleware({} as Request, createResponse().response, next);
      const blocked = createResponse();
      middleware({} as Request, blocked.response, next);
      expect(blocked.statusCode).toBe(429);

      vi.advanceTimersByTime(1_001);
      const afterReset = createResponse();
      middleware({} as Request, afterReset.response, next);

      expect(afterReset.statusCode).toBe(200);
      expect(next).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects invalid limiter configuration", () => {
    expect(() => createRateLimit({ windowMs: 0, maxRequests: 1 })).toThrow(
      "Rate limit windowMs and maxRequests must be positive integers"
    );
  });
});
