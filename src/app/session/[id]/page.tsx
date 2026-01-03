'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { use } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { getSessionDetails, getVideoUrl } from '@/services/sessionManager';
import TranscriptViewer from '@/components/TranscriptViewer';
import { analyzeSpeech } from '@/services/speechAnalyzer';
import type { GenerateFeedbackResponse } from '@/app/api/generate-feedback/route';

interface Recording {
  id: string;
  video_url: string | null;
  transcript: string | null;
  duration: number | null;
  words_per_minute: number | null;
  filler_word_count: number | null;
  clarity_score: number | null;
  pacing_score: number | null;
  eye_contact_percentage: number | null;
  gaze_stability: number | null;
  dominant_emotion: string | null;
  emotion_confidence: number | null;
  presence_score: number | null;
  question_id: string;
  analyses: Array<{
    overall_score: number;
    content_score?: number;
    communication_score?: number;
    delivery_score?: number;
    summary: string;
    communication_patterns?: {
      usedStructure?: string;
      clarityLevel?: string;
      concisenessLevel?: string;
      exampleQuality?: string;
    };
    strengths: any;
    improvements: any;
    next_steps?: string[];
  }>;
}

interface Question {
  id: string;
  question_text: string;
  position: number;
}

interface SessionDetails {
  id: string;
  session_type: string;
  context: string;
  created_at: string;
  status: string;
  questions: Question[];
  recordings: Recording[];
}

