'use client';

import { apiFetch } from '@/utils/api';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';

interface ProgressMetrics {
    totalSessions: number;
    averageScore: number;
    improvementRate: number;
    strengthAreas: string[];
    focusAreas: string[];
    weeklyProgress: {
        week: number;
        contentScore: number;
        deliveryScore: number;
        presenceScore: number;
    }[];
    frameworkMastery: {
        star: number;
        carl: number;
        car: number;
    };
}

export default function ProgressTracking() {
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();
    const [metrics, setMetrics] = useState<ProgressMetrics | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!authLoading && !user) {
            router.push('/');
        }
    }, [user, authLoading, router]);

    useEffect(() => {
        const fetchProgressData = async () => {
            if (!user) return;

            try {
                // TODO: Replace with actual API call
                // const response = await apiFetch(/'api/progress');
                // const data = await response.json();

                // Mock data for now
                setMetrics({
                    totalSessions: 8,
                    averageScore: 8.2,
                    improvementRate: 12,
                    strengthAreas: ['Quantified Results', 'Eye Contact', 'Content Structure'],
                    focusAreas: ['Filler Words', 'Pacing', 'Framework Consistency'],
                    weeklyProgress: [
                        { week: 1, contentScore: 65, deliveryScore: 60, presenceScore: 55 },
                        { week: 2, contentScore: 68, deliveryScore: 65, presenceScore: 62 },
                        { week: 3, contentScore: 72, deliveryScore: 70, presenceScore: 68 },
                        { week: 4, contentScore: 75, deliveryScore: 72, presenceScore: 70 },
                        { week: 5, contentScore: 78, deliveryScore: 76, presenceScore: 74 },
                        { week: 6, contentScore: 81, deliveryScore: 79, presenceScore: 77 },
                        { week: 7, contentScore: 82, deliveryScore: 80, presenceScore: 79 },
                        { week: 8, contentScore: 85, deliveryScore: 83, presenceScore: 82 },
                    ],
                    frameworkMastery: {
                        star: 85,
                        carl: 72,
                        car: 78,
                    }
                });
                setLoading(false);
            } catch (error) {
                console.error('Failed to load progress data:', error);
                setLoading(false);
            }
        };

        fetchProgressData();
    }, [user]);

    if (authLoading || loading) {
        return (
            <main className="min-h-screen bg-gradient-to-b from-black to-gray-900 flex items-center justify-center">
                <div className="text-white flex items-center gap-3">
                    <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    <span>Loading your progress...</span>
                </div>
            </main>
        );
    }

    if (!user) {
        return null;
    }

    return (
        <main className="min-h-screen bg-gradient-to-b from-black to-gray-900 text-white p-8 pb-24">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60 mb-2">
                            Progress Tracking
                        </h1>
                        <p className="text-white/50">Track your improvement over time</p>
                    </div>
                    <Link
                        href="/history"
                        className="px-6 py-2 bg-white/10 backdrop-blur-xl border border-white/20 rounded-full hover:bg-white/20 transition-all text-sm font-medium"
                    >
                        View Sessions
                    </Link>
                </div>

                {/* Key Metrics Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                    <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
                        <div className="text-sm text-white/50 mb-2">Total Sessions</div>
                        <div className="text-4xl font-bold text-white mb-1">{metrics?.totalSessions || 0}</div>
                        <div className="text-xs text-green-400">All time</div>
                    </div>

                    <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
                        <div className="text-sm text-white/50 mb-2">Average Score</div>
                        <div className="text-4xl font-bold text-white mb-1">{metrics?.averageScore || 0}</div>
                        <div className="text-xs text-white/50">out of 10</div>
                    </div>

                    <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
                        <div className="text-sm text-white/50 mb-2">Improvement Rate</div>
                        <div className="text-4xl font-bold text-green-400 mb-1">+{metrics?.improvementRate || 0}%</div>
                        <div className="text-xs text-green-400">vs. first session</div>
                    </div>

                    <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6">
                        <div className="text-sm text-white/50 mb-2">Framework Mastery</div>
                        <div className="text-4xl font-bold text-purple-400 mb-1">{metrics?.frameworkMastery.star || 0}%</div>
                        <div className="text-xs text-white/50">STAR Method</div>
                    </div>
                </div>

                {/* Progress Chart */}
                <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-8 mb-8">
                    <h2 className="text-2xl font-bold mb-6">Performance Over Time</h2>

                    <div className="mb-4 flex gap-6 text-sm">
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-gradient-to-r from-green-400 to-emerald-400"></div>
                            <span className="text-white/60">Content</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-gradient-to-r from-blue-400 to-cyan-400"></div>
                            <span className="text-white/60">Delivery</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-gradient-to-r from-purple-400 to-pink-400"></div>
                            <span className="text-white/60">Presence</span>
                        </div>
                    </div>

                    <div className="relative h-64 flex items-end justify-between gap-3">
                        {metrics?.weeklyProgress.map((week, idx) => (
                            <div key={idx} className="flex-1 flex flex-col items-center gap-2">
                                <div className="w-full flex items-end justify-center gap-1 group relative" style={{ height: '220px' }}>
                                    <div
                                        className="w-full bg-gradient-to-t from-green-500/70 to-green-400/40 rounded-t hover:from-green-500/90 hover:to-green-400/60 transition-all cursor-pointer"
                                        style={{ height: `${week.contentScore}%` }}
                                    />
                                    <div
                                        className="w-full bg-gradient-to-t from-blue-500/70 to-cyan-400/40 rounded-t hover:from-blue-500/90 hover:to-cyan-400/60 transition-all cursor-pointer"
                                        style={{ height: `${week.deliveryScore}%` }}
                                    />
                                    <div
                                        className="w-full bg-gradient-to-t from-purple-500/70 to-pink-400/40 rounded-t hover:from-purple-500/90 hover:to-pink-400/60 transition-all cursor-pointer"
                                        style={{ height: `${week.presenceScore}%` }}
                                    />

                                    {/* Tooltip */}
                                    <div className="opacity-0 group-hover:opacity-100 absolute -top-16 left-1/2 -translate-x-1/2 bg-black/90 px-3 py-2 rounded-lg text-xs text-white whitespace-nowrap transition-opacity pointer-events-none z-10 shadow-xl border border-white/10">
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2">
                                                <div className="w-2 h-2 rounded-full bg-green-400"></div>
                                                <span>Content: {week.contentScore}%</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <div className="w-2 h-2 rounded-full bg-blue-400"></div>
                                                <span>Delivery: {week.deliveryScore}%</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <div className="w-2 h-2 rounded-full bg-purple-400"></div>
                                                <span>Presence: {week.presenceScore}%</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <span className="text-xs text-white/40 font-medium">W{week.week}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Strengths & Focus Areas */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Strengths */}
                    <div className="bg-green-500/10 backdrop-blur-xl border border-green-400/30 rounded-2xl p-6">
                        <h3 className="text-xl font-bold mb-4 text-green-300 flex items-center gap-2">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            Your Strengths
                        </h3>
                        <ul className="space-y-2">
                            {metrics?.strengthAreas.map((strength, idx) => (
                                <li key={idx} className="flex items-center gap-2 text-white/80">
                                    <div className="w-2 h-2 rounded-full bg-green-400"></div>
                                    {strength}
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Focus Areas */}
                    <div className="bg-yellow-500/10 backdrop-blur-xl border border-yellow-400/30 rounded-2xl p-6">
                        <h3 className="text-xl font-bold mb-4 text-yellow-300 flex items-center gap-2">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                            Areas to Focus On
                        </h3>
                        <ul className="space-y-2">
                            {metrics?.focusAreas.map((area, idx) => (
                                <li key={idx} className="flex items-center gap-2 text-white/80">
                                    <div className="w-2 h-2 rounded-full bg-yellow-400"></div>
                                    {area}
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>
        </main>
    );
}
