import { describe, expect, it } from "vitest";
import { countUrgentTelegramsAwaitingReceipt } from "./urgentTelegramAlert";

const route = (
  id: number,
  telegramId: number,
  toOrganizationId: string,
  receiverDecisionStatus: string,
  createdAt = "2026-10-10T00:00:00.000Z"
) => ({
  id,
  telegramId,
  toOrganizationId,
  receiverDecisionStatus,
  createdAt,
});

describe("countUrgentTelegramsAwaitingReceipt", () => {
  it("does not alert the sender about an urgent draft that has not been routed", () => {
    expect(
      countUrgentTelegramsAwaitingReceipt(
        [{ id: 7, currentOrganizationId: "sender-a" }],
        [],
        "sender-a"
      )
    ).toBe(0);
  });

  it("does not show a routed urgent telegram on the sender's dashboard", () => {
    expect(
      countUrgentTelegramsAwaitingReceipt(
        [{ id: 7, currentOrganizationId: "receiver-a" }],
        [route(11, 7, "receiver-a", "pending")],
        "sender-a"
      )
    ).toBe(0);
  });

  it("counts a pending route only for its active receiving organization", () => {
    const telegrams = [
      { id: 7, currentOrganizationId: "receiver-a" },
      { id: 8, currentOrganizationId: "receiver-b" },
      { id: 9, currentOrganizationId: null },
    ];
    const routes = [
      route(11, 7, "receiver-a", "pending"),
      route(12, 8, "receiver-b", "pending"),
    ];

    expect(
      countUrgentTelegramsAwaitingReceipt(telegrams, routes, "receiver-a")
    ).toBe(1);
  });

  it("does not count an unrouted urgent telegram even if it is in the viewer's org", () => {
    expect(
      countUrgentTelegramsAwaitingReceipt(
        [{ id: 7, currentOrganizationId: "receiver-a" }],
        [],
        "receiver-a"
      )
    ).toBe(0);
  });

  it("hides an urgent telegram after its current receiving organization accepts receipt", () => {
    expect(
      countUrgentTelegramsAwaitingReceipt(
        [{ id: 7, currentOrganizationId: "receiver-a" }],
        [route(11, 7, "receiver-a", "accepted")],
        "receiver-a"
      )
    ).toBe(0);
  });

  it("does not let an accepted decision for an old destination hide a new route", () => {
    expect(
      countUrgentTelegramsAwaitingReceipt(
        [{ id: 7, currentOrganizationId: "receiver-b" }],
        [
          route(11, 7, "receiver-a", "accepted"),
          route(12, 7, "receiver-b", "pending", "2026-10-10T00:01:00.000Z"),
        ],
        "receiver-b"
      )
    ).toBe(1);
  });

  it("keeps the alert after a new route to the same receiver even if an older route was accepted", () => {
    expect(
      countUrgentTelegramsAwaitingReceipt(
        [{ id: 7, currentOrganizationId: "receiver-a" }],
        [
          route(11, 7, "receiver-a", "accepted"),
          route(12, 7, "receiver-a", "pending", "2026-10-10T00:01:00.000Z"),
        ],
        "receiver-a"
      )
    ).toBe(1);
  });

  it("does not hide an urgent telegram when the latest receiver decision is rejected", () => {
    expect(
      countUrgentTelegramsAwaitingReceipt(
        [{ id: 7, currentOrganizationId: "receiver-a" }],
        [route(11, 7, "receiver-a", "rejected")],
        "receiver-a"
      )
    ).toBe(1);
  });
});
