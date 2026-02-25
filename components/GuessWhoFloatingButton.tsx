
import React from 'react';
import { Icon } from './Icon';
import { AppSettings } from '../types';
import { getTranslation } from '../services/translations';

interface Props {
    onClick: () => void;
    settings: AppSettings;
    className?: string;
}

export const GuessWhoFloatingButton: React.FC<Props> = ({ onClick, settings, className = '' }) => {
    // Check if game is enabled in settings (default yes)
    if (settings.enableGuessWho === false) return null;

    const t = (key: string) => getTranslation(key, settings.language);

    return (
        <button
            onClick={onClick}
            className={className || `fixed bottom-72 right-4 z-50 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-full shadow-lg shadow-blue-500/40 transition-all transform hover:scale-105 active:scale-95 flex items-center justify-center gap-2 group w-12 h-12 lg:w-auto lg:h-auto lg:p-3`}
        >
            <div className="bg-white/20 p-1.5 rounded-full flex items-center justify-center">
                <Icon name="face" className="text-xl" />
            </div>
            <span className="hidden lg:inline font-bold text-sm pr-1">
                Guess Who
            </span>
        </button>
    );
};
