import React from 'react';

interface Props {
    progress: number;
    message?: string;
}

export const ProgressBar: React.FC<Props> = ({ progress, message }) => {
    return (
        <div className="flex flex-col items-center justify-center py-20 w-full max-w-md mx-auto">
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-4 mb-4 overflow-hidden relative">
                <div 
                    className="bg-blue-500 h-4 rounded-full transition-all duration-300 ease-out relative overflow-hidden"
                    style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                >
                    <div className="absolute inset-0 bg-white/30 animate-[shimmer_2s_infinite] w-full h-full" 
                         style={{ backgroundImage: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.5) 50%, transparent 100%)', backgroundSize: '200% 100%' }}>
                    </div>
                </div>
            </div>
            <div className="flex items-center justify-between w-full px-1">
                <span className="text-text-muted font-medium animate-pulse">
                    {message || 'Loading...'}
                </span>
                <span className="text-blue-500 font-bold">
                    {Math.round(progress)}%
                </span>
            </div>
            <style>{`
                @keyframes shimmer {
                    0% { transform: translateX(-100%); }
                    100% { transform: translateX(100%); }
                }
            `}</style>
        </div>
    );
};
