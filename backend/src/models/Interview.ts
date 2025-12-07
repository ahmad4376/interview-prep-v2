import mongoose, { Schema, Document } from 'mongoose';

interface QuestionHistoryItem {
  question_id: number;
  asked_at: Date;
  question_text: string;
  was_modified: boolean;
  modification_reason?: string;

  transcript: string;
  audio_url?: string;
  duration?: number;

  evaluation?: {
    completeness_score: number;
    confidence_score: number;
    key_points_covered: string[];
    key_points_missed: string[];
    feedback: string;
    suggested_follow_up?: string;
  };

  follow_ups?: Array<{
    question_text: string;
    transcript: string;
    asked_at: Date;
  }>;
}

export interface IInterview extends Document {
  userId: string; // Clerk user ID
  title: string;
  company: string;
  description: string;

  // Question pool (from databank)
  selectedQuestions: Array<{
    question_id: number;
    rank: number;
    initial_relevance_score: number;
  }>;

  // Real-time session data
  currentIndex: number;
  status: 'scheduled' | 'in-progress' | 'completed' | 'abandoned';

  // Question history with LLM decisions
  questionHistory: QuestionHistoryItem[];

  // Interview metrics
  metrics?: {
    total_duration: number;
    questions_asked: number;
    questions_skipped: number;
    average_response_time: number;
    overall_performance_score: number;
  };

  // Interview feedback
  feedback?: {
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
    generated_at: Date;
  };

  // LLM's adaptive strategy
  interview_strategy?: {
    difficulty_progression: string;
    focus_areas: string[];
    skipped_areas: string[];
  };

  // Mongoose timestamps (added by { timestamps: true })
  createdAt: Date;
  updatedAt: Date;
}

const interviewSchema = new Schema<IInterview>(
  {
    userId: { type: String, required: true, index: true },
    title: { type: String, required: true },
    company: { type: String, required: true },
    description: { type: String, required: true },

    selectedQuestions: [{
      question_id: { type: Number, required: true },
      rank: Number,
      initial_relevance_score: Number
    }],

    currentIndex: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['scheduled', 'in-progress', 'completed', 'abandoned'],
      default: 'scheduled',
      index: true
    },

    questionHistory: [{
      question_id: Number,
      asked_at: Date,
      question_text: String,
      was_modified: Boolean,
      modification_reason: String,

      transcript: String,
      audio_url: String,
      duration: Number,

      evaluation: {
        completeness_score: Number,
        confidence_score: Number,
        key_points_covered: [String],
        key_points_missed: [String],
        feedback: String,
        suggested_follow_up: String
      },

      follow_ups: [{
        question_text: String,
        transcript: String,
        asked_at: Date
      }]
    }],

    metrics: {
      total_duration: Number,
      questions_asked: Number,
      questions_skipped: Number,
      average_response_time: Number,
      overall_performance_score: Number
    },

    feedback: {
      overall_score: Number,
      strengths: [String],
      weaknesses: [String],
      improvements: [String],
      confidence_assessment: {
        score: Number,
        explanation: String
      },
      communication_style: {
        type: { type: String },
        explanation: String
      },
      approach_analysis: {
        type: { type: String },
        explanation: String
      },
      generated_at: Date
    },

    interview_strategy: {
      difficulty_progression: String,
      focus_areas: [String],
      skipped_areas: [String]
    }
  },
  { timestamps: true }
);

// Indexes
interviewSchema.index({ userId: 1, createdAt: -1 });
interviewSchema.index({ status: 1, userId: 1 });

export default mongoose.model<IInterview>('Interview', interviewSchema);
