import React, { useCallback, useState, useEffect } from 'react';

type FileType = 'pdf' | 'epub' | 'audiobook';

interface FileUploadProps {
  file: File | null;
  fileType: FileType;
  onFileChange: (file: File | null) => void;
  onFileTypeChange: (type: FileType) => void;
  disabled: boolean;
  isDark: boolean;
}

const PdfIcon: React.FC = () => (
  <svg className="w-12 h-12 text-cyan-400" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path fillRule="evenodd" clipRule="evenodd" d="M4 2C2.89543 2 2 2.89543 2 4V20C2 21.1046 2.89543 22 4 22H20C21.1046 22 22 21.1046 22 20V8.82843C22 8.29799 21.7893 7.78929 21.4142 7.41421L16.5858 2.58579C16.2107 2.21071 15.702 2 15.1716 2H4ZM8.5 10C7.67157 10 7 10.6716 7 11.5V13C7 13.8284 7.67157 14.5 8.5 14.5H9.5V16H11V10H8.5ZM8.5 11.5H9.5V13H8.5V11.5ZM17 11.5C17 10.6716 16.3284 10 15.5 10H13V16H14.5V13.5H15.5C16.3284 13.5 17 12.8284 17 12V11.5ZM14.5 12H15.5V12.5H14.5V12Z" />
  </svg>
);

const EpubIcon: React.FC = () => (
  <svg className="w-12 h-12 text-cyan-400" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path fillRule="evenodd" clipRule="evenodd" d="M18 2H6C4.89543 2 4 2.89543 4 4V20C4 21.1046 4.89543 22 6 22H18C19.1046 22 20 21.1046 20 20V4C20 2.89543 19.1046 2 18 2ZM11 4H6V12.5L8.5 11L11 12.5V4ZM13 18V16H18V18H13ZM13 14V12H18V14H13ZM13 10V8H18V10H13Z" />
  </svg>
);

const AudioIcon: React.FC = () => (
  <svg className="w-12 h-12 text-cyan-400" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M14 4.5a1 1 0 0 1 1.447-.894l4 2A1 1 0 0 1 20 6.5V15a4 4 0 1 1-2-3.465V7.118l-2-1V13a4 4 0 1 1-2-3.465V4.5Z" />
    <path d="M7 4a1 1 0 0 1 1 1v8.535A4 4 0 1 1 6 13V5a1 1 0 0 1 1-1Z" />
  </svg>
);


