import mongoose, { Schema, Document } from 'mongoose';

export interface IQuestion extends Document {
  question_id: number;
  question_title: string;
  question_text: string;
  question_tags: string[];

  // Enhanced metadata for LLM decision-making
  difficulty: 'easy' | 'medium' | 'hard';
  category: 'technical' | 'behavioral' | 'system-design' | 'coding';
  estimated_time: number; // seconds

  // Answer guidance (not shown to user, used by LLM)
  expected_key_points?: string[];
  evaluation_criteria?: Array<{
    criterion: string;
    weight: number;
  }>;

  // Follow-up questions
  follow_up_questions?: Array<{
    trigger_condition: string;
    question_text: string;
  }>;

  // Original Stack Overflow data
  rank_key?: number[];
  view_count?: number;
  score?: number;

  // Prerequisites (questions that should be asked before this)
  prerequisites?: number[];

  // Adaptability hints for LLM
  modification_hints?: {
    can_simplify: boolean;
    can_add_context: boolean;
    context_examples: string[];
  };

  // Mongoose timestamps (added by { timestamps: true })
  createdAt: Date;
  updatedAt: Date;
}

const questionSchema = new Schema<IQuestion>(
  {
    question_id: { type: Number, required: true, unique: true, index: true },
    question_title: { type: String, required: true },
    question_text: { type: String, required: true },
    question_tags: [{ type: String, index: true }],

    difficulty: {
      type: String,
      enum: ['easy', 'medium', 'hard'],
      default: 'medium',
      index: true
    },
    category: {
      type: String,
      enum: ['technical', 'behavioral', 'system-design', 'coding'],
      required: true,
      default: 'technical',
      index: true
    },
    estimated_time: { type: Number, default: 120 },

    expected_key_points: [String],
    evaluation_criteria: [{
      criterion: String,
      weight: Number
    }],

    follow_up_questions: [{
      trigger_condition: String,
      question_text: String
    }],

    rank_key: [Number],
    view_count: Number,
    score: Number,

    prerequisites: [Number],

    modification_hints: {
      can_simplify: { type: Boolean, default: true },
      can_add_context: { type: Boolean, default: true },
      context_examples: [String]
    }
  },
  { timestamps: true }
);

// Indexes for efficient querying
questionSchema.index({ question_tags: 1, difficulty: 1 });
questionSchema.index({ category: 1, difficulty: 1 });

export default mongoose.model<IQuestion>('Question', questionSchema);
