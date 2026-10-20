'use client';

import { useState, useCallback, useRef } from 'react';
import styles from './AudioButton.module.css';
import { playWebSpeech, stopWebSpeech } from '@/lib/audio/web-speech';

export interface AudioButtonProps {
  text: string;
  audioUrl?: string | null;
  audioStatus?: string | null;
  itemType?: 'WORD' | 'SENTENCE';
  itemId?: string;
  size?: 'sm' | 'md';
  title?: string;
  className?: string;
}

/**
 * Nút nghe phát âm thông minh tích hợp 3 tầng (docs/AUDIO_SUBSYSTEM.md Mục 2 & 5.1):
 * - Nếu đã có audioUrl (Tầng 1/2: file mp3 chất lượng cao): phát trực tiếp stream từ backend
 * - Nếu chưa có hoặc file lỗi: phát tức thì qua Web Speech API (Tầng 3)
 * - Tự động đẩy yêu cầu priority bump lên hàng đợi backend khi người học bấm nghe on-demand
 */
export function AudioButton({
  text,
  audioUrl,
  itemType,
  itemId,
  size = 'md',
  title = 'Nghe phát âm',
  className = '',
}: AudioButtonProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  const handleClick = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();

      // Dừng audio đang phát nếu bấm lại
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current.currentTime = 0;
        currentAudioRef.current = null;
        setIsPlaying(false);
        return;
      }

      if (isPlaying) {
        stopWebSpeech();
        setIsPlaying(false);
        return;
      }

      // Tuyến 1: Nếu đã có audioUrl mp3 cục bộ -> phát trực tiếp
      if (audioUrl && audioUrl.trim().length > 0) {
        try {
          setIsPlaying(true);
          const audio = new Audio(audioUrl);
          currentAudioRef.current = audio;

          audio.onended = () => {
            setIsPlaying(false);
            currentAudioRef.current = null;
          };

          audio.onerror = async () => {
            // Tự động chuyển tầng sang Web Speech API nếu mp3 lỗi mạng hoặc offline
            currentAudioRef.current = null;
            await playWebSpeech(text, {
              rate: 1.0,
              onStart: () => setIsPlaying(true),
              onEnd: () => setIsPlaying(false),
              onError: () => setIsPlaying(false),
            });
          };

          await audio.play();
          return;
        } catch {
          // Trình duyệt chặn autoplay hoặc lỗi -> chuyển tầng sang Web Speech
          currentAudioRef.current = null;
        }
      }

      // Tuyến 2: Chưa có mp3 -> Phát tức thì qua Web Speech API (< 50ms)
      await playWebSpeech(text, {
        rate: 1.0,
        onStart: () => setIsPlaying(true),
        onEnd: () => setIsPlaying(false),
        onError: () => setIsPlaying(false),
      });

      // Đồng thời kích hoạt Tuyến 2 (On-demand Priority Bump) đẩy mục này lên đầu hàng đợi backend
      if (itemId && itemType) {
        fetch('/api/audio/queue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'priority',
            itemType,
            itemId,
          }),
        }).catch(() => {});
      }
    },
    [text, audioUrl, itemType, itemId, isPlaying]
  );

  const sizeClass = size === 'sm' ? styles.sizeSm : styles.sizeMd;

  return (
    <button
      type="button"
      className={`${styles.audioBtn} ${sizeClass} ${isPlaying ? styles.isSpeaking : ''} ${className}`}
      onClick={handleClick}
      title={title}
      aria-label={title}
    >
      {isPlaying ? '🔊' : '🔉'}
    </button>
  );
}
