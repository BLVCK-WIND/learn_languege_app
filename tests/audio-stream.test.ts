import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { GET, VALID_AUDIO_FILENAME_REGEX } from '../src/app/api/audio/[filename]/route';

describe('Audio Stream Route Handler Tests (Task 4.4)', () => {
  const audioDir = path.join(process.cwd(), 'data', 'audio');
  const validHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
  const validFilename = `${validHash}.mp3`;
  const validFilePath = path.join(audioDir, validFilename);
  const sampleAudioContent = 'FAKE_BINARY_AUDIO_PAYLOAD_FOR_TESTING_1234567890_SAMPLE';

  beforeEach(async () => {
    await fs.promises.mkdir(audioDir, { recursive: true });
    await fs.promises.writeFile(validFilePath, Buffer.from(sampleAudioContent));
  });

  afterEach(async () => {
    if (fs.existsSync(validFilePath)) {
      await fs.promises.unlink(validFilePath).catch(() => {});
    }
  });

  describe('Path Traversal & Regex Validation', () => {
    it('validates strictly 64-hex SHA-256 + .mp3 extension', () => {
      expect(VALID_AUDIO_FILENAME_REGEX.test(validFilename)).toBe(true);
      expect(VALID_AUDIO_FILENAME_REGEX.test('invalid.mp3')).toBe(false);
      expect(VALID_AUDIO_FILENAME_REGEX.test('12345.mp3')).toBe(false);
      expect(VALID_AUDIO_FILENAME_REGEX.test(`${validHash}.wav`)).toBe(false);
      expect(VALID_AUDIO_FILENAME_REGEX.test(`${validHash}`)).toBe(false);
      expect(VALID_AUDIO_FILENAME_REGEX.test(`../${validFilename}`)).toBe(false);
      expect(VALID_AUDIO_FILENAME_REGEX.test(`..\\${validFilename}`)).toBe(false);
    });

    it('rejects Path Traversal attempts with 400 Bad Request', async () => {
      const maliciousFilenames = [
        '../../../etc/passwd',
        '..\\..\\app.db',
        '../audio/something.mp3',
        'normal-name.mp3',
        'a'.repeat(63) + '.mp3', // 63 chars instead of 64
        'a'.repeat(65) + '.mp3', // 65 chars instead of 64
      ];

      for (const badName of maliciousFilenames) {
        const req = new NextRequest(`http://localhost/api/audio/${encodeURIComponent(badName)}`);
        const res = await GET(req, { params: Promise.resolve({ filename: badName }) });

        expect(res.status).toBe(400);
        const text = await res.text();
        expect(text).toBe('Tên file âm thanh không hợp lệ');
      }
    });

    it('returns 404 when filename format is valid but file does not exist on disk', async () => {
      const nonExistentHash = '0000000000000000000000000000000000000000000000000000000000000000';
      const nonExistentFilename = `${nonExistentHash}.mp3`;

      const req = new NextRequest(`http://localhost/api/audio/${nonExistentFilename}`);
      const res = await GET(req, { params: Promise.resolve({ filename: nonExistentFilename }) });

      expect(res.status).toBe(404);
      const text = await res.text();
      expect(text).toBe('File âm thanh không tồn tại');
    });
  });

  describe('Full File Audio Streaming (HTTP 200 OK)', () => {
    it('returns 200 OK with proper headers and full file content when no Range header is sent', async () => {
      const req = new NextRequest(`http://localhost/api/audio/${validFilename}`);
      const res = await GET(req, { params: Promise.resolve({ filename: validFilename }) });

      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('audio/mpeg');
      expect(res.headers.get('Accept-Ranges')).toBe('bytes');
      expect(res.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
      expect(res.headers.get('Content-Length')).toBe(String(sampleAudioContent.length));

      const bodyText = await res.text();
      expect(bodyText).toBe(sampleAudioContent);
    });
  });

  describe('HTTP Range Requests (HTTP 206 Partial Content)', () => {
    it('returns 206 Partial Content for Range: bytes=0-9', async () => {
      const req = new NextRequest(`http://localhost/api/audio/${validFilename}`, {
        headers: { Range: 'bytes=0-9' },
      });
      const res = await GET(req, { params: Promise.resolve({ filename: validFilename }) });

      expect(res.status).toBe(206);
      expect(res.headers.get('Content-Type')).toBe('audio/mpeg');
      expect(res.headers.get('Content-Range')).toBe(`bytes 0-9/${sampleAudioContent.length}`);
      expect(res.headers.get('Content-Length')).toBe('10');
      expect(res.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');

      const bodyText = await res.text();
      expect(bodyText).toBe(sampleAudioContent.slice(0, 10));
    });

    it('returns 206 Partial Content for open-ended Range: bytes=10-', async () => {
      const req = new NextRequest(`http://localhost/api/audio/${validFilename}`, {
        headers: { Range: 'bytes=10-' },
      });
      const res = await GET(req, { params: Promise.resolve({ filename: validFilename }) });

      expect(res.status).toBe(206);
      expect(res.headers.get('Content-Range')).toBe(
        `bytes 10-${sampleAudioContent.length - 1}/${sampleAudioContent.length}`
      );
      expect(res.headers.get('Content-Length')).toBe(String(sampleAudioContent.length - 10));

      const bodyText = await res.text();
      expect(bodyText).toBe(sampleAudioContent.slice(10));
    });

    it('returns 416 Range Not Satisfiable when range is beyond file size', async () => {
      const req = new NextRequest(`http://localhost/api/audio/${validFilename}`, {
        headers: { Range: 'bytes=99999-100000' },
      });
      const res = await GET(req, { params: Promise.resolve({ filename: validFilename }) });

      expect(res.status).toBe(416);
      expect(res.headers.get('Content-Range')).toBe(`bytes */${sampleAudioContent.length}`);
    });
  });
});
