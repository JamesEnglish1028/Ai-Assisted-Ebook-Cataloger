export type PdfMdMode = 'quick' | 'ocr';

export interface PdfMdProgress {
  phase: 'loading' | 'extracting' | 'ocr' | 'complete';
  percent: number;
  message: string;
}

export interface PdfMdResult {
  markdown: string;
  totalPages?: number;
  pagesProcessed?: number;
}

export class PdfConversionCancelledError extends Error {
  constructor() {
    super('PDF conversion was cancelled by user.');
    this.name = 'PdfConversionCancelledError';
  }
}

type Extract2MdProgressInput =
  | number
  | { progress?: number; percent?: number; stage?: string; currentPage?: number; totalPages?: number };

const clampPercent = (value: number) => Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));

const toPercent = (progress: Extract2MdProgressInput): number => {
  if (typeof progress === 'number') {
    return progress <= 1 ? clampPercent(progress * 100) : clampPercent(progress);
  }
  const raw = typeof progress.percent === 'number'
    ? progress.percent
    : typeof progress.progress === 'number'
      ? progress.progress
      : 0;
  return raw <= 1 ? clampPercent(raw * 100) : clampPercent(raw);
};

const toMarkdown = (result: any): string => {
  if (typeof result?.markdown === 'string') {
    return result.markdown.trim();
  }
  if (Array.isArray(result?.pages)) {
    return result.pages
      .map((page: any) => (typeof page?.markdown === 'string' ? page.markdown : ''))
      .filter(Boolean)
      .join('\n\n')
      .trim();
  }
  return '';
};

const extractStats = (result: any): Pick<PdfMdResult, 'totalPages' | 'pagesProcessed'> => ({
  totalPages: typeof result?.metadata?.totalPages === 'number' ? result.metadata.totalPages : undefined,
  pagesProcessed: typeof result?.processingStats?.pagesProcessed === 'number'
    ? result.processingStats.pagesProcessed
    : undefined,
});

export async function convertPdfToMarkdown(
  file: File,
  mode: PdfMdMode,
  onProgress?: (progress: PdfMdProgress) => void,
  signal?: AbortSignal,
): Promise<PdfMdResult> {
  if (signal?.aborted) {
    throw new PdfConversionCancelledError();
  }

  const moduleCandidates = [
    'https://esm.sh/extract2md@0.0.6',
    'https://cdn.jsdelivr.net/npm/extract2md@0.0.6/+esm',
    'https://unpkg.com/extract2md@0.0.6/dist/index.mjs',
  ];
  onProgress?.({
    phase: 'loading',
    percent: 5,
    message: 'Loading extract2md converter...',
  });

  let extract2mdModule: any = null;
  const loadErrors: string[] = [];
  for (const candidate of moduleCandidates) {
    try {
      extract2mdModule = await import(/* @vite-ignore */ candidate);
      if (extract2mdModule) break;
    } catch (error: any) {
      loadErrors.push(`${candidate}: ${error?.message || String(error)}`);
    }
  }

  const Extract2MDClass = extract2mdModule?.Extract2MD || extract2mdModule?.default?.Extract2MD;
  if (!Extract2MDClass) {
    throw new Error(`extract2md library is unavailable at runtime. ${loadErrors.join(' | ')}`);
  }

  const converter = new Extract2MDClass();
  const progressPhase: PdfMdProgress['phase'] = mode === 'ocr' ? 'ocr' : 'extracting';

  const sharedProgress = (progress: Extract2MdProgressInput) => {
    if (signal?.aborted) {
      throw new PdfConversionCancelledError();
    }
    const percent = toPercent(progress);
    onProgress?.({
      phase: progressPhase,
      percent,
      message: mode === 'ocr'
        ? `OCR extraction in progress (${Math.round(percent)}%)`
        : `PDF to Markdown conversion in progress (${Math.round(percent)}%)`,
    });
  };

  const conversionResult = mode === 'ocr'
    ? await converter.highAccuracyConvert(file, {
      language: 'eng',
      maxPages: 300,
      onProgress: sharedProgress,
    })
    : await converter.quickConvert(file, {
      includeImages: false,
      onProgress: sharedProgress,
    });

  if (signal?.aborted) {
    throw new PdfConversionCancelledError();
  }

  const markdown = toMarkdown(conversionResult);
  if (!markdown) {
    throw new Error('extract2md returned empty markdown output.');
  }

  onProgress?.({
    phase: 'complete',
    percent: 100,
    message: 'Markdown conversion complete.',
  });

  return {
    markdown,
    ...extractStats(conversionResult),
  };
}
