
import React from 'react';

interface ErrorMessageProps {
  message: string;
  isDark: boolean;
}

export const ErrorMessage: React.FC<ErrorMessageProps> = ({ message, isDark }) => {
  return (
    <div className="w-full p-4 bg-red-50 border border-red-100 rounded-xl text-red-700 flex items-center gap-3">
      <i className="fa-solid fa-circle-xmark text-lg"></i>
      <div>
        <p className="font-semibold">An Error Occurred</p>
        <p className="text-sm">{message}</p>
      </div>
    </div>
  );
};
