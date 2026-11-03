export type DashboardUrgentTelegram = {
  id: number;
  currentOrganizationId: string | null;
};

export type DashboardTelegramRoute = {
  id: number;
  telegramId: number;
  toOrganizationId: string;
  receiverDecisionStatus: string;
  createdAt: string | Date;
};

/**
 * Counts only routed urgent telegrams awaiting the active receiving organization.
 * New drafts start with their creator's organization as currentOrganizationId,
 * so a matching latest route is required before showing an alert.
 */
export function countUrgentTelegramsAwaitingReceipt(
  telegrams: DashboardUrgentTelegram[],
  routes: DashboardTelegramRoute[],
  receivingOrganizationId: string | null
): number {
  if (!receivingOrganizationId) return 0;

  const latestRouteByTelegram = new Map<number, DashboardTelegramRoute>();

  for (const route of routes) {
    const previous = latestRouteByTelegram.get(route.telegramId);
    const routeTime = new Date(route.createdAt).getTime();
    const previousTime = previous
      ? new Date(previous.createdAt).getTime()
      : Number.NEGATIVE_INFINITY;

    if (
      !previous ||
      routeTime > previousTime ||
      (routeTime === previousTime && route.id > previous.id)
    ) {
      latestRouteByTelegram.set(route.telegramId, route);
    }
  }

  return telegrams.filter(telegram => {
    if (telegram.currentOrganizationId !== receivingOrganizationId) {
      return false;
    }

    const latestRoute = latestRouteByTelegram.get(telegram.id);
    if (
      !latestRoute ||
      latestRoute.toOrganizationId !== receivingOrganizationId
    ) {
      return false;
    }

    return latestRoute.receiverDecisionStatus !== "accepted";
  }).length;
}
