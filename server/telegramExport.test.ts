import { describe, expect, it } from "vitest";
import { isAllowedExportResourceUrl } from "./telegramExport";

describe("telegram export resource isolation", () => {
  it("allows the blank document origin and supported inline image formats", () => {
    expect(isAllowedExportResourceUrl("about:blank")).toBe(true);
    expect(
      isAllowedExportResourceUrl("data:image/png;base64,iVBORw0KGgo=")
    ).toBe(true);
    expect(
      isAllowedExportResourceUrl("data:image/svg+xml;charset=utf-8,%3Csvg%3E")
    ).toBe(true);
  });

  it("blocks remote, local-network, file, and non-image data resources", () => {
    expect(isAllowedExportResourceUrl("https://example.com/image.png")).toBe(
      false
    );
    expect(isAllowedExportResourceUrl("http://127.0.0.1:3000/admin")).toBe(
      false
    );
    expect(
      isAllowedExportResourceUrl("http://169.254.169.254/latest/meta-data/")
    ).toBe(false);
    expect(isAllowedExportResourceUrl("file:///etc/passwd")).toBe(false);
    expect(
      isAllowedExportResourceUrl("data:text/html,<script>alert(1)</script>")
    ).toBe(false);
    expect(isAllowedExportResourceUrl("blob:https://example.com/id")).toBe(
      false
    );
  });
});
