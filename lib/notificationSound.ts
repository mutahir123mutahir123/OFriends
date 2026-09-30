import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import type { AudioPlayer } from 'expo-audio';

let sound: AudioPlayer | null = null;

function generateBeepWav(): string {
  const sampleRate = 8000;
  const duration = 0.15;
  const frequency = 880;
  const numSamples = Math.floor(sampleRate * duration);
  const dataSize = numSamples;
  const headerSize = 44;

  const buffer = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const sample = Math.sin(2 * Math.PI * frequency * t);
    view.setUint8(headerSize + i, 128 + Math.round(127 * sample));
  }

  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return 'data:audio/wav;base64,' + btoa(binary);
}

function generateMessageBeepWav(): string {
  const sampleRate = 8000;
  const note1Duration = 0.08;
  const note2Duration = 0.1;
  const gapDuration = 0.04;
  const frequency1 = 523;
  const frequency2 = 659;
  const numSamples1 = Math.floor(sampleRate * note1Duration);
  const numSamplesGap = Math.floor(sampleRate * gapDuration);
  const numSamples2 = Math.floor(sampleRate * note2Duration);
  const dataSize = numSamples1 + numSamplesGap + numSamples2;
  const headerSize = 44;

  const buffer = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 0;
  for (let i = 0; i < numSamples1; i++, offset++) {
    const t = i / sampleRate;
    view.setUint8(headerSize + offset, 128 + Math.round(127 * Math.sin(2 * Math.PI * frequency1 * t)));
  }
  for (let i = 0; i < numSamplesGap; i++, offset++) {
    view.setUint8(headerSize + offset, 128);
  }
  for (let i = 0; i < numSamples2; i++, offset++) {
    const t = i / sampleRate;
    view.setUint8(headerSize + offset, 128 + Math.round(127 * Math.sin(2 * Math.PI * frequency2 * t)));
  }

  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return 'data:audio/wav;base64,' + btoa(binary);
}

async function playWav(uri: string) {
  try {
    await setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers' });
    sound?.remove();
    sound = createAudioPlayer({ uri });
    sound.addListener('playbackStatusUpdate', (status) => {
      if (status.didJustFinish) {
        sound?.remove();
        sound = null;
      }
    });
    sound.play();
  } catch { }
}

export async function playNotificationSound() {
  await playWav(generateBeepWav());
}

export async function playMessageSound() {
  await playWav(generateMessageBeepWav());
}
