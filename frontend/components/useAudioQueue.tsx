'use client';

import { useRef, useState, useCallback, useEffect } from 'react';

interface AudioQueueItem {
  id: string;
  audioBuffer: AudioBuffer;
  text: string;
}

export function useAudioQueue(isUserSpeaking: boolean, onFirstAudioPlay?: () => void) {
  const [queue, setQueue] = useState<AudioQueueItem[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentPlayingText, setCurrentPlayingText] = useState<string>('');
  const audioContextRef = useRef<AudioContext | null>(null);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const hasPlayedFirstAudioRef = useRef<boolean>(false);

  // Initialize audio context - Pre-warm on mount for lower latency
  useEffect(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
      console.log('🎵 Audio context pre-warmed and ready');
    }

    // Resume audio context on user interaction (required by browsers)
    const resumeAudioContext = () => {
      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume().then(() => {
          console.log('🎵 Audio context resumed');
        });
      }
    };

    // Listen for user interaction to resume audio context
    window.addEventListener('click', resumeAudioContext, { once: true });
    window.addEventListener('keydown', resumeAudioContext, { once: true });

    return () => {
      window.removeEventListener('click', resumeAudioContext);
      window.removeEventListener('keydown', resumeAudioContext);
    };
  }, []);

  // Add audio to queue
  const enqueue = useCallback((audioBuffer: AudioBuffer, text: string) => {
    const id = `audio_${Date.now()}_${Math.random()}`;
    setQueue((prev) => [...prev, { id, audioBuffer, text }]);
  }, []);

  const resetFirstAudioFlag = useCallback(() => {
    hasPlayedFirstAudioRef.current = false;
  }, []);

  // Play next audio from queue
  const playNext = useCallback(async () => {
    if (isUserSpeaking) {
      // Don't play if user is speaking
      return;
    }

    if (queue.length === 0 || isPlaying) {
      return;
    }

    const [nextItem, ...rest] = queue;
    setQueue(rest);
    setIsPlaying(true);
    setCurrentPlayingText(nextItem.text);

    try {
      const audioContext = audioContextRef.current;
      if (!audioContext) return;

      // Stop any currently playing audio
      if (currentSourceRef.current) {
        try {
          currentSourceRef.current.stop();
        } catch {}
      }

      // Create and play audio source
      const source = audioContext.createBufferSource();
      source.buffer = nextItem.audioBuffer;
      source.connect(audioContext.destination);
      currentSourceRef.current = source;

      // Handle audio end
      source.onended = () => {
        setIsPlaying(false);
        setCurrentPlayingText('');
        currentSourceRef.current = null;
      };

      source.start(0);

      // Notify first audio play
      if (!hasPlayedFirstAudioRef.current && onFirstAudioPlay) {
        hasPlayedFirstAudioRef.current = true;
        onFirstAudioPlay();
      }
    } catch (error) {
      console.error('Error playing audio from queue:', error);
      setIsPlaying(false);
      setCurrentPlayingText('');
    }
  }, [queue, isPlaying, isUserSpeaking, onFirstAudioPlay]);

  // Auto-play when queue has items and user is not speaking
  useEffect(() => {
    if (queue.length > 0 && !isPlaying && !isUserSpeaking) {
      playNext();
    }
  }, [queue, isPlaying, isUserSpeaking, playNext]);

  // Pause playback if user starts speaking
  useEffect(() => {
    if (isUserSpeaking && isPlaying) {
      if (currentSourceRef.current) {
        try {
          currentSourceRef.current.stop();
        } catch {}
        currentSourceRef.current = null;
      }
      setIsPlaying(false);
      setCurrentPlayingText('');
    }
  }, [isUserSpeaking, isPlaying]);

  // Clear queue
  const clearQueue = useCallback(() => {
    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.stop();
      } catch {}
      currentSourceRef.current = null;
    }
    setQueue([]);
    setIsPlaying(false);
    setCurrentPlayingText('');
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (currentSourceRef.current) {
        try {
          currentSourceRef.current.stop();
        } catch {}
      }
      if (audioContextRef.current) {
        try {
          audioContextRef.current.close();
        } catch {}
      }
    };
  }, []);

  return {
    enqueue,
    clearQueue,
    resetFirstAudioFlag,
    queueLength: queue.length,
    isPlaying,
    currentPlayingText,
  };
}
