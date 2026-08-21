/**
 * Retrospective simulator for the follow_up_breach `sla_hours` knob.
 *
 * Pure function. No DB, no clock, no engine. It answers exactly one
 * question: if the SLA had been `thresholdHours` for the last 90 days,
 * how many of the historically-closed actions would have breached it?
 *
 * The output separates threshold-dependent numbers (`wouldBreach*`) from
 * reality (`median`, `p90`, `totalClosed`, `histogram`). Loosening the
 * rule moves the LINE, not the WORK — this shape is what makes the UI
 * able to render that distinction honestly.
 */

export type SlaSimulationInput = {
  /** Hours each closed action took to resolve. Order irrelevant. */
  resolutionHours: number[];
  /** The threshold to test, in hours. */
  thresholdHours: number;
};

export type HistogramBucket = {
  label: string;
  lowerBound: number;
  upperBound: number;
  count: number;
};

export type SlaSimulationOutput = {
  // Threshold-dependent — moves with the input.
  wouldBreach: number;
  wouldBreachPct: number;

  // Reality — fixed properties of the historical data. Independent of threshold.
  totalClosed: number;
  medianResolutionHours: number;
  p90ResolutionHours: number;
  histogram: HistogramBucket[];
};

const BUCKET_SIZE = 10;
const BUCKET_COUNT = 10;

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

export function evaluate(input: SlaSimulationInput): SlaSimulationOutput {
  const { resolutionHours, thresholdHours } = input;
  const totalClosed = resolutionHours.length;

  const sorted = [...resolutionHours].sort((a, b) => a - b);
  const median = percentile(sorted, 50);
  const p90 = percentile(sorted, 90);

  const wouldBreach = resolutionHours.filter((h) => h > thresholdHours).length;
  const wouldBreachPct = totalClosed > 0 ? (wouldBreach / totalClosed) * 100 : 0;

  const histogram: HistogramBucket[] = [];
  for (let i = 0; i < BUCKET_COUNT; i++) {
    const lower = i * BUCKET_SIZE;
    const upper = (i + 1) * BUCKET_SIZE;
    histogram.push({
      label: `${lower}-${upper}h`,
      lowerBound: lower,
      upperBound: upper,
      count: resolutionHours.filter((h) => h >= lower && h < upper).length,
    });
  }
  // Overflow bucket — anything past the last fixed range.
  const overflowLower = BUCKET_COUNT * BUCKET_SIZE;
  histogram.push({
    label: `${overflowLower}+h`,
    lowerBound: overflowLower,
    upperBound: Infinity,
    count: resolutionHours.filter((h) => h >= overflowLower).length,
  });

  return {
    wouldBreach,
    wouldBreachPct,
    totalClosed,
    medianResolutionHours: median,
    p90ResolutionHours: p90,
    histogram,
  };
}
