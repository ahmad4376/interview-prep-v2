'use client';

import { useRef, useState } from 'react';

export function useTextToSpeech() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);

  // ========== SIMPLE TTS (Manual Test) - For testing purposes only ==========
  // This function plays audio immediately without queueing
  // const speak = async (text: string) => {
  //   if (!text.trim()) {
  //     console.warn('No text provided for TTS');
  //     return;
  //   }

  //   try {
  //     setIsLoading(true);

  //     const deepgramKey = process.env.NEXT_PUBLIC_DEEPGRAM_API_KEY ?? '';

  //     // Make request to Deepgram TTS API
  //     const response = await fetch('https://api.deepgram.com/v1/speak?model=aura-asteria-en', {
  //       method: 'POST',
  //       headers: {
  //         'Authorization': `Token ${deepgramKey}`,
  //         'Content-Type': 'application/json',
  //       },
  //       body: JSON.stringify({
  //         text: text,
  //       }),
  //     });

  //     if (!response.ok) {
  //       throw new Error(`Deepgram TTS failed: ${response.status} ${response.statusText}`);
  //     }

  //     // Get audio data as array buffer
  //     const audioData = await response.arrayBuffer();

  //     // Initialize audio context if needed
  //     if (!audioContextRef.current) {
  //       audioContextRef.current = new AudioContext();
  //     }

  //     const audioContext = audioContextRef.current;

  //     // Decode audio data
  //     const audioBuffer = await audioContext.decodeAudioData(audioData);

  //     // Stop any currently playing audio
  //     if (audioSourceRef.current) {
  //       try {
  //         audioSourceRef.current.stop();
  //       } catch {}
  //     }

  //     // Create and play audio source
  //     const source = audioContext.createBufferSource();
  //     source.buffer = audioBuffer;
  //     source.connect(audioContext.destination);

  //     audioSourceRef.current = source;
  //     setIsSpeaking(true);
  //     setIsLoading(false);

  //     // Handle audio end
  //     source.onended = () => {
  //       setIsSpeaking(false);
  //       audioSourceRef.current = null;
  //     };

  //     source.start(0);

  //   } catch (error) {
  //     console.error('Failed to generate speech:', error);
  //     setIsLoading(false);
  //     setIsSpeaking(false);
  //     throw error;
  //   }
  // };

  // const stop = () => {
  //   if (audioSourceRef.current) {
  //     try {
  //       audioSourceRef.current.stop();
  //     } catch {}
  //     audioSourceRef.current = null;
  //   }
  //   setIsSpeaking(false);
  // };

  // const cleanup = () => {
  //   stop();
  //   if (audioContextRef.current) {
  //     try {
  //       audioContextRef.current.close();
  //     } catch {}
  //     audioContextRef.current = null;
  //   }
  // };
  // ========== END SIMPLE TTS ==========

  // ========== QUEUE-BASED TTS (Used with Audio Queue) ==========
  // Convert text to audio buffer without playing (for queueing)
  const textToAudioBuffer = async (text: string): Promise<AudioBuffer> => {
    if (!text.trim()) {
      throw new Error('No text provided for TTS');
    }

    const deepgramKey = process.env.NEXT_PUBLIC_DEEPGRAM_API_KEY ?? '';

    // Make request to Deepgram TTS API
    const response = await fetch('https://api.deepgram.com/v1/speak?model=aura-asteria-en', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${deepgramKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: text,
      }),
    });

    if (!response.ok) {
      throw new Error(`Deepgram TTS failed: ${response.status} ${response.statusText}`);
    }

    // Get audio data as array buffer
    const audioData = await response.arrayBuffer();

    // Initialize audio context if needed
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }

    const audioContext = audioContextRef.current;

    // Decode and return audio buffer
    const audioBuffer = await audioContext.decodeAudioData(audioData);
    return audioBuffer;
  };
  // ========== END QUEUE-BASED TTS ==========

  return textToAudioBuffer;
}
