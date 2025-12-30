'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { deleteSession } from '@/services/sessionManager';

interface SessionCardProps {
  session: {
    id: string;
    session_type: string;
    context: string;
    created_at: string;
    completed_at: string | null;
    status: string;
    questions: { count: number }[];
    recordings: { count: number }[];
  };
  onDelete: () => void;
}

export default function SessionCard({ session, onDelete }: SessionCardProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const questionCount = session.questions[0]?.count || 0;
  const recordingCount = session.recordings[0]?.count || 0;

  // Calculate duration (mock for now - will be calculated from recordings later)
  const estimatedDuration = recordingCount * 2; // Rough estimate: 2 min per recording

  // Format session type
  const getSessionIcon = (type: string) => {
    switch (type) {
      case 'job-interview':
        return '💼';
      case 'sales-pitch':
        return '🚀';
      case 'presentation':
        return '🎯';
      default:
        return '📝';
    }
  };

  const getSessionLabel = (type: string) => {
    switch (type) {
      case 'job-interview':
        return 'Job Interview';
      case 'sales-pitch':
        return 'Sales Pitch';
      case 'presentation':
        return 'Presentation';
      default:
        return type;
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteSession(session.id);
      onDelete();
    } catch (error) {
      console.error('Delete error:', error);
      alert('Failed to delete session. Please try again.');
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  return (
    <>
      <div className="bg-white/10 backdrop-blur-xl border border-white/20 shadow-xl rounded-2xl p-5 hover:bg-white/15 transition-all duration-200 group">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="text-3xl">{getSessionIcon(session.session_type)}</div>
            <div>
              <h3 className="text-white font-semibold text-base">
                {getSessionLabel(session.session_type)}
              </h3>
              <p className="text-white/60 text-xs mt-0.5">
                {new Date(session.created_at).toLocaleString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </p>
            </div>
          </div>

          <div className={`px-2 py-1 rounded-full text-[10px] font-semibold ${
            session.status === 'completed'
              ? 'bg-green-500/20 text-green-300 border border-green-500/30'
              : 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30'
          }`}>
            {session.status === 'completed' ? 'Completed' : 'In Progress'}
          </div>
        </div>

        {/* Context preview */}
        <p className="text-white/70 text-sm mb-4 line-clamp-2 leading-relaxed">
          {session.context}
        </p>

        {/* Stats */}
        <div className="flex items-center gap-4 mb-4 text-xs text-white/50">
          <span className="flex items-center gap-1.5">
            <span>❓</span>
            <span>{questionCount} questions</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span>⏱️</span>
            <span>{estimatedDuration} min</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span>🎥</span>
            <span>{recordingCount} recorded</span>
          </span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Link
            href={`/session/${session.id}`}
            className="flex-1 bg-white/10 hover:bg-white/20 active:bg-white/30 border border-white/20 rounded-full px-4 py-2 text-sm font-medium text-white transition-all text-center"
          >
            View Details
          </Link>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            disabled={isDeleting}
            className="bg-red-500/10 hover:bg-red-500/20 active:bg-red-500/30 border border-red-500/30 rounded-full px-4 py-2 text-sm font-medium text-red-300 transition-all disabled:opacity-50"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => !isDeleting && setShowDeleteConfirm(false)}
          />

          {/* Modal */}
          <div className="relative w-full max-w-md bg-white/10 backdrop-blur-xl border border-white/20 shadow-2xl rounded-3xl p-6">
            <div className="text-center mb-6">
              <div className="w-12 h-12 bg-red-500/20 rounded-full mx-auto mb-3 flex items-center justify-center">
                <span className="text-2xl">🗑️</span>
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Delete Session?</h3>
              <p className="text-white/60 text-sm">
                This will permanently delete this practice session and all associated recordings. This action cannot be undone.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
                className="flex-1 px-4 py-2 rounded-full text-sm font-medium text-white bg-white/10 hover:bg-white/20 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="flex-1 px-4 py-2 rounded-full text-sm font-bold text-white bg-red-500 hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
