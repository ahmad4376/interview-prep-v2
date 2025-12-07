'use client';

import { useEffect, useState, useRef } from 'react';
import { useAuth } from '@clerk/nextjs';

// (removed unused SpeechToTextProps)

export function useSpeechToText() {
  const { getToken } = useAuth();

  const [currentTranscript, setCurrentTranscript] = useState('');
  const [finalizedTranscripts, setFinalizedTranscripts] = useState<string[]>([]);
  const [isTranscribing, setIsTranscribing] = useState(false);

  // speaking state and ref to keep callback closures up-to-date
  const [isSpeaking, setIsSpeaking] = useState(false);
  const isSpeakingRef = useRef<boolean>(false);
  useEffect(() => {
    isSpeakingRef.current = isSpeaking;
  }, [isSpeaking]);
  const setSpeaking = (v: boolean) => {
    isSpeakingRef.current = v;
    console.log('[STT] isSpeaking set to', v);
    setIsSpeaking(v);
  };

  const socketRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Track if we received speech_final for current utterance
  const speechFinalReceivedRef = useRef<boolean>(false);

  useEffect(() => {
    return () => {
      // Cleanup on unmount
      try {
        mediaRecorderRef.current?.stop();
      } catch {}
      try {
        streamRef.current?.getTracks().forEach((t: MediaStreamTrack) => t.stop());
      } catch {}
      try {
        socketRef.current?.close();
      } catch {}

      // Reset state
      setSpeaking(false);
      speechFinalReceivedRef.current = false;
    };
  }, []);

  const startTranscription = async () => {
    try {
      try {
        await getToken?.();
      } catch {
        // ignore token errors (if optional)
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;

      const deepgramKey = process.env.NEXT_PUBLIC_DEEPGRAM_API_KEY ?? '';
      const socket = new WebSocket(
        'wss://api.deepgram.com/v1/listen?' +
        'model=nova-3&' +
        'punctuate=true&' +
        'interim_results=true&' +
        'endpointing=700&' +
        'utterance_end_ms=1500',
        ['token', deepgramKey]
      );
      socketRef.current = socket;

      socket.onopen = () => {
        mediaRecorder.addEventListener('dataavailable', (event: BlobEvent) => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(event.data);
          }
        });
        // send blobs every 250ms
        mediaRecorder.start(250);
      };

      socket.onmessage = (message: MessageEvent) => {
        try {
          const received = JSON.parse(message.data);

          // ===== HANDLE UTTERANCEEND EVENT =====
          if (received.type === 'UtteranceEnd') {
            console.log('[Deepgram] UtteranceEnd detected at:', received.last_word_end);

            // Only trigger if we haven't already sent via speech_final
            if (!speechFinalReceivedRef.current) {
              console.log('[Deepgram] No speech_final received, using UtteranceEnd as trigger');
              setSpeaking(false); // This triggers the send via useEffect
            } else {
              console.log('[Deepgram] speech_final already handled, ignoring UtteranceEnd');
            }

            // Reset for next utterance
            speechFinalReceivedRef.current = false;
            return;
          }

          // ===== HANDLE NORMAL TRANSCRIPT RESULTS =====
          const alt = received?.channel?.alternatives?.[0];
          const result = alt?.transcript ?? null;
          const isFinal = received?.is_final ?? alt?.is_final ?? false;
          const speechFinal = received?.speech_final ?? false;

          if (!result) return;

          // When we receive ANY transcript (interim or final), user is speaking
          // This provides immediate UI feedback (replaces VAD functionality)
          if (!isSpeakingRef.current) {
            console.log('[Deepgram] First transcript received, user is speaking');
            setSpeaking(true);
          }

          // ===== HANDLE FINAL TRANSCRIPTS =====
          if (isFinal) {
            console.log('[Deepgram] Final transcript:', result, {
              speechFinal,
              length: result.length
            });

            // Add to finalized transcripts
            setFinalizedTranscripts((prev) => [...prev, result]);

            // Clear interim display (prevents stale text)
           

            // If endpointing triggered (speech_final=true), send immediately
            if (speechFinal) {
              console.log('[Deepgram] speech_final=true, triggering send (fast path)');
              speechFinalReceivedRef.current = true;
              setSpeaking(false); // This triggers the send via useEffect
              setCurrentTranscript('');
            }
            // Otherwise, wait for UtteranceEnd (fallback for noisy environments)
          }
          // ===== HANDLE INTERIM TRANSCRIPTS =====
          else {
            console.log('[Deepgram] Interim transcript:', result);
            setCurrentTranscript(result);
          }
        } catch (e) {
          console.error('Failed to parse Deepgram message:', e);
        }
      };

      setIsTranscribing(true);
    } catch (err) {
      console.error('Failed to start transcription:', err);
      throw err;
    }
  };

  const stopTranscription = () => {
    try {
      mediaRecorderRef.current?.stop();
    } catch {}
    try {
      streamRef.current?.getTracks().forEach((track: MediaStreamTrack) => track.stop());
    } catch {}
    try {
      socketRef.current?.close();
    } catch {}

    mediaRecorderRef.current = null;
    streamRef.current = null;
    socketRef.current = null;

    // Reset speech state
    setSpeaking(false);
    speechFinalReceivedRef.current = false;

    setIsTranscribing(false);
    setCurrentTranscript('');
  };

  const toggleTranscription = async () => {
    if (isTranscribing) {
      stopTranscription();
    } else {
      await startTranscription();
    }
  };

  return {
    currentTranscript,
    finalizedTranscripts,
    isTranscribing,
    isSpeaking, // exposed speaking state
    toggleTranscription,
    setFinalizedTranscripts
  };
}

