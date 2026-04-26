'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Briefcase, TrendingUp, Target, FileText, Calendar } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { getUserSessions, getUserProgressData } from '@/services/sessionManager';
import SessionCard from '@/components/SessionCard';
import ProgressMetrics from '@/components/ProgressMetrics';
import Header from '@/components/Header';

type SessionType = 'all' | 'job-interview' | 'sales-pitch' | 'presentation';

interface Session {
  id: string;
  session_type: string;
  context: string;
  created_at: string;
  completed_at: string | null;
  status: string;
  questions: { count: number }[];
  recordings: { count: number }[];
}

interface RecordingMetric {
  created_at: string;
  clarity_score: number | null;
  pacing_score: number | null;
  eye_contact_percentage: number | null;
  presence_score: number | null;
  filler_word_count: number | null;
  words_per_minute: number | null;
}

export default function HistoryPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [filteredSessions, setFilteredSessions] = useState<Session[]>([]);
  const [progressData, setProgressData] = useState<RecordingMetric[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<SessionType>('all');
  const [refreshCount, setRefreshCount] = useState(0);
  const [processingTimedOut, setProcessingTimedOut] = useState(false);

  // Redirect to home if not logged in
  useEffect(() => {
    if (!loading && !user) {
      router.push('/');
    }
  }, [user, loading, router]);

  // Fetch sessions
  useEffect(() => {
    const fetchSessions = async () => {
      if (!user) return;

      setIsLoading(true);
      try {
        const data = await getUserSessions(user.id);
        setSessions(data as Session[]);
        setFilteredSessions(data as Session[]);
      } catch (error) {
        console.error('Error fetching sessions:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSessions();
  }, [user]);

  // Fetch progress data with auto-refresh for incomplete transcriptions
  useEffect(() => {
    const fetchProgress = async () => {
      if (!user) return;

      try {
        const data = await getUserProgressData(user.id);
        setProgressData(data);

        // Check only the most recent recording for incomplete data.
        // Checking all recordings would trigger the poll indefinitely for users
        // with older sessions that were recorded before transcription was reliable.
        const mostRecent = data.length > 0 ? data[data.length - 1] : null;
        const hasIncompleteData = mostRecent !== null && (
          mostRecent.filler_word_count === null ||
          mostRecent.clarity_score === null ||
          mostRecent.pacing_score === null
        );

        // Auto-refresh every 3 seconds if incomplete data exists (max 10 retries = 30 seconds)
        if (hasIncompleteData && refreshCount < 10) {
          setTimeout(() => {
            setRefreshCount(prev => prev + 1);
          }, 3000);
        } else if (hasIncompleteData && refreshCount >= 10) {
          // Max retries hit — surface a visible notice so users know why metrics are missing
          setProcessingTimedOut(true);
        }
      } catch (error) {
        console.error('Error fetching progress data:', error);
        // Silent fail - progress section will show empty state
      }
    };

    fetchProgress();
  }, [user, refreshCount]);

  // Filter sessions
  useEffect(() => {
    if (filter === 'all') {
      setFilteredSessions(sessions);
    } else {
      setFilteredSessions(sessions.filter(s => s.session_type === filter));
    }
  }, [filter, sessions]);

  // Group sessions by date
  const groupSessionsByDate = (sessions: Session[]) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const lastWeek = new Date(today);
    lastWeek.setDate(lastWeek.getDate() - 7);

    const groups: {
      today: Session[];
      yesterday: Session[];
      thisWeek: Session[];
      older: Session[];
    } = {
      today: [],
      yesterday: [],
      thisWeek: [],
      older: [],
    };

    sessions.forEach(session => {
      const sessionDate = new Date(session.created_at);
      const sessionDay = new Date(
        sessionDate.getFullYear(),
        sessionDate.getMonth(),
        sessionDate.getDate()
      );

      if (sessionDay.getTime() === today.getTime()) {
        groups.today.push(session);
      } else if (sessionDay.getTime() === yesterday.getTime()) {
        groups.yesterday.push(session);
      } else if (sessionDate >= lastWeek) {
        groups.thisWeek.push(session);
      } else {
        groups.older.push(session);
      }
    });

    return groups;
  };

  const groupedSessions = groupSessionsByDate(filteredSessions);

  const handleDeleteSession = async () => {
    // Refresh both sessions and progress data after delete
    if (user) {
      try {
        const [sessionsData, progressDataResult] = await Promise.all([
          getUserSessions(user.id),
          getUserProgressData(user.id),
        ]);
        setSessions(sessionsData as Session[]);
        setProgressData(progressDataResult);
      } catch (error) {
        console.error('Error refreshing data after delete:', error);
      }
    }
  };

  // Show loading while checking auth
  if (loading || !user) {
    return (
      <main className="min-h-screen text-white p-8 relative">
        <div className="absolute inset-0 bg-black/80 backdrop-blur-md -z-10" />
        <div className="max-w-5xl mx-auto text-center pt-20">
          <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin mx-auto"></div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen text-white p-8 pb-24 relative">
      {/* Background Gradient Overlay */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md -z-10" />

      <Header />

      <div className="max-w-5xl mx-auto mt-20 relative z-10">
        {/* Page Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60">
              Session History
            </h1>
            <p className="text-white/60 text-sm mt-2">
              {sessions.length} practice session{sessions.length !== 1 ? 's' : ''} recorded
            </p>
          </div>
          <Link
            href="/"
            className="bg-white/10 hover:bg-white/20 active:bg-white/30 backdrop-blur-lg border border-white/20 transition-all duration-200 px-6 py-2 rounded-full text-sm font-medium text-white"
          >
            Start New Session
          </Link>
        </div>

        {/* Progress Tracking */}
        <ProgressMetrics recordings={progressData} />

        {/* Processing timeout notice */}
        {processingTimedOut && (
          <div className="mb-6 flex items-start gap-3 bg-white/5 border border-white/10 rounded-2xl px-5 py-4">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/50 mt-0.5 flex-shrink-0">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <div>
              <p className="text-white/70 text-sm font-medium">Some metrics are still processing</p>
              <p className="text-white/40 text-xs mt-0.5">
                Speech analysis for recent recordings may take a moment.{' '}
                <button
                  onClick={() => { setRefreshCount(0); setProcessingTimedOut(false); }}
                  className="underline underline-offset-2 hover:text-white/60 transition-colors"
                >
                  Refresh
                </button>{' '}
                to check again.
              </p>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-8">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
              filter === 'all'
                ? 'bg-white text-black'
                : 'bg-white/10 text-white/70 hover:bg-white/20'
            }`}
          >
            All ({sessions.length})
          </button>
          <button
            onClick={() => setFilter('job-interview')}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all ${
              filter === 'job-interview'
                ? 'bg-white text-black'
                : 'bg-white/10 text-white/70 hover:bg-white/20'
            }`}
          >
            <Briefcase className="w-3.5 h-3.5" strokeWidth={1.75} />
            Job Interview ({sessions.filter(s => s.session_type === 'job-interview').length})
          </button>
          <button
            onClick={() => setFilter('sales-pitch')}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all ${
              filter === 'sales-pitch'
                ? 'bg-white text-black'
                : 'bg-white/10 text-white/70 hover:bg-white/20'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" strokeWidth={1.75} />
            Sales Pitch ({sessions.filter(s => s.session_type === 'sales-pitch').length})
          </button>
          <button
            onClick={() => setFilter('presentation')}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all ${
              filter === 'presentation'
                ? 'bg-white text-black'
                : 'bg-white/10 text-white/70 hover:bg-white/20'
            }`}
          >
            <Target className="w-3.5 h-3.5" strokeWidth={1.75} />
            Presentation ({sessions.filter(s => s.session_type === 'presentation').length})
          </button>
        </div>

        {/* Sessions List */}
        {isLoading ? (
          <div className="text-center py-20">
            <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-white/60">Loading sessions...</p>
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="text-center py-20 bg-white/5 rounded-3xl border border-white/10">
            <FileText className="w-14 h-14 mx-auto mb-4 text-white/40" strokeWidth={1.25} />
            <h3 className="text-xl font-bold text-white mb-2">
              {filter === 'all' ? 'No sessions yet' : `No ${filter.replace('-', ' ')} sessions`}
            </h3>
            <p className="text-white/60 mb-6">
              {filter === 'all'
                ? 'Start your first practice session to begin tracking your progress!'
                : 'Try a different filter or start a new session.'}
            </p>
            <Link
              href="/"
              className="inline-block bg-white text-black px-6 py-2 rounded-full text-sm font-bold hover:bg-white/90 transition-colors"
            >
              Start Practicing
            </Link>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Today */}
            {groupedSessions.today.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-white/80 mb-4 flex items-center gap-2">
                  <Calendar className="w-4 h-4" strokeWidth={1.75} /> Today
                </h2>
                <div className="space-y-4">
                  {groupedSessions.today.map(session => (
                    <SessionCard
                      key={session.id}
                      session={session}
                      onDelete={handleDeleteSession}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Yesterday */}
            {groupedSessions.yesterday.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-white/80 mb-4 flex items-center gap-2">
                  <Calendar className="w-4 h-4" strokeWidth={1.75} /> Yesterday
                </h2>
                <div className="space-y-4">
                  {groupedSessions.yesterday.map(session => (
                    <SessionCard
                      key={session.id}
                      session={session}
                      onDelete={handleDeleteSession}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* This Week */}
            {groupedSessions.thisWeek.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-white/80 mb-4 flex items-center gap-2">
                  <Calendar className="w-4 h-4" strokeWidth={1.75} /> This Week
                </h2>
                <div className="space-y-4">
                  {groupedSessions.thisWeek.map(session => (
                    <SessionCard
                      key={session.id}
                      session={session}
                      onDelete={handleDeleteSession}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Older */}
            {groupedSessions.older.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-white/80 mb-4 flex items-center gap-2">
                  <Calendar className="w-4 h-4" strokeWidth={1.75} /> Older
                </h2>
                <div className="space-y-4">
                  {groupedSessions.older.map(session => (
                    <SessionCard
                      key={session.id}
                      session={session}
                      onDelete={handleDeleteSession}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
