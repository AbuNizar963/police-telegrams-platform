import { describe, expect, it } from "vitest";
import { countUrgentTelegramsAwaitingReceipt } from "./urgentTelegramAlert";

describe("countUrgentTelegramsAwaitingReceipt", () => {
  it("hides an urgent telegram after its current receiving organization accepts receipt", () => {
    expect(
      countUrgentTelegramsAwaitingReceipt(
        [{ id: 7, currentOrganizationId: "receiver-a" }],
        [
          {
            id: 11,
            telegramId: 7,
            toOrganizationId: "receiver-a",
            receiverDecisionStatus: "accepted",
            createdAt: "2026-10-10T00:00:00.000Z",
          },
        ]
      )
    ).toBe(0);
  });

  it("keeps urgent telegrams visible when the current receiver has not accepted", () => {
    expect(
      countUrgentTelegramsAwaitingReceipt(
        [
          { id: 7, currentOrganizationId: "receiver-a" },
          { id: 8, currentOrganizationId: null },
        ],
        [
          {
            id: 11,
            telegramId: 7,
            toOrganizationId: "receiver-a",
            receiverDecisionStatus: "pending",
            createdAt: "2026-10-10T00:00:00.000Z",
          },
        ]
      )
    ).toBe(2);
  });

  it("does not let an accepted decision for an old destination hide a new route", () => {
    expect(
      countUrgentTelegramsAwaitingReceipt(
        [{ id: 7, currentOrganizationId: "receiver-b" }],
        [
          {
            id: 11,
            telegramId: 7,
            toOrganizationId: "receiver-a",
            receiverDecisionStatus: "accepted",
            createdAt: "2026-10-10T00:00:00.000Z",
          },
          {
            id: 12,
            telegramId: 7,
            toOrganizationId: "receiver-b",
            receiverDecisionStatus: "pending",
            createdAt: "2026-10-10T00:01:00.000Z",
          },
        ]
      )
    ).toBe(1);
  });

  it("keeps the alert after a new route to the same receiver even if an older route was accepted", () => {
    expect(
      countUrgentTelegramsAwaitingReceipt(
        [{ id: 7, currentOrganizationId: "receiver-a" }],
        [
          {
            id: 11,
            telegramId: 7,
            toOrganizationId: "receiver-a",
            receiverDecisionStatus: "accepted",
            createdAt: "2026-10-10T00:00:00.000Z",
          },
          {
            id: 12,
            telegramId: 7,
            toOrganizationId: "receiver-a",
            receiverDecisionStatus: "pending",
            createdAt: "2026-10-10T00:01:00.000Z",
          },
        ]
      )
    ).toBe(1);
  });

  it("does not hide an urgent telegram when the latest receiver decision is rejected", () => {
    expect(
      countUrgentTelegramsAwaitingReceipt(
        [{ id: 7, currentOrganizationId: "receiver-a" }],
        [
          {
            id: 11,
            telegramId: 7,
            toOrganizationId: "receiver-a",
            receiverDecisionStatus: "rejected",
            createdAt: "2026-10-10T00:00:00.000Z",
          },
        ]
      )
    ).toBe(1);
  });
});
