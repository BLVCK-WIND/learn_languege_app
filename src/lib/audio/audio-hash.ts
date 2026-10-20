import { normalizeText, sha256 } from '../crypto/hash';

export type AudioSource = 'dictionaryapi' | 'edge-tts';

export interface AudioHashOptions {
  source: AudioSource;
  text: string;
  voice?: string;
  rate?: string;
}

/**
 * Tính tên file âm thanh chuẩn hóa đính kèm source theo docs/AUDIO_SUBSYSTEM.md Mục 6.1:
 * fileName = sha256(source + "::" + normalize(text) + "::" + voice + "::" + rate) + ".mp3"
 * 
 * - DictionaryAPI: source = 'dictionaryapi', voice = 'en-US', rate = 'default'
 * - Edge TTS: source = 'edge-tts', voice = 'en-US-AriaNeural', rate = 'default' (hoặc giá trị tùy chỉnh)
 */
export function getAudioFileName({
  source,
  text,
  voice = source === 'edge-tts' ? 'en-US-AriaNeural' : 'en-US',
  rate = 'default',
}: AudioHashOptions): string {
  const normText = normalizeText(text);
  const hashKey = `${source}::${normText}::${voice}::${rate}`;
  return `${sha256(hashKey)}.mp3`;
}
