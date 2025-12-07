# Interview Prep V2 - AI-Powered Real-Time Interview Practice

A modern, real-time interview preparation platform with AI-powered voice conversations using Deepgram for speech processing and OpenAI for intelligent question selection and evaluation.

## 🎯 Key Features

- ✅ **Real-time voice interviews** with Deepgram STT and TTS
- ✅ **Smart audio queue** with 20-word batching for optimal performance
- ✅ **Interrupt handling** - AI stops speaking when you start
- ✅ **Job-specific interviews** - AI selects questions based on your job description
- ✅ **Detailed feedback** - Comprehensive scoring and improvement suggestions
- ✅ **Clean, modern UI** - Built with Next.js 15 and React 19
- ✅ **Secure authentication** - Powered by Clerk

## 🏗️ Architecture

```
Frontend (Next.js 15) ←→ Backend (Express + Socket.IO)
        ↓                           ↓
  Deepgram STT              MongoDB (Interviews)
  Deepgram TTS              OpenAI (Question Logic)
  Audio Queue               Clerk (Auth)
```

## 📦 Tech Stack

### Frontend
- **Next.js 15.1.3** - React framework with App Router
- **React 19** - Latest React with improved hooks
- **TypeScript 5.7.2** - Type safety
- **Tailwind CSS 4.0** - Styling
- **Clerk 6.9.2** - Authentication
- **Socket.IO Client 4.8.1** - Real-time communication
- **Deepgram SDK** - Speech-to-text and text-to-speech

### Backend
- **Express 5.0.1** - Web framework
- **Socket.IO 4.8.1** - WebSocket server
- **MongoDB + Mongoose 8.9.3** - Database
- **TypeScript 5.7.2** - Type safety
- **Deepgram SDK** - Speech processing
- **OpenAI SDK** - GPT-4 for question selection

## 🚀 Getting Started

### Prerequisites

