import { afterEach, describe, expect, it, vi } from "vitest";
import { uploadOrganizationLogoDirect } from "./organizationLogoUpload";

describe("direct organization logo upload", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends the prepared image as a binary same-origin request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          key: "department/logos/org/logo.png",
          url: "/api/storage/department/logos/org/logo.png",
        }),
        { status: 201, headers: { "Content-Type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);
    const blob = new Blob([new Uint8Array([1, 2, 3])], {
      type: "image/png",
    });

    await expect(
      uploadOrganizationLogoDirect({
        organizationId: "550e8400-e29b-41d4-a716-446655440000",
        fileName: "badge.png",
        blob,
        contentType: "image/png",
      })
    ).resolves.toEqual({
      key: "department/logos/org/logo.png",
      url: "/api/storage/department/logos/org/logo.png",
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/storage/department-logo");
    expect(options).toMatchObject({
      method: "PUT",
      credentials: "same-origin",
      headers: {
        "Content-Type": "image/png",
        "X-Organization-Id": "550e8400-e29b-41d4-a716-446655440000",
        "X-File-Name": "badge.png",
      },
      body: blob,
    });
  });

  it("surfaces authorization and validation errors from the server", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "لا تملك صلاحية رفع الشعار" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      uploadOrganizationLogoDirect({
        organizationId: "550e8400-e29b-41d4-a716-446655440000",
        fileName: "badge.png",
        blob: new Blob([new Uint8Array([1])], { type: "image/png" }),
        contentType: "image/png",
      })
    ).rejects.toThrow("لا تملك صلاحية رفع الشعار");
  });

  it("rejects malformed success responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ key: "department/logos/org/logo.png" }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        })
      )
    );

    await expect(
      uploadOrganizationLogoDirect({
        organizationId: "550e8400-e29b-41d4-a716-446655440000",
        fileName: "badge.png",
        blob: new Blob([new Uint8Array([1])], { type: "image/png" }),
        contentType: "image/png",
      })
    ).rejects.toThrow("استجابة الخادم لرفع الشعار غير صالحة");
  });
});