export const FileUpload: React.FC<FileUploadProps> = ({ file, fileType, onFileChange, onFileTypeChange, disabled, isDark }) => {
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [showSuccess, setShowSuccess] = useState<boolean>(false);

  useEffect(() => {
    // If the file is cleared from the parent, don't show the success icon
    if (!file) {
      setShowSuccess(false);
    }
  }, [file]);

  const handleFileSelect = useCallback((selectedFile: File | null) => {
    if (selectedFile) {
        // Validate file before accepting
        console.log('📁 Selected file:', {
            name: selectedFile.name,
            size: selectedFile.size,
            type: selectedFile.type,
            lastModified: selectedFile.lastModified
        });
        
        // Check if file size is 0 (might be a directory or invalid file)
        if (selectedFile.size === 0) {
            console.error('❌ File has 0 bytes - might be a directory or empty file');
            alert('Invalid file: The selected file appears to be empty or is not a valid file.');
            return;
        }
        
        setShowSuccess(true);
        // Show the success icon for 1.5s, then transition to showing the file name
        setTimeout(() => setShowSuccess(false), 1500);
    }
    onFileChange(selectedFile);
  }, [onFileChange]);

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files ? e.target.files[0] : null;
    
    // Firefox workaround: Validate the file is actually a file, not a directory
    if (selectedFile) {
      // If size is 0 and no type, it might be a directory
      if (selectedFile.size === 0 && !selectedFile.type) {
        console.warn('⚠️ Possible directory selected, rejecting');
        alert('Please select a valid PDF, EPUB, or audiobook file, not a folder.');
        e.target.value = '';
        return;
      }
    }
    
    handleFileSelect(selectedFile);
    e.target.value = ''; // Allow re-uploading the same file
  };
  
  const handleDragEvents = (e: React.DragEvent<HTMLLabelElement>, entering: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
        setIsDragging(entering);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    handleDragEvents(e, false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const acceptedMimeTypes = fileType === 'pdf'
    ? 'application/pdf'
    : fileType === 'epub'
      ? 'application/epub+zip'
      : 'audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,audio/x-wav,application/audiobook+zip';
  const acceptedExtension = fileType === 'pdf'
    ? '.pdf'
    : fileType === 'epub'
      ? '.epub'
      : '.mp3,.m4b,.wav,.audiobook';

  const renderContent = () => {
    if (showSuccess) {
      return (
        <div className="flex flex-col items-center justify-center animate-fade-in text-center">
          {fileType === 'pdf' ? <PdfIcon /> : fileType === 'epub' ? <EpubIcon /> : <AudioIcon />}
          <p className={`mt-2 text-sm font-semibold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>File accepted!</p>
        </div>
      );
    }

    if (file) {
      return (
        <p className="font-semibold text-cyan-400 break-all px-2 animate-fade-in">{file.name}</p>
      );
    }

    return (
      <>
        <svg className="w-10 h-10 mb-3 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-4-4V6a4 4 0 014-4h1.586a1 1 0 01.707.293l1.414 1.414a1 1 0 00.707.293H13.5a4 4 0 014 4v1.586a1 1 0 01-.293.707l-1.414 1.414a1 1 0 00-.293.707V16m-7-5l3-3m0 0l3 3m-3-3v12"></path></svg>
        <p className={`mb-2 text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}><span className="font-semibold">Click to upload</span> or drag and drop</p>
        <p className="text-xs text-slate-500">{fileType === 'audiobook' ? 'AUDIO only' : `${fileType.toUpperCase()} only`}</p>
      </>
    );
  };

  return (
    <div className="w-full">
      <div className="flex justify-center mb-4">
        <div className="p-1 rounded-xl flex gap-1 border border-slate-200 bg-slate-50">
          <button 
            onClick={() => onFileTypeChange('pdf')} 
            disabled={disabled}
            className={`px-4 py-1 rounded-lg text-sm font-semibold transition-colors duration-200 ${fileType === 'pdf' ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-slate-200'}` }
            aria-pressed={fileType === 'pdf' ? 'true' : 'false'}
          >
            PDF
          </button>
          <button 
            onClick={() => onFileTypeChange('epub')} 
            disabled={disabled}
            className={`px-4 py-1 rounded-lg text-sm font-semibold transition-colors duration-200 ${fileType === 'epub' ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-slate-200'}` }
            aria-pressed={fileType === 'epub' ? 'true' : 'false'}
          >
            EPUB
          </button>
          <button
            onClick={() => onFileTypeChange('audiobook')}
            disabled={disabled}
            className={`px-4 py-1 rounded-lg text-sm font-semibold transition-colors duration-200 ${fileType === 'audiobook' ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-slate-200'}` }
            aria-pressed={fileType === 'audiobook' ? 'true' : 'false'}
          >
            Audio
          </button>
        </div>
      </div>
      <label
        htmlFor="file-upload"
        onDragEnter={(e) => handleDragEvents(e, true)}
        onDragLeave={(e) => handleDragEvents(e, false)}
        onDragOver={(e) => handleDragEvents(e, true)}
        onDrop={handleDrop}
        className={`flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-xl cursor-pointer transition-all duration-300 ${
          disabled ? (isDark ? 'bg-slate-700/50 border-slate-600 cursor-not-allowed' : 'bg-slate-200 border-slate-300 cursor-not-allowed') :
          isDragging ? (isDark ? 'bg-blue-900/50 border-blue-400 scale-105' : 'bg-blue-100 border-blue-500 scale-105') : (isDark ? 'bg-slate-800 border-slate-600 hover:bg-slate-700/50 hover:border-slate-500' : 'bg-white border-slate-300 hover:bg-slate-100 hover:border-slate-400')
        }`}
      >
        <div className="flex flex-col items-center justify-center pt-5 pb-6 px-4 text-center h-full">
          {isDragging ? (
            <p className={`text-lg font-semibold ${isDark ? 'text-blue-300' : 'text-blue-600'}`}>Release to upload</p>
          ) : (
            renderContent()
          )}
        </div>
        <input id="file-upload" type="file" className="hidden" accept={`${acceptedMimeTypes},${acceptedExtension}`} onChange={onInputChange} disabled={disabled} key={fileType} />
      </label>
    </div>
  );
};
