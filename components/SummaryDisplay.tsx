import React, { useState } from 'react';

interface SummaryDisplayProps {
  summary: string;
  coverImageUrl: string | null;
  isDark: boolean;
}

export const SummaryDisplay: React.FC<SummaryDisplayProps> = ({ summary, coverImageUrl, isDark }) => {
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = async () => {
    if (!summary || isCopied) return;
    try {
      await navigator.clipboard.writeText(summary);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2500); // Reset after 2.5 seconds
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  return (
    <div className="w-full animate-fade-in">
      <h2 className={`text-2xl font-bold mb-6 text-center text-transparent bg-clip-text bg-gradient-to-r ${isDark ? 'from-blue-400 to-cyan-400' : 'from-blue-600 to-cyan-600'}`}>Generated Analysis</h2>
      
      <div className="flex flex-col items-center gap-8">
        {coverImageUrl && (
          <div className="w-full max-w-[250px] flex-shrink-0">
            <img 
              src={coverImageUrl} 
              alt="Ebook cover" 
              className="rounded-lg shadow-2xl object-contain w-full" 
            />
          </div>
        )}

        <div className="w-full text-left">
          <h3 className={`text-xl font-bold mb-3 ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Summary</h3>
          <div className={`prose max-w-none space-y-4 ${isDark ? 'text-slate-300 prose-invert' : 'text-slate-700'}`}>
            {summary.split('\n').map((paragraph, index) => (
              paragraph.trim() && <p key={index}>{paragraph}</p>
            ))}
          </div>

          <div className="mt-6 text-right">
            <button
              onClick={handleCopy}
              disabled={!summary || isCopied}
              className={`inline-flex items-center gap-2 bg-cyan-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-cyan-500 disabled:cursor-not-allowed transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-500 shadow-md ${isDark ? 'disabled:bg-slate-600 focus:ring-offset-slate-900' : 'disabled:bg-slate-400 focus:ring-offset-slate-50'}`}
              aria-live="polite"
            >
              {isCopied ? (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  Copied!
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Copy Summary
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
