/**
 * Greedy set-cover approximation. Optimal is NP-hard; greedy is within a
 * ln(n) factor of optimal and effectively instant at branch scale (tens of
 * actions × tens of tasks). We use it to find the smallest set of TASKS
 * whose combined coverage clears every open ACTION.
 */
export function greedySetCover(
  universe: string[],
  subsets: Map<string, Set<string>>,
): { selected: string[]; uncovered: string[] } {
  const uncovered = new Set(universe);
  const selected: string[] = [];
  const pool = new Map<string, Set<string>>();
  for (const [k, v] of subsets) pool.set(k, new Set(v));

  while (uncovered.size > 0) {
    let best: string | null = null;
    let bestGain = 0;
    for (const [id, cov] of pool) {
      let gain = 0;
      for (const a of cov) if (uncovered.has(a)) gain++;
      if (gain > bestGain) {
        bestGain = gain;
        best = id;
      }
    }
    if (!best) break;
    selected.push(best);
    for (const a of pool.get(best)!) uncovered.delete(a);
    pool.delete(best);
  }

  return { selected, uncovered: [...uncovered] };
}
