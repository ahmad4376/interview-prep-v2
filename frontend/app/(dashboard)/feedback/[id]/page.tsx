'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import { ArrowLeft, TrendingUp, TrendingDown, Lightbulb, MessageSquare, Brain, Award } from 'lucide-react';

interface Feedback {
  overall_score: number;
  strengths: string[];
  weaknesses: string[];
  improvements: string[];
  confidence_assessment: {
    score: number;
    explanation: string;
  };
  communication_style: {
    type: string;
    explanation: string;
  };
  approach_analysis: {
    type: string;
    explanation: string;
  };
  generated_at: string;
}

interface InterviewDetails {
  title: string;
  company: string;
  createdAt: string;
}

export default function FeedbackPage() {
  const params = useParams();
  const router = useRouter();
  const { getToken } = useAuth();
  const interviewId = params?.id as string;

  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [interviewDetails, setInterviewDetails] = useState<InterviewDetails | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchFeedback();
  }, []);

  async function fetchFeedback() {
    try {
      const token = await getToken();
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/interviews/${interviewId}/feedback`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch feedback');
      }

      const data = await response.json();
      setFeedback(data.feedback);
      setInterviewDetails(data.interviewDetails);
    } catch (error) {
      console.error('Failed to fetch feedback:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#3ecf8e]"></div>
      </div>
    );
  }

  if (!feedback || !interviewDetails) {
    return (
      <div className="max-w-4xl mx-auto text-center py-12">
        <h2 className="text-2xl font-bold text-white mb-4">Feedback Not Available</h2>
        <p className="text-gray-400 mb-6">This interview doesn't have feedback yet.</p>
        <button
          onClick={() => router.push('/dashboard')}
          className="px-6 py-3 bg-[#3ecf8e] hover:bg-[#36be81] text-black font-semibold rounded-lg"
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-400';
    if (score >= 60) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getScoreBgColor = (score: number) => {
    if (score >= 80) return 'bg-green-500/10 border-green-500/30';
    if (score >= 60) return 'bg-yellow-500/10 border-yellow-500/30';
    return 'bg-red-500/10 border-red-500/30';
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={() => router.push('/dashboard')}
          className="flex items-center gap-2 text-gray-400 hover:text-white mb-4 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to Dashboard
        </button>

        <h1 className="text-3xl font-bold text-white mb-2">Interview Feedback</h1>
        <p className="text-gray-400">
          {interviewDetails.title} at {interviewDetails.company}
        </p>
      </div>

      {/* Overall Score */}
      <div className={`p-8 rounded-2xl border mb-6 ${getScoreBgColor(feedback.overall_score)}`}>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Award className="w-8 h-8 text-[#3ecf8e]" />
              <h2 className="text-2xl font-bold text-white">Overall Performance</h2>
            </div>
            <p className="text-gray-300">Your interview performance score</p>
          </div>
          <div className={`text-6xl font-bold ${getScoreColor(feedback.overall_score)}`}>
            {feedback.overall_score}
            <span className="text-3xl">/100</span>
          </div>
        </div>
      </div>

      {/* Strengths */}
      <div className="bg-[#0e0e0e] border border-white/10 rounded-2xl p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <TrendingUp className="w-6 h-6 text-green-400" />
          <h2 className="text-xl font-bold text-white">Strengths</h2>
        </div>
        <ul className="space-y-3">
          {feedback.strengths.map((strength, idx) => (
            <li key={idx} className="flex items-start gap-3">
              <span className="text-green-400 mt-1">✓</span>
              <span className="text-gray-300">{strength}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Weaknesses */}
      <div className="bg-[#0e0e0e] border border-white/10 rounded-2xl p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <TrendingDown className="w-6 h-6 text-red-400" />
          <h2 className="text-xl font-bold text-white">Areas for Improvement</h2>
        </div>
        <ul className="space-y-3">
          {feedback.weaknesses.map((weakness, idx) => (
            <li key={idx} className="flex items-start gap-3">
              <span className="text-red-400 mt-1">×</span>
              <span className="text-gray-300">{weakness}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Actionable Improvements */}
      <div className="bg-[#0e0e0e] border border-white/10 rounded-2xl p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <Lightbulb className="w-6 h-6 text-yellow-400" />
          <h2 className="text-xl font-bold text-white">Actionable Improvements</h2>
        </div>
        <ul className="space-y-3">
          {feedback.improvements.map((improvement, idx) => (
            <li key={idx} className="flex items-start gap-3">
              <span className="text-yellow-400 mt-1">→</span>
              <span className="text-gray-300">{improvement}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Analysis Grid */}
      <div className="grid md:grid-cols-3 gap-6 mb-6">
        {/* Confidence */}
        <div className="bg-[#0e0e0e] border border-white/10 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-3">
            <Award className="w-5 h-5 text-purple-400" />
            <h3 className="font-semibold text-white">Confidence</h3>
          </div>
          <div className="text-3xl font-bold text-purple-400 mb-2">
            {feedback.confidence_assessment.score}/10
          </div>
          <p className="text-sm text-gray-400">{feedback.confidence_assessment.explanation}</p>
        </div>

        {/* Communication Style */}
        <div className="bg-[#0e0e0e] border border-white/10 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-3">
            <MessageSquare className="w-5 h-5 text-blue-400" />
            <h3 className="font-semibold text-white">Communication</h3>
          </div>
          <div className="text-lg font-bold text-blue-400 mb-2 capitalize">
            {feedback.communication_style.type}
          </div>
          <p className="text-sm text-gray-400">{feedback.communication_style.explanation}</p>
        </div>

        {/* Approach */}
        <div className="bg-[#0e0e0e] border border-white/10 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-3">
            <Brain className="w-5 h-5 text-green-400" />
            <h3 className="font-semibold text-white">Approach</h3>
          </div>
          <div className="text-lg font-bold text-green-400 mb-2 capitalize">
            {feedback.approach_analysis.type}
          </div>
          <p className="text-sm text-gray-400">{feedback.approach_analysis.explanation}</p>
        </div>
      </div>
    </div>
  );
}
