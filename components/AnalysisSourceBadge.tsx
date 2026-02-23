import React from 'react';

type AIProvider = 'google' | 'openai' | 'anthropic' | string;

interface AnalysisSourceBadgeProps {
  source: 'ai' | 'system';
  aiProvider?: AIProvider;
  aiModel?: string;
  isDark: boolean;
}

const getProviderMeta = (provider?: AIProvider): { label: string; short: string; bg: string; text: string } => {
  const key = (provider || '').toLowerCase();
  if (key === 'openai') {
    return { label: 'OpenAI', short: 'O', bg: 'bg-emerald-100', text: 'text-emerald-800' };
  }
  if (key === 'anthropic' || key === 'claude') {
    return { label: 'Anthropic', short: 'A', bg: 'bg-amber-100', text: 'text-amber-800' };
  }
  return { label: 'Google', short: 'G', bg: 'bg-blue-100', text: 'text-blue-800' };
};

export const AnalysisSourceBadge: React.FC<AnalysisSourceBadgeProps> = ({ source, aiProvider, aiModel, isDark }) => {
  if (source === 'system') {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
          isDark ? 'border-slate-600 bg-slate-800 text-slate-200' : 'border-slate-300 bg-slate-100 text-slate-700'
        }`}
        title="Extracted from the file and/or calculated in code"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317a1 1 0 011.35-.936 1 1 0 001.05 0 1 1 0 011.35.936l.177 1.058a1 1 0 00.95.82h1.11a1 1 0 01.936 1.35 1 1 0 000 1.05 1 1 0 01-.936 1.35h-1.11a1 1 0 00-.95.82l-.177 1.058a1 1 0 01-1.35.936 1 1 0 00-1.05 0 1 1 0 01-1.35-.936l-.177-1.058a1 1 0 00-.95-.82h-1.11a1 1 0 01-.936-1.35 1 1 0 000-1.05 1 1 0 01.936-1.35h1.11a1 1 0 00.95-.82l.177-1.058z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
        File/Code
      </span>
    );
  }

  const providerMeta = getProviderMeta(aiProvider);
  const title = aiModel ? `AI-generated (${providerMeta.label} - ${aiModel})` : `AI-generated (${providerMeta.label})`;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
        isDark ? 'border-slate-600 bg-slate-800 text-slate-100' : 'border-slate-300 bg-slate-100 text-slate-700'
      }`}
      title={title}
    >
      <span className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold ${providerMeta.bg} ${providerMeta.text}`}>
        {providerMeta.short}
      </span>
      {providerMeta.label}
    </span>
  );
};
