import React from 'react';

export const LoadingSpinner: React.FC = () => {
  return (
    <div className="min-h-[50vh] w-full flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 dark:border-blue-400"></div>
    </div>
  );
};