export default function SessionDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { user, loading } = useAuth();
  const [session, setSession] = useState<SessionDetails | null>(null);
  const [selectedRecording, setSelectedRecording] = useState<Recording | null>(null);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [openExamples, setOpenExamples] = useState<Record<number, boolean>>({});

  // Redirect to home if not logged in
  useEffect(() => {
    if (!loading && !user) {
      router.push('/');
    }
  }, [user, loading, router]);

  // Fetch session details
  useEffect(() => {
    const fetchSession = async () => {
      if (!user) return;

      setIsLoading(true);
      try {
        const data = await getSessionDetails(id);
        setSession(data);

        // Auto-select first recording
        if (data.recordings && data.recordings.length > 0) {
          setSelectedRecording(data.recordings[0]);
        }
      } catch (error) {
        console.error('Error fetching session:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSession();
  }, [id, user]);

  // Load video when recording selected
  useEffect(() => {
    const loadVideo = async () => {
      if (selectedRecording && selectedRecording.video_url) {
        try {
          const signedUrl = await getVideoUrl(selectedRecording.video_url);
          setVideoSrc(signedUrl);
        } catch (error) {
          console.error('Failed to load video:', error);
        }
      }
    };

    loadVideo();
  }, [selectedRecording]);

  if (loading || isLoading || !user) {
    return (
      <main className="min-h-screen text-white p-8 relative">
        <div className="absolute inset-0 bg-black/80 backdrop-blur-md -z-10" />
        <div className="max-w-5xl mx-auto text-center pt-20">
          <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin mx-auto"></div>
        </div>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="min-h-screen text-white p-8 relative">
        <div className="absolute inset-0 bg-black/80 backdrop-blur-md -z-10" />
        <div className="max-w-5xl mx-auto text-center pt-20">
          <p className="text-white/60">Session not found</p>
          <Link href="/history" className="text-white underline mt-4 inline-block">
            Back to History
          </Link>
        </div>
      </main>
    );
  }

  // Get question text for selected recording
  const getQuestionForRecording = (recording: Recording) => {
    const question = session.questions.find(q => q.id === recording.question_id);
    return question?.question_text || 'Question not found';
  };

  return (
    <main className="min-h-screen text-white p-8 pb-24 relative">
      {/* Background Gradient Overlay */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md -z-10" />

      <div className="max-w-7xl mx-auto relative z-10">
        <header className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60">
              Session Details
            </h1>
            <p className="text-white/60 text-sm mt-2">
              {new Date(session.created_at).toLocaleString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}
            </p>
          </div>
          <div className="flex gap-4">
            <Link
              href="/history"
              className="bg-white/20 hover:bg-white/30 active:bg-white/40 backdrop-blur-lg border border-white/30 transition-all duration-200 px-6 py-2 rounded-full text-sm font-medium text-white"
            >
              Back to History
            </Link>
          </div>
        </header>

        {/* Session Info */}
        <div className="bg-white/10 backdrop-blur-xl border border-white/20 shadow-xl rounded-2xl p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-white mb-1">
                {session.session_type === 'job-interview' && '💼 Job Interview'}
                {session.session_type === 'sales-pitch' && '🚀 Sales Pitch'}
                {session.session_type === 'presentation' && '🎯 Presentation'}
              </h2>
              <p className="text-white/60 text-sm">{session.context}</p>
            </div>
            <div className={`px-3 py-1 rounded-full text-sm font-semibold ${
              session.status === 'completed'
                ? 'bg-green-500/20 text-green-300 border border-green-500/30'
                : 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30'
            }`}>
              {session.status === 'completed' ? 'Completed' : 'In Progress'}
            </div>
          </div>
        </div>

        <div className="flex gap-6">
          {/* Left Sidebar: Recording List (30%) */}
          <div className="w-[30%] flex-shrink-0">
            <div className="bg-white/8 backdrop-blur-2xl border border-white/15 shadow-2xl rounded-2xl p-5 sticky top-6">
              <h2 className="text-lg font-semibold text-white/90 mb-4 flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>
                Recordings
              </h2>

              <div className="space-y-2 max-h-[calc(100vh-200px)] overflow-y-auto pr-2 custom-scrollbar">
                {session.recordings.map((rec, idx) => {
                  const question = session.questions.find(q => q.id === rec.question_id);
                  return (
                    <button
                      key={rec.id}
                      onClick={() => setSelectedRecording(rec)}
                      className={`w-full text-left p-3.5 rounded-xl border transition-all duration-200 group ${
                        selectedRecording?.id === rec.id
                          ? 'bg-white/15 border-white/30 shadow-lg ring-1 ring-white/20'
                          : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <span className="text-[10px] text-white/50 font-semibold tracking-wider uppercase">
                          Q{(question?.position || 0) + 1}
                        </span>
                        {rec.duration && (
                          <span className="text-[10px] text-white/60 font-mono bg-white/10 px-1.5 py-0.5 rounded">
                            {Math.floor(rec.duration / 60)}:{(rec.duration % 60).toString().padStart(2, '0')}
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-medium text-white/80 line-clamp-3 leading-relaxed">
                        {question?.question_text || 'Question not found'}
                      </p>
                      {selectedRecording?.id === rec.id && (
                        <div className="mt-2 pt-2 border-t border-white/10">
                          <div className="flex items-center gap-1.5 text-[10px] text-white/70">
                            <div className="w-1 h-1 bg-green-400 rounded-full animate-pulse"></div>
                            <span>Selected</span>
                          </div>
                        </div>
                      )}
                    </button>
                  );
                })}
                {session.recordings.length === 0 && (
                  <div className="p-8 text-center text-white/30 bg-white/5 rounded-xl border border-white/5">
                    <p className="text-sm">No recordings found.</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Area: Analysis View (70%) */}
          <div className="flex-1 space-y-6">
            {/* Video Player */}
            <div className="bg-white/10 backdrop-blur-xl border border-white/20 shadow-xl rounded-3xl p-1 aspect-video flex items-center justify-center bg-black/40 overflow-hidden relative">
              {videoSrc ? (
                <video
                  src={videoSrc}
                  controls
                  className="w-full h-full object-contain rounded-2xl"
                />
              ) : (
                <div className="text-center p-8">
                  <p className="text-white/50 mb-2">Select a recording to view video</p>
                </div>
              )}
            </div>

            {/* Transcript Viewer */}
            {selectedRecording && selectedRecording.transcript && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <TranscriptViewer
                  transcript={selectedRecording.transcript}
                  duration={selectedRecording.duration || 0}
                  highlightFillerWords={true}
                />
              </div>
            )}

            {/* Analysis Metrics */}
            {selectedRecording && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                {/* AI Feedback Card */}
                <div className="bg-white/10 backdrop-blur-xl border border-white/20 shadow-xl rounded-3xl p-6">
                  <h3 className="text-lg font-semibold mb-4 text-white/90 flex items-center gap-2">
                    <span>🤖</span> AI Coach Feedback
                  </h3>

                  {selectedRecording.analyses && selectedRecording.analyses.length > 0 ? (
                    <div className="space-y-4">
                      {/* 3-Score System */}
                      {(selectedRecording.analyses[0].content_score !== undefined ||
                        selectedRecording.analyses[0].communication_score !== undefined ||
                        selectedRecording.analyses[0].delivery_score !== undefined) && (
                        <div className="grid grid-cols-3 gap-3 mb-4">
                          {selectedRecording.analyses[0].content_score !== undefined && (
                            <div className="bg-white/5 rounded-xl p-3 text-center">
                              <div className="text-xs text-white/50 uppercase mb-1">Content</div>
                              <div className="text-xl font-bold text-white">{selectedRecording.analyses[0].content_score}</div>
                            </div>
                          )}
                          {selectedRecording.analyses[0].communication_score !== undefined && (
                            <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-3 text-center">
                              <div className="text-[10px] text-blue-300/70 uppercase mb-1 whitespace-nowrap">Communication</div>
                              <div className="text-xl font-bold text-blue-200">{selectedRecording.analyses[0].communication_score}</div>
                            </div>
                          )}
                          {selectedRecording.analyses[0].delivery_score !== undefined && (
                            <div className="bg-white/5 rounded-xl p-3 text-center">
                              <div className="text-xs text-white/50 uppercase mb-1">Delivery</div>
                              <div className="text-xl font-bold text-white">{selectedRecording.analyses[0].delivery_score}</div>
                            </div>
                          )}
                        </div>
                      )}

                      <p className="text-white/80 text-sm leading-relaxed">
                        {selectedRecording.analyses[0].summary}
                      </p>

                      {selectedRecording.analyses[0].strengths && selectedRecording.analyses[0].strengths.length > 0 && (
                        <div>
                          <h4 className="text-green-300 text-xs font-semibold mb-2">✓ Strengths</h4>
                          <ul className="space-y-1">
                            {selectedRecording.analyses[0].strengths.slice(0, 2).map((strength: any, idx: number) => (
                              <li key={idx} className="text-white/70 text-xs">• {strength.detail}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {selectedRecording.analyses[0].improvements && selectedRecording.analyses[0].improvements.length > 0 && (
                        <div>
                          <h4 className="text-yellow-300 text-xs font-semibold mb-2">→ Areas to Improve</h4>
                          <ul className="space-y-1">
                            {selectedRecording.analyses[0].improvements.slice(0, 2).map((improvement: any, idx: number) => (
                              <li key={idx} className="text-white/70 text-xs">• {improvement.suggestion}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-white/50 text-sm">No AI feedback available for this recording</p>
                  )}
                </div>

                {/* Performance Metrics Card */}
                <div className="bg-white/10 backdrop-blur-xl border border-white/20 shadow-xl rounded-3xl p-6 space-y-5">
                  <h3 className="text-lg font-semibold mb-2 text-white/90 flex items-center gap-2">
                    <span>📊</span> Performance Metrics
                  </h3>

                  {/* Speech Metrics */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-1 h-1 rounded-full bg-blue-400"></div>
                      <span className="text-[10px] text-white/40 uppercase tracking-wider font-semibold">Speech Analysis</span>
                    </div>

                    {/* Clarity Score */}
                    <div>
                      <div className="flex justify-between text-xs mb-1 text-white/60">
                        <span>Clarity</span>
                        <span>{selectedRecording.clarity_score || 0}%</span>
                      </div>
                      <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-green-400 to-emerald-300 transition-all duration-1000"
                          style={{ width: `${selectedRecording.clarity_score || 0}%` }}
                        />
                      </div>
                    </div>

                    {/* Pacing Score */}
                    <div>
                      <div className="flex justify-between text-xs mb-1 text-white/60">
                        <span>Pacing</span>
                        <span>{selectedRecording.pacing_score || 0}%</span>
                      </div>
                      <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-blue-400 to-cyan-300 transition-all duration-1000"
                          style={{ width: `${selectedRecording.pacing_score || 0}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Video Metrics */}
                  {(selectedRecording.eye_contact_percentage || selectedRecording.presence_score) && (
                    <div className="space-y-4 pt-4 border-t border-white/10">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-1 h-1 rounded-full bg-purple-400"></div>
                        <span className="text-[10px] text-white/40 uppercase tracking-wider font-semibold">Video Analysis</span>
                      </div>

                      {/* Eye Contact */}
                      {selectedRecording.eye_contact_percentage && (
                        <div>
                          <div className="flex justify-between text-xs mb-1 text-white/60">
                            <span>Eye Contact</span>
                            <span>{selectedRecording.eye_contact_percentage}%</span>
                          </div>
                          <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-purple-400 to-violet-300 transition-all duration-1000"
                              style={{ width: `${selectedRecording.eye_contact_percentage}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Presence Score */}
                      {selectedRecording.presence_score && (
                        <div>
                          <div className="flex justify-between text-xs mb-1 text-white/60">
                            <span>Overall Presence</span>
                            <span>{selectedRecording.presence_score}%</span>
                          </div>
                          <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-orange-400 to-red-400 transition-all duration-1000"
                              style={{ width: `${selectedRecording.presence_score}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Stats Row */}
                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <div className="bg-white/5 rounded-xl p-3">
                      <div className="text-[10px] text-white/50 uppercase tracking-wider mb-1">Words/Min</div>
                      <div className="text-2xl font-bold text-white">{selectedRecording.words_per_minute || 0}</div>
                    </div>
                    <div className="bg-white/5 rounded-xl p-3">
                      <div className="text-[10px] text-white/50 uppercase tracking-wider mb-1">Filler Words</div>
                      <div className="text-2xl font-bold text-yellow-300">{selectedRecording.filler_word_count || 0}</div>
                    </div>
                  </div>

                  {/* Dominant Emotion */}
                  {selectedRecording.dominant_emotion && (
                    <div className="pt-2 border-t border-white/10">
                      <div className="text-[10px] text-white/40 uppercase tracking-wider mb-2 flex items-center gap-2">
                        <div className="w-1 h-1 rounded-full bg-indigo-400"></div>
                        <span className="font-semibold">Detected Emotion</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="inline-block bg-gradient-to-r from-indigo-500/20 to-purple-500/20 border border-indigo-400/30 px-4 py-2 rounded-full">
                          <span className="text-sm font-medium text-indigo-200 capitalize">{selectedRecording.dominant_emotion}</span>
                        </div>
                        {selectedRecording.emotion_confidence && (
                          <div className="text-[10px] text-white/50">
                            <span className="font-mono">{Math.round(selectedRecording.emotion_confidence)}%</span>
                            <span className="ml-1">confidence</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Detailed Feedback Section with Communication Patterns and Framework Examples */}
            {selectedRecording && selectedRecording.analyses && selectedRecording.analyses.length > 0 && selectedRecording.analyses[0].improvements && selectedRecording.analyses[0].improvements.length > 0 && (
              <div className="space-y-6 mt-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                {/* Communication Patterns Card */}
                {selectedRecording.analyses[0].communication_patterns && (
                  <div className="bg-white/10 backdrop-blur-xl border border-white/20 shadow-xl rounded-3xl p-6">
                    <h3 className="text-lg font-semibold mb-4 text-white/90 flex items-center gap-2">
                      <span>🎯</span> Communication Analysis
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      {selectedRecording.analyses[0].communication_patterns.usedStructure && (
                        <div className="bg-white/5 rounded-xl p-3">
                          <div className="text-xs text-white/50 uppercase mb-1">Structure</div>
                          <div className="text-sm text-white capitalize">{selectedRecording.analyses[0].communication_patterns.usedStructure}</div>
                        </div>
                      )}
                      {selectedRecording.analyses[0].communication_patterns.clarityLevel && (
                        <div className="bg-white/5 rounded-xl p-3">
                          <div className="text-xs text-white/50 uppercase mb-1">Clarity</div>
                          <div className="text-sm text-white capitalize">{selectedRecording.analyses[0].communication_patterns.clarityLevel}</div>
                        </div>
                      )}
                      {selectedRecording.analyses[0].communication_patterns.concisenessLevel && (
                        <div className="bg-white/5 rounded-xl p-3">
                          <div className="text-xs text-white/50 uppercase mb-1">Conciseness</div>
                          <div className="text-sm text-white capitalize">{selectedRecording.analyses[0].communication_patterns.concisenessLevel}</div>
                        </div>
                      )}
                      {selectedRecording.analyses[0].communication_patterns.exampleQuality && (
                        <div className="bg-white/5 rounded-xl p-3">
                          <div className="text-xs text-white/50 uppercase mb-1">Examples</div>
                          <div className="text-sm text-white capitalize">{selectedRecording.analyses[0].communication_patterns.exampleQuality}</div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Detailed Improvements with Framework Examples */}
                <div className="bg-white/10 backdrop-blur-xl border border-white/20 shadow-xl rounded-3xl p-6">
                  <h3 className="text-lg font-semibold mb-4 text-white/90 flex items-center gap-2">
                    <span>📚</span> Coaching Framework Examples
                  </h3>
                  <div className="space-y-4">
                    {selectedRecording.analyses[0].improvements.map((improvement: any, idx: number) => (
                      <div key={idx} className={`border-l-4 ${
                        improvement.priority === 'high' ? 'border-red-400/50' :
                        improvement.priority === 'medium' ? 'border-yellow-400/50' :
                        'border-blue-400/50'
                      } bg-white/5 p-4 rounded-lg`}>
                        {/* Priority Badge */}
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          improvement.priority === 'high' ? 'bg-red-500/20 text-red-300' :
                          improvement.priority === 'medium' ? 'bg-yellow-500/20 text-yellow-300' :
                          'bg-blue-500/20 text-blue-300'
                        }`}>
                          {improvement.priority.toUpperCase()}
                        </span>

                        {/* Area & Detail */}
                        <h4 className="text-white font-semibold mt-3 capitalize">{improvement.area}</h4>
                        <p className="text-white/70 text-sm mt-1">{improvement.detail}</p>

                        {/* Suggestion */}
                        <div className="mt-3 bg-white/5 p-3 rounded-lg border border-white/10">
                          <p className="text-white/80 text-sm">💡 {improvement.suggestion}</p>
                        </div>

                        {/* Framework Example (Collapsible) */}
                        {improvement.example && (
                          <div className="mt-3">
                            <button
                              onClick={() => setOpenExamples(prev => ({ ...prev, [idx]: !prev[idx] }))}
                              className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors"
                            >
                              {openExamples[idx] ? (
                                <>
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                  </svg>
                                  Hide Framework Example
                                </>
                              ) : (
                                <>
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                  </svg>
                                  Show Framework Example
                                </>
                              )}
                            </button>

                            {openExamples[idx] && (
                              <div className="mt-3 bg-blue-500/10 border border-blue-500/30 p-4 rounded-lg animate-in fade-in slide-in-from-top-2 duration-200">
                                <div className="flex items-start gap-2 mb-2">
                                  <span className="text-xs text-blue-400/70 uppercase font-semibold">Framework Template:</span>
                                  <span className="text-xs text-blue-300/50">(Adapt with your details)</span>
                                </div>
                                <div className="text-white/90 text-sm leading-relaxed whitespace-pre-wrap font-mono bg-black/20 p-3 rounded">
                                  {improvement.example}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Next Steps */}
                  {selectedRecording.analyses[0].next_steps && selectedRecording.analyses[0].next_steps.length > 0 && (
                    <div className="mt-6 pt-6 border-t border-white/10">
                      <h4 className="text-white font-semibold mb-3 flex items-center gap-2">
                        <span>🎯</span> Next Steps
                      </h4>
                      <ul className="space-y-2">
                        {selectedRecording.analyses[0].next_steps.map((step: string, idx: number) => (
                          <li key={idx} className="flex items-start gap-2 text-white/70 text-sm">
                            <span className="text-blue-400 font-bold">{idx + 1}.</span>
                            <span>{step}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
