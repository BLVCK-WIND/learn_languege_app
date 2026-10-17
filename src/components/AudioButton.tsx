'use client';

import { useState, useCallback } from 'react';
import styles from './AudioButton.module.css';
import { playWebSpeech, stopWebSpeech } from '@/lib/audio/web-speech';

interface AudioButtonProps {
  text: string;
  size?: 'sm' | 'md';
  title?: string;
  className?: string;
}

export function AudioButton({
  text,
  size = 'md',
  title = 'Nghe phát âm',
  className = '',
}: AudioButtonProps) {
  const [isSpeaking, setIsSpeaking] = useState(false);

  const handleClick = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();

      if (isSpeaking) {
        stopWebSpeech();
        setIsSpeaking(false);
        return;
      }

      await playWebSpeech(text, {
        rate: 1.0,
        onStart: () => setIsSpeaking(true),
        onEnd: () => setIsSpeaking(false),
        onError: () => setIsSpeaking(false),
      });
    },
    [text, isSpeaking]
  );

  const sizeClass = size === 'sm' ? styles.sizeSm : styles.sizeMd;

  return (
    <button
      type="button"
      className={`${styles.audioBtn} ${sizeClass} ${isSpeaking ? styles.isSpeaking : ''} ${className}`}
      onClick={handleClick}
      title={title}
      aria-label={title}
    >
      {isSpeaking ? '🔊' : '🔉'}
    </button>
  );
}
