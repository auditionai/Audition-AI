// /utils/soundManager.ts

// Helper functions for audio decoding, specifically for Gemini's raw PCM output
function decodeBase64(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodePcmAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}


class SoundManager {
    private isMuted: boolean = false;
    private audioContext: AudioContext | null = null;
    private sfx: { [key: string]: HTMLAudioElement } = {};
    private readonly TTS_SAMPLE_RATE = 24000;

    constructor() {
        if (typeof window !== 'undefined') {
            const savedMuteState = localStorage.getItem('soundMuted');
            this.isMuted = savedMuteState === 'true';
            
            // Preload common sound effects
            this.preloadSound('click', '/sounds/click.mp3');
            this.preloadSound('success', '/sounds/success.mp3');
            this.preloadSound('error', '/sounds/error.mp3');
            this.preloadSound('notification', '/sounds/notification.mp3');
            this.preloadSound('swoosh', '/sounds/swoosh.mp3');
        }
    }

    private preloadSound(key: string, src: string) {
        if (typeof window !== 'undefined') {
            this.sfx[key] = new Audio(src);
            this.sfx[key].volume = 0.5;
        }
    }

    private getAudioContext(): AudioContext {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
                sampleRate: this.TTS_SAMPLE_RATE,
            });
        }
        return this.audioContext;
    }

    playSound(type: 'click' | 'success' | 'error' | 'notification' | 'swoosh') {
        if (this.isMuted) return;
        if (this.sfx[type]) {
            this.sfx[type].currentTime = 0;
            this.sfx[type].play().catch(e => console.error(`Error playing sound ${type}:`, e));
        }
    }

    async speak(text: string) {
        if (this.isMuted || !text) return;

        try {
            const response = await fetch('/.netlify/functions/text-to-speech', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to generate speech.');
            }

            const { audioContent } = await response.json();
            const audioBytes = decodeBase64(audioContent);
            
            const ctx = this.getAudioContext();
            const audioBuffer = await decodePcmAudioData(audioBytes, ctx, this.TTS_SAMPLE_RATE, 1);

            const source = ctx.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(ctx.destination);
            source.start();

        } catch (error) {
            console.error('Text-to-speech failed:', error);
        }
    }

    toggleMute() {
        this.isMuted = !this.isMuted;
        localStorage.setItem('soundMuted', String(this.isMuted));
        return this.isMuted;
    }

    getIsMuted() {
        return this.isMuted;
    }
}

// Export a singleton instance
export const soundManager = new SoundManager();