'use client';

import React from 'react';
import { LineChart, Line, BarChart, Bar, ResponsiveContainer } from 'recharts';

interface RecordingMetric {
  created_at: string;
  clarity_score: number | null;
  pacing_score: number | null;
  eye_contact_percentage: number | null;
  presence_score: number | null;
  filler_word_count: number | null;
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
          <div className="text-4xl mb-2">📊</div>
          <h3 className="text-white/70 text-sm font-medium">Track Your Progress</h3>
          <p className="text-white/50 text-xs mt-1">
            Complete more sessions to see your improvement over time
          </p>
        </div>
      </div>
    );
  }

  // Use last 10 sessions consistently for all metrics
  const recentRecordings = recordings.slice(-10);

  // Calculate overall performance score (average of last 10 sessions)
  const calculateOverallScore = () => {
    let totalScore = 0;
    let count = 0;

    recentRecordings.forEach(rec => {
      const scores = [
        rec.clarity_score,
        rec.pacing_score,
        rec.eye_contact_percentage,
        rec.presence_score,
      ].filter(score => score !== null) as number[];

      if (scores.length > 0) {
        totalScore += scores.reduce((sum, score) => sum + score, 0) / scores.length;
        count++;
      }
    });

    return count > 0 ? Math.round(totalScore / count) : 0;
  };

  // Calculate trend (compare recent 5 vs. previous 5 within last 10)
  const calculateTrend = () => {
    if (recentRecordings.length < 2) return 0;

    // If we have 10+ recordings, compare last 5 vs. previous 5
    // If we have 5-9 recordings, compare last half vs. first half
    const midpoint = Math.floor(recentRecordings.length / 2);
    const olderRecordings = recentRecordings.slice(0, midpoint);
    const newerRecordings = recentRecordings.slice(midpoint);

    // Calculate average for older recordings
    let olderTotal = 0;
    let olderCount = 0;
    olderRecordings.forEach(rec => {
      const scores = [
        rec.clarity_score,
        rec.pacing_score,
        rec.eye_contact_percentage,
        rec.presence_score,
      ].filter(s => s !== null) as number[];

      if (scores.length > 0) {
        olderTotal += scores.reduce((sum, s) => sum + s, 0) / scores.length;
        olderCount++;
      }
    });

    // Calculate average for newer recordings
    let newerTotal = 0;
    let newerCount = 0;
    newerRecordings.forEach(rec => {
      const scores = [
        rec.clarity_score,
        rec.pacing_score,
        rec.eye_contact_percentage,
        rec.presence_score,
      ].filter(s => s !== null) as number[];

      if (scores.length > 0) {
        newerTotal += scores.reduce((sum, s) => sum + s, 0) / scores.length;
        newerCount++;
      }
    });

    const olderAvg = olderCount > 0 ? olderTotal / olderCount : 0;
    const newerAvg = newerCount > 0 ? newerTotal / newerCount : 0;
    return Math.round(newerAvg - olderAvg);
  };

  // Prepare eye contact data (last 5 of last 10 sessions for cleaner visualization)
  const eyeContactData = recentRecordings
    .slice(-5)
    .map((rec, idx) => ({
      index: idx,
      value: rec.eye_contact_percentage || 0,
    }));

  // Prepare filler words data (last 5 of last 10 sessions for cleaner visualization)
  const fillerWordsData = recentRecordings
    .slice(-5)
    .map((rec, idx) => ({
      index: idx,
      value: rec.filler_word_count || 0,
    }));

  // Get first and last values for display
  const eyeContactFirst = eyeContactData[0]?.value || 0;
  const eyeContactLast = eyeContactData[eyeContactData.length - 1]?.value || 0;
  const fillerWordsFirst = fillerWordsData[0]?.value || 0;
  const fillerWordsLast = fillerWordsData[fillerWordsData.length - 1]?.value || 0;

  const overallScore = calculateOverallScore();
  const trend = calculateTrend();

  return (
    <div className="mb-8">
      <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
        <span>📊</span> Your Progress
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Overall Performance Card */}
        <div className="bg-white/10 backdrop-blur-xl border border-white/20 shadow-xl rounded-2xl p-6">
          <div className="text-white/70 text-sm font-medium mb-2">Overall Performance</div>
          <div className="text-5xl font-bold text-white mb-2">{overallScore}%</div>
          <div className="flex items-center gap-2 text-sm">
            {trend > 0 ? (
              <>
                <span className="text-green-400">↑ +{trend}%</span>
                <span className="text-white/50">recent improvement</span>
              </>
            ) : trend < 0 ? (
              <>
                <span className="text-red-400">↓ {trend}%</span>
                <span className="text-white/50">recent change</span>
              </>
            ) : (
              <span className="text-white/50">Steady performance</span>
            )}
          </div>
          <div className="text-xs text-white/40 mt-1">Last {recentRecordings.length} sessions</div>
        </div>

        {/* Eye Contact Card */}
        <div className="bg-white/10 backdrop-blur-xl border border-white/20 shadow-xl rounded-2xl p-6">
          <div className="text-white/70 text-sm font-medium mb-2">Eye Contact</div>
          <div className="h-16 mb-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={eyeContactData}>
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#a78bfa"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-white/50">{eyeContactFirst}%</span>
            <span className="text-white">→</span>
            <span className="text-white font-semibold">{eyeContactLast}%</span>
          </div>
          {eyeContactLast > eyeContactFirst && (
            <div className="text-xs text-green-400 mt-1">
              ↑ +{eyeContactLast - eyeContactFirst}% improvement
            </div>
          )}
          {eyeContactLast < eyeContactFirst && (
            <div className="text-xs text-red-400 mt-1">
              ↓ {eyeContactFirst - eyeContactLast}% decrease
            </div>
          )}
        </div>

        {/* Filler Words Card */}
        <div className="bg-white/10 backdrop-blur-xl border border-white/20 shadow-xl rounded-2xl p-6">
          <div className="text-white/70 text-sm font-medium mb-2">Filler Words</div>
          <div className="h-16 mb-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={fillerWordsData}>
                <Bar dataKey="value" fill="#fbbf24" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-white/50">{fillerWordsFirst}</span>
            <span className="text-white">→</span>
            <span className="text-white font-semibold">{fillerWordsLast}</span>
          </div>
          {fillerWordsLast < fillerWordsFirst && (
            <div className="text-xs text-green-400 mt-1">
              ↓ {fillerWordsFirst - fillerWordsLast} fewer filler words
            </div>
          )}
          {fillerWordsLast > fillerWordsFirst && (
            <div className="text-xs text-red-400 mt-1">
              ↑ +{fillerWordsLast - fillerWordsFirst} more filler words
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
