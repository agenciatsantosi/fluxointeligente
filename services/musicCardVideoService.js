import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';

const MAX_IMAGE = 12 * 1024 * 1024;
const MAX_AUDIO = 18 * 1024 * 1024;

/**
 * Converts an image and an explicitly licensed audio upload to a shareable MP4.
 * No third-party track scraping; no network access; no arbitrary ffmpeg arguments.
 * Requires ffmpeg installed on the application server.
 */
export async function renderMusicCard({ image, audio, seconds = 8, volume = 0.35 }) {
  if (!Buffer.isBuffer(image) || image.length > MAX_IMAGE || image.length === 0) throw new Error('Imagem inválida ou acima de 12 MB.');
  if (!Buffer.isBuffer(audio) || audio.length > MAX_AUDIO || audio.length === 0) throw new Error('Áudio inválido ou acima de 18 MB.');
  const duration = Number(seconds);
  const gain = Number(volume);
  if (![7, 8, 10].includes(duration)) throw new Error('Duração inválida.');
  if (!Number.isFinite(gain) || gain < 0 || gain > 1) throw new Error('Volume inválido.');
  const metadata = await sharp(image).metadata();
  if (!['jpeg', 'png', 'webp'].includes(metadata.format)) throw new Error('Use imagem JPG, PNG ou WebP.');
  const directory = await mkdtemp(join(tmpdir(), 'music-card-'));
  try {
    const photo = join(directory, 'card.png');
    const track = join(directory, 'track.mp3');
    const output = join(directory, 'card.mp4');
    const resized = await sharp(image).rotate().resize(1080, 1350, { fit: 'contain', background: '#000000' }).png().toBuffer();
    await Promise.all([writeFile(photo, resized), writeFile(track, audio)]);
    const fadeStart = Math.max(0, duration - 1);
    const args = [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-loop', '1', '-framerate', '30', '-i', photo,
      '-i', track, '-t', String(duration),
      '-vf', 'format=yuv420p', '-af', `volume=${gain},afade=t=in:st=0:d=0.5,afade=t=out:st=${fadeStart}:d=1`,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
      '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-shortest', '-movflags', '+faststart', output
    ];
    await new Promise((resolve, reject) => {
      const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
      let error = '';
      const timeout = setTimeout(() => proc.kill('SIGKILL'), 90000);
      proc.stderr.on('data', chunk => { error = (error + chunk.toString()).slice(-3000); });
      proc.on('error', reject);
      proc.on('close', code => {
        clearTimeout(timeout);
        code === 0 ? resolve() : reject(new Error('Falha ao renderizar vídeo: ' + (error || 'ffmpeg indisponível')));
      });
    });
    return await readFile(output);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
