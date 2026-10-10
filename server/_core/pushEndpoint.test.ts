import { describe, expect, it } from "vitest";
import { isAllowedPushEndpoint } from "./pushEndpoint";

describe("Web Push endpoint validation", () => {
  it.each([
    "https://fcm.googleapis.com/fcm/send/example",
    "https://updates.push.services.mozilla.com/wpush/v2/example",
    "https://web.push.apple.com/example",
    "https://wns2-example.notify.windows.com/w/?token=example",
  ])("allows a trusted browser push endpoint: %s", endpoint => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(true);
  });

  it.each([
    "http://fcm.googleapis.com/fcm/send/example",
    "https://127.0.0.1/metadata",
    "https://169.254.169.254/latest/meta-data/",
    "https://localhost/admin",
    "https://fcm.googleapis.com.evil.example/collect",
    "https://evil.example/push",
    "https://fcm.googleapis.com:8443/fcm/send/example",
    "https://user:password@fcm.googleapis.com/fcm/send/example",
    "not a URL",
  ])("rejects an untrusted or unsafe endpoint: %s", endpoint => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(false);
  });
});