1. **Node.js 20+** - [Download](https://nodejs.org/)
2. **MongoDB Atlas account** - [Sign up](https://www.mongodb.com/cloud/atlas)
3. **Clerk account** - [Sign up](https://clerk.com/)
4. **Deepgram account** - [Sign up](https://deepgram.com/)
5. **OpenAI account** - [Sign up](https://platform.openai.com/)

### Installation

#### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/interview-prep-v2.git
cd interview-prep-v2
```

#### 2. Install Dependencies

```bash
# Install frontend dependencies
cd frontend
npm install

# Install backend dependencies
cd ../backend
npm install
```

#### 3. Set Up Environment Variables

**Frontend** (`frontend/.env.local`):
```bash
# Copy example file
cp .env.local.example .env.local

# Edit with your credentials:
# - Clerk keys (from clerk.com dashboard)
# - Deepgram API key (from deepgram.com)
# - Backend URL (default: http://localhost:8000)
```

**Backend** (`backend/.env`):
```bash
# Copy example file
cp .env.example .env

# Edit with your credentials:
# - MongoDB connection string
# - Clerk keys
# - Deepgram API key
# - OpenAI API key
```

#### 4. Run the Application

```bash
# Terminal 1: Run backend
cd backend
npm run dev

# Terminal 2: Run frontend
cd frontend
npm run dev
```

Visit `http://localhost:3000`

## 🔑 Getting API Keys

### 1. MongoDB Atlas
1. Go to [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas)
2. Create a free cluster
3. Create a database user
4. Whitelist your IP (or 0.0.0.0/0 for development)
5. Get connection string: `mongodb+srv://username:password@cluster.mongodb.net/interview-prep`

### 2. Clerk
1. Go to [clerk.com](https://clerk.com/)
2. Create a new application
3. Copy:
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (starts with `pk_test_`)
   - `CLERK_SECRET_KEY` (starts with `sk_test_`)

### 3. Deepgram
1. Go to [deepgram.com](https://deepgram.com/)
2. Sign up and create API key
3. Copy the API key
4. Used for both speech-to-text (Nova-3 model) and text-to-speech (Aura-Asteria model)

### 4. OpenAI
1. Go to [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Create new secret key
3. Copy the key (starts with `sk-`)

## 📖 How It Works

### Interview Flow

1. **Create Interview**
   - User enters job title, company, and job description
   - Backend uses OpenAI to analyze job requirements
   - Questions are selected based on job context

2. **Real-Time Interview Session**
   - User clicks "Start Session"
   - Deepgram STT transcribes speech in real-time
   - Transcripts are sent to backend via WebSocket
   - OpenAI generates next question or follow-up
   - Backend streams response text in chunks
   - Frontend buffers text in 20-word batches
   - Deepgram TTS converts text to audio
   - Smart queue plays audio sequentially

3. **Audio Queue Management**
   - Text chunks buffered until 20 words
   - Converted to audio and queued
   - Auto-plays when user stops speaking
   - Pauses immediately if user interrupts

4. **Feedback Generation**
   - Interview completion triggers analysis
   - OpenAI evaluates all responses
   - Generates detailed feedback:
     - Overall score (0-100)
     - Strengths and weaknesses
     - Improvement recommendations
     - Confidence assessment
     - Communication style analysis

### Real-Time Audio Flow

```
User speaks → Deepgram STT (WebSocket) → Real-time transcript
                                        ↓
                            User stops speaking
                                        ↓
                            Transcript sent to backend
                                        ↓
                         OpenAI generates response
                                        ↓
                    Text streamed in chunks to frontend
                                        ↓
                          20-word batching
                                        ↓
                    Deepgram TTS → Audio buffer
                                        ↓
                          Queue and play
```

## 🎨 Project Structure

```
interview-prep-v2/
├── frontend/
│   ├── app/
│   │   ├── (dashboard)/
│   │   │   ├── dashboard/page.tsx       # Interview list
│   │   │   ├── create-interview/page.tsx # Create new interview
│   │   │   ├── interview/[id]/page.tsx   # Live interview session
│   │   │   └── feedback/[id]/page.tsx    # Feedback display
│   │   ├── layout.tsx
│   │   ├── page.tsx                      # Landing page
│   │   └── globals.css
│   ├── components/
│   │   ├── SpeechToText.tsx              # Deepgram STT hook
│   │   ├── TextToSpeech.tsx              # Deepgram TTS hook
│   │   └── useAudioQueue.tsx             # Smart audio queue
│   ├── middleware.ts                     # Clerk auth
│   └── package.json
│
└── backend/
    ├── src/
    │   ├── config/
    │   │   └── database.ts               # MongoDB connection
    │   ├── middleware/
    │   │   └── auth.ts                   # Clerk verification
    │   ├── models/
    │   │   └── Interview.ts              # Interview schema
    │   ├── routes/
    │   │   └── interviews.ts             # REST API
    │   ├── sockets/
    │   │   └── interviewHandler.ts       # WebSocket logic
    │   ├── app.ts
    │   └── server.ts
    └── package.json
```

## 🔧 Development

```bash
# Frontend development
cd frontend
npm run dev          # Start dev server with Turbopack
npm run build        # Build for production
npm run lint         # Run ESLint

# Backend development
cd backend
npm run dev          # Start with hot reload (tsx watch)
npm run build        # Compile TypeScript
npm start            # Run compiled code
```

## 🚀 Deployment

### Frontend (Vercel)
1. Push code to GitHub
2. Connect repository to Vercel
3. Add environment variables in Vercel dashboard:
   - All `NEXT_PUBLIC_*` variables
   - `CLERK_SECRET_KEY`
4. Deploy

### Backend (Railway/Render)
1. Create new project
2. Connect GitHub repository
3. Add environment variables:
   - `MONGO_URL`
   - `CLERK_SECRET_KEY`
   - `DEEPGRAM_API_KEY`
   - `OPENAI_API_KEY`
   - `ALLOWED_ORIGINS` (add your Vercel URL)
4. Set root directory to `backend`
5. Deploy

## 📝 API Endpoints

### REST API
- `GET /api/interviews` - Get all interviews for authenticated user
- `POST /api/interviews/create` - Create new interview with job context
- `GET /api/interviews/:id` - Get interview details
- `GET /api/interviews/:id/feedback` - Get interview feedback
- `DELETE /api/interviews/:id` - Delete interview

### WebSocket Events (Socket.IO)

**Client → Server:**
- `join_interview` - Join interview session with interview ID
- `start_interview` - Request initial AI greeting
- `user_response` - Send user's transcribed answer

**Server → Client:**
- `text_chunk` - AI response text chunk (streamed)
- `text_complete` - Signal end of AI response
- `interview_completed` - Interview finished with score

## 🎯 Key Implementation Details

### Speech-to-Text (Deepgram)
- **Model:** Nova-3
- **Features:** Punctuation, interim results
- **Endpointing:** 700ms silence detection
- **Utterance End:** 1500ms fallback for reliability
- **No manual VAD** - Uses Deepgram's native endpointing

### Text-to-Speech (Deepgram)
- **Model:** Aura-Asteria (English)
- **Batching:** 20-word chunks for efficiency
- **Output:** PCM AudioBuffer for Web Audio API

### Audio Queue
- **Smart buffering:** Accumulates text until 20 words
- **Interrupt handling:** Stops playback when user speaks
- **Sequential playback:** Maintains conversation flow
- **Lock mechanism:** Prevents concurrent TTS processing

## 🤝 Contributing

This is a personal project. Feel free to fork and adapt for your needs.

## 📄 License

MIT

## 🙏 Acknowledgments

- OpenAI for GPT-4 API
- Deepgram for speech services
- Clerk for authentication
- Vercel for Next.js

---

Built with ❤️ for better interview preparation
