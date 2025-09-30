
import React from 'react';

interface ErrorMessageProps {
  message: string;
}

export const ErrorMessage: React.FC<ErrorMessageProps> = ({ message }) => {
  return (
    <div className="w-full bg-red-900/30 border border-red-500/50 text-red-300 p-4 rounded-lg text-center">
      <p className="font-semibold">An Error Occurred</p>
      <p className="text-sm mt-1">{message}</p>
    </div>
  );
};
