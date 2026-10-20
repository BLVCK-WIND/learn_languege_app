/**
 * Hook khởi động chuẩn của Next.js App Router
 * Căn cứ đặc tả docs/AUDIO_SUBSYSTEM.md Mục 5.3
 * Kích hoạt cơ chế tự phục hồi hàng đợi âm thanh khi khởi động ứng dụng
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { runAudioRecovery } = await import('./services/audio-recovery.service');
    await runAudioRecovery();
  }
}
