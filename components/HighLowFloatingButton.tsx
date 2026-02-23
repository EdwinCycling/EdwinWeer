import React from 'react';
import { Icon } from './Icon';
import { AppSettings } from '../types';
import { getTranslation } from '../services/translations';

interface Props {
    onClick: () => void;
    settings: AppSettings;
    className?: string;
}

export const HighLowFloatingButton: React.FC<Props> = ({ onClick, settings, className = '' }) => {
    // Check if game is enabled in settings (default yes)
    if (settings.enableHighLowGame === false) return null;

    const t = (key: string) => getTranslation(key, settings.language);

    return (
        <button
            onClick={onClick}
            className={`fixed bottom-[220px] md:bottom-56 right-4 z-50 bg-gradient-to-r from-accent-primary to-accent-secondary text-white p-3 rounded-full shadow-lg shadow-accent-primary/40 transition-all transform hover:scale-105 active:scale-95 flex items-center gap-2 group ${className}`}
        >
            <div className="bg-white/20 p-1.5 rounded-full">
                <Icon name="casino" className="text-xl" />
            </div>
            <span className="font-bold text-sm pr-1">
                {t('game.highlow.floating_button')}
            </span>
        </button>
    );
};
