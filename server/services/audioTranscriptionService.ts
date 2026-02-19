import { GoogleGenAI } from '@google/genai';
import { AISelection } from './aiProviderService';

export type AudioTranscriptionMode = 'metadata-only' | 'transcribe-preview' | 'transcribe-full';

export interface AudioTranscriptionOptions {
  mode: AudioTranscriptionMode;
  maxMinutes: number;
  includeTimestamps: boolean;
}

export interface AudioTranscriptionResult {
  transcript: string;
  truncated: boolean;
  minutesUsed: number;
  estimatedCostUsd: number;
  providerUsed: AISelection['provider'];
  modelUsed: string;
}

const MAX_PREVIEW_MINUTES = 20;
const MAX_FULL_MINUTES = 240;
const DEFAULT_PREVIEW_MINUTES = 10;
const DEFAULT_FULL_MINUTES = 120;

const bytesPerMinuteByMime = (mimeType: string): number => {
  if (mimeType === 'audio/wav' || mimeType === 'audio/x-wav') return 10 * 1024 * 1024;
  if (mimeType === 'audio/mp4' || mimeType === 'audio/x-m4a') return 8 * 1024 * 1024;
  return 1 * 1024 * 1024;
};

const estimateCostUsd = (provider: AISelection['provider'], minutes: number): number => {
  if (provider === 'openai') return Number((minutes * 0.006).toFixed(4));
  if (provider === 'google') return Number((minutes * 0.004).toFixed(4));
  return 0;
};

const getGeminiApiKey = (): string => {
  const key = process.env.GEMINI_API_KEY || process.env.API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY environment variable not set.');
  return key;
};

const getOpenAIApiKey = (): string => {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY environment variable not set.');
  return key;
};

const resolveTranscriptionModel = (selection: AISelection): string => {
  if (selection.provider === 'openai') {
    return /transcribe/i.test(selection.model) ? selection.model : 'gpt-4o-mini-transcribe';
  }
  return selection.model;
};

const normalizeMinutes = (mode: AudioTranscriptionMode, requested: number): number => {
  if (mode === 'metadata-only') return 0;
  if (mode === 'transcribe-preview') {
    const base = Number.isFinite(requested) ? requested : DEFAULT_PREVIEW_MINUTES;
    return Math.max(1, Math.min(MAX_PREVIEW_MINUTES, Math.round(base)));
  }
  const base = Number.isFinite(requested) ? requested : DEFAULT_FULL_MINUTES;
  return Math.max(1, Math.min(MAX_FULL_MINUTES, Math.round(base)));
};

const sliceAudioBufferByMinutes = (
  buffer: Buffer,
  mimeType: string,
  minutes: number,
): { sliced: Buffer; truncated: boolean } => {
  const bytesPerMinute = bytesPerMinuteByMime(mimeType);
  const maxBytes = Math.max(1, Math.floor(bytesPerMinute * minutes));
  if (buffer.length <= maxBytes) return { sliced: buffer, truncated: false };
  return { sliced: buffer.subarray(0, maxBytes), truncated: true };
};

const transcribeWithOpenAI = async (
  audioBytes: Buffer,
  mimeType: string,
  fileName: string,
  selection: AISelection,
  includeTimestamps: boolean,
): Promise<string> => {
  const apiKey = getOpenAIApiKey();
  const model = resolveTranscriptionModel(selection) || 'gpt-4o-mini-transcribe';
  const form = new FormData();
  const ext = fileName.split('.').pop() || 'mp3';
  const blob = new Blob([audioBytes], { type: mimeType || 'application/octet-stream' });
  form.append('file', blob, `audio.${ext}`);
  form.append('model', model);
  form.append('response_format', 'json');
  if (includeTimestamps) {
    form.append('timestamp_granularities[]', 'segment');
  }

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`OpenAI transcription failed (${response.status}): ${detail}`);
  }
  const payload = await response.json() as any;
  const text = typeof payload?.text === 'string' ? payload.text.trim() : '';
  if (!text) throw new Error('OpenAI transcription returned empty text.');
  return text;
};

const transcribeWithGoogle = async (
  audioBytes: Buffer,
  mimeType: string,
  selection: AISelection,
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: getGeminiApiKey() });
  const response = await ai.models.generateContent({
    model: selection.model || 'gemini-2.5-flash',
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: 'Transcribe this audiobook audio. Return plain text transcript only.',
          },
          {
            inlineData: {
              mimeType: mimeType || 'audio/mpeg',
              data: audioBytes.toString('base64'),
            },
          },
        ],
      },
    ],
  });
  const text = String(response?.text || '').trim();
  if (!text) throw new Error('Google transcription returned empty text.');
  return text;
};

export const getAudioModeSupport = (provider: AISelection['provider']) => ({
  supportsTranscription: provider === 'openai' || provider === 'google',
  reason: provider === 'anthropic'
    ? 'Anthropic text models in this app do not accept direct audio transcription. Use metadata-only or switch provider.'
    : undefined,
});

export async function transcribeAudioWithProvider(
  sourceBuffer: Buffer,
  mimeType: string,
  fileName: string,
  selection: AISelection,
  options: AudioTranscriptionOptions,
): Promise<AudioTranscriptionResult> {
  const mode = options.mode;
  const modelUsed = resolveTranscriptionModel(selection);
  const minutesUsed = normalizeMinutes(mode, options.maxMinutes);
  if (mode === 'metadata-only' || minutesUsed <= 0) {
    return {
      transcript: '',
      truncated: false,
      minutesUsed: 0,
      estimatedCostUsd: 0,
      providerUsed: selection.provider,
      modelUsed,
    };
  }

  const support = getAudioModeSupport(selection.provider);
  if (!support.supportsTranscription) {
    throw new Error(support.reason || 'Selected provider does not support audio transcription in this workflow.');
  }

  const { sliced, truncated } = sliceAudioBufferByMinutes(sourceBuffer, mimeType, minutesUsed);
  const transcript = selection.provider === 'openai'
    ? await transcribeWithOpenAI(sliced, mimeType, fileName, selection, options.includeTimestamps)
    : await transcribeWithGoogle(sliced, mimeType, selection);

  return {
    transcript,
    truncated,
    minutesUsed,
    estimatedCostUsd: estimateCostUsd(selection.provider, minutesUsed),
    providerUsed: selection.provider,
    modelUsed,
  };
}
