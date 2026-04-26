'use client';

import React from 'react';
import { BarChart3 } from 'lucide-react';

interface RecordingMetric {
  created_at: string;
  clarity_score: number | null;
  pacing_score: number | null;
  eye_contact_percentage: number | null;
  presence_score: number | null;
  filler_word_count: number | null;
  words_per_minute: number | null;
}

interface ProgressMetricsProps {
  recordings: RecordingMetric[];
}

export default function ProgressMetrics({ recordings }: ProgressMetricsProps) {
  // Only show if user has 2+ recordings
  if (!recordings || recordings.length < 2) {
    return (
      <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 mb-8">
        <div className="text-center">
          <BarChart3 className="w-8 h-8 mx-auto mb-2 text-white/50" strokeWidth={1.5} />
          <h3 className="text-white/70 text-sm font-medium">Track Your Progress</h3>
          <p className="text-white/50 text-xs mt-1">
            Complete more sessions to see your improvement over time
          </p>
        </div>
      </div>
    );
  }

  // Cap at last 10 sessions, consistent with original logic
  const recentRecordings = recordings.slice(-10);

  // Calculate average + first-half vs second-half trend for any metric
  // Returns null if no non-null values exist in the set
  const calcMetric = (vals: (number | null)[]): { avg: number; trend: number } | null => {
    const valid = vals.filter((v): v is number => v !== null);
    if (valid.length === 0) return null;

    const avg = Math.round(valid.reduce((a, b) => a + b, 0) / valid.length);

    // Need at least 2 data points for a meaningful trend
    if (valid.length < 2) return { avg, trend: 0 };

    const mid = Math.floor(valid.length / 2);
    const olderAvg = valid.slice(0, mid).reduce((a, b) => a + b, 0) / mid;
    const newerAvg = valid.slice(mid).reduce((a, b) => a + b, 0) / (valid.length - mid);

    return { avg, trend: Math.round(newerAvg - olderAvg) };
  };

  const clarityMetric    = calcMetric(recentRecordings.map(r => r.clarity_score));
  const pacingMetric     = calcMetric(recentRecordings.map(r => r.pacing_score));
  const eyeContactMetric = calcMetric(recentRecordings.map(r => r.eye_contact_percentage));
  const fillerMetric     = calcMetric(recentRecordings.map(r => r.filler_word_count));

  type Dimension = {
    label: string;
    key: string;
    metric: { avg: number; trend: number };
    tip: (score: number) => string;
  };

  // Build only dimensions we have data for
  const dimensions: Dimension[] = [];

  if (clarityMetric) {
    dimensions.push({
      label: 'Clarity',
      key: 'clarity',
      metric: clarityMetric,
      tip: (s: number) =>
        s < 50
          ? "Cut filler words — try pausing instead of 'um' or 'like'."
          : 'Reduce filler words slightly and your clarity score will jump.',
    });
  }

  if (pacingMetric) {
    dimensions.push({
      label: 'Pacing',
      key: 'pacing',
      metric: pacingMetric,
      tip: (s: number) =>
        s < 50
          ? 'Slow down — aim for 120–150 words per minute. Rushing loses your audience.'
          : 'Aim for 120–150 words per minute. Slow down on key points for emphasis.',
    });
  }

  if (eyeContactMetric) {
    dimensions.push({
      label: 'Eye Contact',
      key: 'eye_contact',
      metric: eyeContactMetric,
      tip: (s: number) =>
        s < 50
          ? 'Look directly at the camera lens — not the screen. It reads as eye contact.'
          : 'Hold camera focus through your full answer, especially at the start.',
    });
  }

  // No scored metrics at all — fallback empty state
  if (dimensions.length === 0) {
    return (
      <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 mb-8">
        <div className="text-center">
          <h3 className="text-white/70 text-sm font-medium">Track Your Progress</h3>
          <p className="text-white/50 text-xs mt-1">
            Metrics will appear after your next session
          </p>
        </div>
      </div>
    );
  }

  // Find the weakest dimension by average score
  const weakest = dimensions.reduce((a, b) => (a.metric.avg <= b.metric.avg ? a : b));
  const allGood = dimensions.every(d => d.metric.avg >= 70);

  // Color helpers — consistent with analysis pages (green ≥70, yellow ≥50, red <50)
  const scoreColor = (score: number) =>
    score >= 70 ? 'text-green-400' : score >= 50 ? 'text-yellow-400' : 'text-red-400';

  const fillerColor = (avg: number) =>
    avg <= 3 ? 'text-green-400' : avg <= 8 ? 'text-yellow-400' : 'text-red-400';

  // Trend badge — arrow direction follows actual number movement.
  // Color logic: improving = green. Regressing but still in good range (avg ≥70) = neutral
  // (no need to alarm the user). Regressing into yellow/red territory = red.
  const trendBadge = (trend: number, avg: number, lowerIsBetter = false): React.ReactNode => {
    if (trend === 0) return null;
    const isImproving = lowerIsBetter ? trend < 0 : trend > 0;
    const arrow = trend > 0 ? '↑' : '↓';

    let color: string;
    if (isImproving) {
      color = 'text-green-400';
    } else if (lowerIsBetter ? avg <= 8 : avg >= 70) {
      // Regressing but still in a comfortable range — show as neutral, not alarming
      color = 'text-white/35';
    } else {
      color = 'text-red-400';
    }

    return (
      <span className={`text-[10px] font-medium ${color}`}>
        {arrow} {Math.abs(trend)}
      </span>
    );
  };

  const borderColor = allGood
    ? 'border-green-400/50'
    : weakest.metric.avg < 50
      ? 'border-red-400/60'
      : 'border-yellow-400/60';

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-white">Your Focus Area</h2>
        <span className="text-white/40 text-xs">Last {recentRecordings.length} sessions</span>
      </div>

      <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6">

        {/* Focus callout — single most important takeaway */}
        <div className={`border-l-2 ${borderColor} pl-4 mb-5`}>
          <p className="text-sm font-semibold text-white mb-1">
            {allGood ? 'Strong across the board' : `Work on ${weakest.label}`}
          </p>
          <p className="text-xs text-white/50 leading-relaxed">
            {allGood
              ? 'All areas averaging 70+ across your recent sessions. Keep the momentum.'
              : `${weakest.metric.avg}/100 avg · ${weakest.tip(weakest.metric.avg)}`
            }
          </p>
        </div>

        {/* Metric chips — one per available dimension + filler words */}
        <div className="flex flex-wrap gap-3">
          {dimensions.map(d => (
            <div
              key={d.key}
              className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 flex-1 min-w-[90px]"
            >
              <div className="text-[11px] text-white/40 mb-1">{d.label}</div>
              <div className="flex items-end gap-1.5">
                <span className={`text-lg font-bold leading-none ${scoreColor(d.metric.avg)}`}>
                  {d.metric.avg}
                </span>
                <span className="text-white/25 text-[10px] mb-px">/100</span>
                {trendBadge(d.metric.trend, d.metric.avg)}
              </div>
            </div>
          ))}

          {/* Filler words — count metric, lower is better */}
          {fillerMetric && (
            <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 flex-1 min-w-[90px]">
              <div className="text-[11px] text-white/40 mb-1">Filler Words</div>
              <div className="flex items-end gap-1.5">
                <span className={`text-lg font-bold leading-none ${fillerColor(fillerMetric.avg)}`}>
                  {fillerMetric.avg}
                </span>
                <span className="text-white/25 text-[10px] mb-px">avg</span>
                {trendBadge(fillerMetric.trend, fillerMetric.avg, true)}
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
