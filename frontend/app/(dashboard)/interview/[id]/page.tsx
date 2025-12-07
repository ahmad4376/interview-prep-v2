'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import { Phone, PhoneOff } from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import { useSpeechToText } from '@/components/SpeechToText';
import { useTextToSpeech } from '@/components/TextToSpeech';
import { useAudioQueue } from '@/components/useAudioQueue';
import { set } from 'date-fns';

export default function InterviewPage() {
  const params = useParams();
  const router = useRouter();
  const interviewId = params?.id as string;
  const { getToken } = useAuth();

  const [callActive, setCallActive] = useState(false);

  const socketRef = useRef<Socket | null>(null);

  // Track the last transcript sent to backend
  const lastTranscriptRef = useRef<string>('');

  // Text buffer for batching chunks before TTS
  const textBufferRef = useRef<string>('');

  // Lock to prevent concurrent TTS processing
  const isProcessingRef = useRef<boolean>(false);

  // Flag to track if flush is pending
  const pendingFlushRef = useRef<boolean>(false);


  const {
    currentTranscript,
    finalizedTranscripts,
    isTranscribing,
    isSpeaking,
    toggleTranscription,
    setFinalizedTranscripts,
  } = useSpeechToText();

  const textToAudioBuffer = useTextToSpeech();

  const {
    enqueue,
    clearQueue,
    resetFirstAudioFlag,
    queueLength,
    isPlaying,
    currentPlayingText,
  } = useAudioQueue(isSpeaking);

  // Helper functions for text buffering
  const countWords = (text: string): number => {
    return text.trim().split(/\s+/).filter(Boolean).length;
  };

  const extractFirstNWords = (text: string, n: number) => {
    const words = text.trim().split(/\s+/);
    const batch = words.slice(0, n).join(' ');
    const remainder = words.slice(n).join(' ');
    return { batch, remainder };
  };

  const processTextBuffer = async (forceFlush: boolean = false) => {
    // If already processing, queue the flush for later
    if (isProcessingRef.current) {
      if (forceFlush) {
        pendingFlushRef.current = true;
      }
      return;
    }

    const currentBuffer = textBufferRef.current;
    const wordCount = countWords(currentBuffer);

    if (wordCount >= 20 || (forceFlush && wordCount > 0)) {
      // SET LOCK IMMEDIATELY - before any buffer manipulation
      isProcessingRef.current = true;

      try {
        let textToConvert = currentBuffer;
        let remainder = '';

        if (!forceFlush && wordCount >= 20) {
          const extracted = extractFirstNWords(currentBuffer, 20);
          textToConvert = extracted.batch;
          remainder = extracted.remainder;
        }

        // Now safe to update buffer - lock is already set
        textBufferRef.current = remainder;

        // Convert to audio
        const audioBuffer = await textToAudioBuffer(textToConvert);
        enqueue(audioBuffer, textToConvert);
      } finally {
        // Release processing lock
        isProcessingRef.current = false;

        // Check if flush is pending
        if (pendingFlushRef.current) {
          pendingFlushRef.current = false;
          await processTextBuffer(true);
        } else {
          // Check if buffer has accumulated more words while we were processing
          const newWordCount = countWords(textBufferRef.current);
          if (newWordCount >= 20) {
            // Recursively process the next batch
            await processTextBuffer(false);
          }
        }
      }
    }
  };

  // Socket connection setup
  useEffect(() => {
    if (!interviewId) return;

    let mounted = true;
    let socket: Socket | null = null;

    const initializeSocket = async () => {
      try {
        const token = await getToken();
        if (!mounted) return;

        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

        socket = io(backendUrl, {
          auth: {
            token: token || undefined,
          },
          reconnection: false, // Disable auto-reconnection to prevent loops
          timeout: 10000,
          transports: ['websocket'], // Force WebSocket only for lower latency
          upgrade: false,
        });

        socketRef.current = socket;

        // Join interview session
        socket.on('connect', () => {
          socket?.emit('join_interview', { interviewId });
        });

        // Listen for streamed text chunks
        socket.on('text_chunk', async (data: { chunk: string }) => {
          if (!mounted) return;

          // Add chunk to buffer
          textBufferRef.current += data.chunk;

          // Process buffer if we have enough words
          await processTextBuffer(false);
        });

        // Listen for complete streamed text
        socket.on('text_complete', async (data: { fullText: string }) => {
          if (!mounted) return;

          // Flush any remaining buffered text
          // Note: Don't clear buffer here - processTextBuffer will handle it
          await processTextBuffer(true);
        });

        // Listen for interview completion
        socket.on('interview_completed', (data: { message: string; score: number }) => {
          if (!mounted) return;

          console.log('Interview completed with score:', data.score);

          // Stop transcription if active
          if (isTranscribing) {
            toggleTranscription();
          }

          // Clear state
          setCallActive(false);
          clearQueue();

          // Disconnect socket
          socket.disconnect();

          // Redirect to dashboard after 2 seconds
          setTimeout(() => {
            router.push('/dashboard');
          }, 2000);
        });
      } catch (error) {
        // Socket initialization failed - silently handle
      }
    };

    initializeSocket();

    return () => {
      mounted = false;
      if (socket) {
        socket.removeAllListeners();
        socket.disconnect();
        socketRef.current = null;
      }
      // Clear text buffer on cleanup
      textBufferRef.current = '';
      isProcessingRef.current = false;
      pendingFlushRef.current = false;
    };
  }, [interviewId]); // Only depend on interviewId

  // Send transcript when user stops speaking
  useEffect(() => {
    // When user stops speaking and there's finalized content
    console.log('isSpeaking changed:', isSpeaking);
    if (!isSpeaking && finalizedTranscripts.length > 0 && socketRef.current?.connected) {
      const combinedTranscript = finalizedTranscripts.join(' ');
      setFinalizedTranscripts([]);
      if (combinedTranscript && combinedTranscript !== lastTranscriptRef.current) {
        // Clear text buffer before new response
        textBufferRef.current = '';
        isProcessingRef.current = false;
        pendingFlushRef.current = false;

        // Reset first audio flag for new transcript
        resetFirstAudioFlag();
        console.log('Sending user response:', combinedTranscript);
        socketRef.current.emit('user_response', { text: combinedTranscript });
        lastTranscriptRef.current = combinedTranscript;
      }
    }
  }, [isSpeaking, finalizedTranscripts]);

  const startCall = async () => {
    if (!isTranscribing) {
      await toggleTranscription();
    }
    setCallActive(true);

    // Clear text buffer when starting new conversation
    textBufferRef.current = '';
    isProcessingRef.current = false;
    pendingFlushRef.current = false;

    // Trigger initial AI greeting
    if (socketRef.current?.connected) {
      socketRef.current.emit('start_interview');
    }
  };

  const stopCall = async () => {
    if (isTranscribing) {
      await toggleTranscription();
    }
    setCallActive(false);
    clearQueue();
    // Clear text buffer when stopping conversation
    textBufferRef.current = '';
    isProcessingRef.current = false;
    pendingFlushRef.current = false;
  };

  return (
    <div className="min-h-screen bg-[#0b0b0b] text-white flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        <div className="bg-[#0e0e0e] backdrop-blur-lg rounded-3xl shadow-2xl border border-white/10 p-8">

          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold mb-2">Interview Session</h1>
            <p className="text-gray-400">
              {callActive ? 'Session Active' : 'Click Start to begin'}
            </p>
            <div className="mt-2 flex justify-center gap-4 text-sm">
              <span className="text-purple-400">Queue: {queueLength}</span>
              <span className={isPlaying ? 'text-green-400' : 'text-gray-500'}>
                {isPlaying ? 'Playing' : 'Idle'}
              </span>
              <span className={isSpeaking ? 'text-red-400' : 'text-gray-500'}>
                {isSpeaking ? 'User Speaking' : 'Not Speaking'}
              </span>
            </div>
          </div>

          {/* AI Speaking Display */}
          <div className="mb-6 p-6 bg-purple-500/10 border border-purple-500/30 rounded-2xl min-h-[120px]">
            <h3 className="text-sm font-semibold text-purple-400 mb-3">AI Speaking:</h3>
            {currentPlayingText ? (
              <p className="text-green-300 text-lg font-medium">
                {currentPlayingText}
              </p>
            ) : (
              <p className="text-gray-400 italic">
                {callActive ? 'Waiting for next response...' : 'Not active'}
              </p>
            )}
          </div>

          {/* Live Transcription Display */}
          {/* <div className="mb-6 min-h-[80px] p-6 bg-[#0b0b0b]/30 rounded-2xl border border-white/10">
            <h3 className="text-sm font-semibold text-gray-400 mb-2">Live Transcription:</h3>
            <p className="text-gray-300">
              {currentTranscript || (callActive ? 'Start speaking...' : 'Not active')}
            </p>
          </div> */}

          {/* Finalized Transcripts */}
          <div className="mb-6 min-h-[120px] p-6 bg-green-500/10 border border-green-500/30 rounded-2xl">
            <h3 className="text-sm font-semibold text-green-400 mb-2">Finalized Transcripts:</h3>
            {finalizedTranscripts.length === 0 ? (
              <p className="text-gray-400 italic">None yet</p>
            ) : (
              <p>{finalizedTranscripts.join(' ')}</p>
            )}
          </div>

          {/* Controls */}
          <div className="flex justify-center gap-4">
            {!callActive ? (
              <button
                onClick={startCall}
                className="flex items-center gap-3 px-8 py-4 bg-[#3ecf8e] hover:bg-[#36be81] rounded-full font-semibold text-lg text-black shadow-lg transition-all"
              >
                <Phone className="w-6 h-6" />
                Start Session
              </button>
            ) : (
              <button
                onClick={stopCall}
                className="flex items-center gap-3 px-8 py-4 bg-red-600 hover:bg-red-700 rounded-full font-semibold shadow-lg transition-all"
              >
                <PhoneOff className="w-6 h-6" />
                Stop Session
              </button>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
