'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import Link from 'next/link';
import { format } from 'date-fns';
import { Play, Plus, Clock, CheckCircle, XCircle, Trash2 } from 'lucide-react';

interface Interview {
  _id: string;
  title: string;
  company: string;
  description: string;
  status: 'scheduled' | 'in-progress' | 'completed' | 'abandoned';
  createdAt: string;
  feedback?: {
    overall_score: number;
  };
  metrics?: {
    questions_asked: number;
    overall_performance_score: number;
  };
}

export default function DashboardPage() {
  const { getToken } = useAuth();
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchInterviews();
  }, []);

  async function fetchInterviews() {
    try {
      const token = await getToken();
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/interviews`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      const data = await response.json();
      setInterviews(data.interviews || []);
    } catch (error) {
      console.error('Failed to fetch interviews:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteInterview(interviewId: string, interviewTitle: string) {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${interviewTitle}"? This action cannot be undone.`
    );

    if (!confirmed) return;

    try {
      setInterviews(prev => prev.filter(i => i._id !== interviewId));

      const token = await getToken();
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/interviews/${interviewId}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        await fetchInterviews();
        alert('Failed to delete interview. Please try again.');
      }
    } catch (error) {
      await fetchInterviews();
      alert('An error occurred while deleting the interview.');
    }
  }

  const getStatusIcon = (status: Interview['status']) => {
    switch (status) {
      case 'scheduled':
        return <Clock className="w-5 h-5 text-blue-500" />;
      case 'in-progress':
        return <Play className="w-5 h-5 text-yellow-500" />;
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'abandoned':
        return <XCircle className="w-5 h-5 text-red-500" />;
    }
  };

  const getStatusColor = (status: Interview['status']) => {
    switch (status) {
      case 'scheduled':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'in-progress':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      case 'completed':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'abandoned':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#3ecf8e]"></div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-white">Your Interviews</h1>
        <Link
          href="/create-interview"
          className="rounded-md bg-[#3ecf8e] px-4 py-2 text-sm font-semibold text-black hover:bg-[#36be81] flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          New Interview
        </Link>
      </div>

      {interviews.length === 0 ? (
        <div className="text-center py-12 rounded-lg border border-white/10 bg-[#0e0e0e]">
          <h3 className="text-xl font-semibold mb-2 text-white">No interviews yet</h3>
          <p className="text-gray-300 mb-6">
            Create your first interview to get started
          </p>
          <Link
            href="/create-interview"
            className="inline-flex items-center gap-2 rounded-md bg-[#3ecf8e] px-6 py-3 font-semibold text-black hover:bg-[#36be81]"
          >
            <Plus className="w-5 h-5" />
            Create Interview
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {interviews.map((interview) => (
            <div
              key={interview._id}
              className="rounded-lg border border-white/10 bg-[#0e0e0e] p-5 transition hover:border-emerald-500/30 hover:shadow-[0_0_0_1px_rgba(62,207,142,0.2)]"
            >
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-xl font-semibold mb-1 text-white">
                    {interview.title}
                  </h3>
                  <p className="text-gray-300">
                    {interview.company}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(interview.status)}
                    <span
                      className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(
                        interview.status
                      )}`}
                    >
                      {interview.status}
                    </span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      handleDeleteInterview(interview._id, interview.title);
                    }}
                    className="p-2 rounded-lg hover:bg-red-500/10 text-gray-400 hover:text-red-400 transition-colors"
                    aria-label="Delete interview"
                    title="Delete interview"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {interview.description && (
                <p className="text-sm text-gray-300 mb-4 line-clamp-2">
                  {interview.description}
                </p>
              )}

              <div className="flex justify-between items-center">
                <div className="text-sm text-gray-400">
                  Created {format(new Date(interview.createdAt), 'MMM d, yyyy')}
                  {interview.metrics && (
                    <span className="ml-4">
                      {interview.metrics.questions_asked} questions •{' '}
                      {interview.metrics.overall_performance_score}% score
                    </span>
                  )}
                </div>
                
                <div className="flex gap-2">
                  {/* Show View Feedback button if feedback exists and status is completed */}
                  {interview.status === 'completed' && interview.feedback && (
                    <Link
                      href={`/feedback/${interview._id}`}
                      className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-medium text-sm transition-colors"
                    >
                      View Feedback
                    </Link>
                  )}

                  {interview.status !== 'completed' && (
                  <Link
                    href={`/interview/${interview._id}`}
                    className="px-4 py-2 rounded-lg bg-[#3ecf8e] hover:bg-[#36be81] text-black font-medium text-sm transition-colors flex items-center gap-2"
                  >
                      <>
                        <Play className="w-4 h-4" />
                        {interview.status === 'in-progress'
                          ? 'Continue'
                          : 'Start'}
                      </>
                  </Link>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
