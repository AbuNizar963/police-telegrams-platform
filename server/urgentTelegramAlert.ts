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
 * Urgent alerts are cleared once the current receiving organization accepts
 * the latest route. A decision for an older route must not clear a newer one.
 */
export function countUrgentTelegramsAwaitingReceipt(
  telegrams: DashboardUrgentTelegram[],
  routes: DashboardTelegramRoute[]
): number {
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
    if (!telegram.currentOrganizationId) return true;

    const latestRoute = latestRouteByTelegram.get(telegram.id);
    return !(
      latestRoute?.receiverDecisionStatus === "accepted" &&
      latestRoute.toOrganizationId === telegram.currentOrganizationId
    );
  }).length;
}
