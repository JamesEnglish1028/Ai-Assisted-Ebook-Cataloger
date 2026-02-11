
import React from 'react';

interface ErrorMessageProps {
  message: string;
  isDark: boolean;
}

export const ErrorMessage: React.FC<ErrorMessageProps> = ({ message, isDark }) => {
  return (
    <div className={`w-full border p-4 rounded-lg text-center transition-colors ${isDark ? 'bg-red-900/30 border-red-500/50 text-red-300' : 'bg-red-50 border-red-300 text-red-700'}`}>
      <p className="font-semibold">An Error Occurred</p>
      <p className="text-sm mt-1">{message}</p>
    </div>
  );
};
