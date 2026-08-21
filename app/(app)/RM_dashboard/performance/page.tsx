import { cookies } from "next/headers";
import { requireRM } from "../placeholder";
import { getPerformance } from "@/lib/queries/performance";
import { parseTimeframe } from "@/lib/performance";
import PerformanceClient from "./performance-client";

/**
 * Whatever timeframe the RM last chose, read server-side from the cookie the
 * toggle writes, so the remembered window is the one that gets painted rather
 * than something the client has to correct afterwards.
 *
 * Monthly is the fallback because it is the period the rest of the product is
 * built on — targets, quotas and self-evaluations are all stored per month, so
 * that view is the one whose numbers line up with the Dashboard's quota tile.
 */
export default async function PerformancePage() {
  const session = await requireRM();
  const store = await cookies();
  const timeframe = parseTimeframe(store.get("rm_timeframe")?.value);

  const initial = await getPerformance(session.user_id, timeframe);

  return <PerformanceClient initial={initial} />;
}
