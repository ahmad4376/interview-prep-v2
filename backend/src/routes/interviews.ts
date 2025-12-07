import express from 'express';
import Interview from '../models/Interview.js';
import Question from '../models/Question.js';
import { HybridQuestionSelector } from '../services/questionSelector.js';
import { logger } from '../utils/logger.js';

const router = express.Router();
const questionSelector = new HybridQuestionSelector();

// Get all interviews for a user
router.get('/', async (req, res) => {
  try {
    const userId = req.auth?.userId;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const interviews = await Interview.find({ userId })
      .sort({ createdAt: -1 })
      .lean();

    res.json({ interviews });
  } catch (error) {
    logger.error('Error fetching interviews:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create new interview
router.post('/create', async (req, res) => {
  try {
    const userId = req.auth?.userId;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { jobTitle, company, jobDescription } = req.body;

    if (!jobTitle || !company || !jobDescription) {
      return res.status(400).json({
        message: 'Missing required fields: jobTitle, company, jobDescription',
      });
    }

    logger.info(`Creating interview for user ${userId}: ${jobTitle} at ${company}`);

    // Use hybrid question selector to get initial questions
    const selectedQuestions = await questionSelector.selectInitialQuestions(
      jobTitle,
      jobDescription,
      10
    );

    if (selectedQuestions.length === 0) {
      return res.status(400).json({
        message: 'No suitable questions found. Try a more detailed job description.',
      });
    }

    // Create interview
    const interview = new Interview({
      userId,
      title: jobTitle,
      company,
      description: jobDescription,
      selectedQuestions: selectedQuestions.map((q, index) => ({
        question_id: q.question_id,
        rank: index,
        initial_relevance_score: 0,
      })),
      currentIndex: 0,
      status: 'scheduled',
      questionHistory: [],
    });

    await interview.save();

    logger.info(`Interview created: ${interview._id}`);

    res.status(201).json({
      message: 'Interview created successfully',
      interviewId: interview._id.toString(),
      questionsSelected: selectedQuestions.length,
    });
  } catch (error) {
    logger.error('Error creating interview:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get interview details
router.get('/:id', async (req, res) => {
  try {
    const userId = req.auth?.userId;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const interview = await Interview.findOne({
      _id: req.params.id,
      userId,
    }).lean();

    if (!interview) {
      return res.status(404).json({ message: 'Interview not found' });
    }

    res.json({ interview });
  } catch (error) {
    logger.error('Error fetching interview:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete interview
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.auth?.userId;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { id } = req.params;

    // Find and delete the interview (only if it belongs to the user)
    const interview = await Interview.findOneAndDelete({
      _id: id,
      userId: userId  // Security: ensure user owns this interview
    });

    if (!interview) {
      return res.status(404).json({
        success: false,
        message: 'Interview not found or unauthorized'
      });
    }

    logger.info(`Interview deleted: ${id} by user ${userId}`);

    res.json({
      success: true,
      message: 'Interview deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting interview:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete interview'
    });
  }
});

// Import questions from JSON (for seeding database)
router.post('/import-questions', async (req, res) => {
  try {
    const { questions } = req.body;

    if (!Array.isArray(questions)) {
      return res.status(400).json({ message: 'Invalid format: expected array of questions' });
    }

    const ops = questions.map((q) => ({
      updateOne: {
        filter: { question_id: q.question_id },
        update: { $set: q },
        upsert: true,
      },
    }));

    const result = await Question.bulkWrite(ops, { ordered: false });

    logger.info(`Imported ${result.upsertedCount} new questions, modified ${result.modifiedCount}`);

    res.json({
      message: 'Questions imported successfully',
      inserted: result.upsertedCount,
      modified: result.modifiedCount,
    });
  } catch (error) {
    logger.error('Error importing questions:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all questions (for debugging)
router.get('/questions/all', async (req, res) => {
  try {
    const questions = await Question.find({})
      .sort({ 'rank_key.0': -1 })
      .limit(100)
      .lean();

    res.json({ questions, count: questions.length });
  } catch (error) {
    logger.error('Error fetching questions:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get interview feedback
router.get('/:id/feedback', async (req, res) => {
  try {
    const userId = req.auth?.userId;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const interview = await Interview.findOne({
      _id: req.params.id,
      userId,
    }).lean();

    if (!interview) {
      return res.status(404).json({ message: 'Interview not found' });
    }

    if (!interview.feedback) {
      return res.status(404).json({ message: 'Feedback not available yet' });
    }

    res.json({
      feedback: interview.feedback,
      interviewDetails: {
        title: interview.title,
        company: interview.company,
        createdAt: interview.createdAt
      }
    });
  } catch (error) {
    logger.error('Error fetching feedback:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
