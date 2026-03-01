
import React from 'react';
import { Icon } from './Icon';
import { ViewState, AppSettings } from '../types';
import { getTranslation } from '../services/translations';
import { useBeatBaroStatus } from '../hooks/useBeatBaroStatus';

interface Props {
    onNavigate: (view: ViewState) => void;
    settings: AppSettings;
    className?: string; // Allow custom positioning
}

export const BeatBaroFloatingButton: React.FC<Props> = ({ onNavigate, settings, className }) => {
    const { hasBet, loading } = useBeatBaroStatus();
    const t = (key: string) => getTranslation(key, settings.language);

    if (settings.enableBeatBaro === false) return null;
    if (loading) return null;

    // Logic:
    // 1. If hasBet (user already placed a bet): Show GREEN circle button with ONLY icon (no text)
    // 2. If !hasBet (no bet yet): Show WHITE pill button with TEXT + ICON

    if (hasBet) {
         return (
            <button
                onClick={() => onNavigate(ViewState.GAME_DASHBOARD)}
            className={className || "fixed bottom-56 right-4 z-40 bg-green-500 text-white rounded-full shadow-lg border border-green-600 flex items-center justify-center hover:scale-105 transition-transform animate-in zoom-in duration-300 w-12 h-12 lg:w-auto lg:h-auto lg:p-3"}
            aria-label={t('game.title')}
            >
                <Icon name="sports_mma" className="text-xl" />
                <span className="hidden lg:inline font-bold text-sm whitespace-nowrap ml-2">Beat Baro</span>
            </button>
        );
    }

    // Default state (Call to Action)
    return (
        <button
            onClick={() => onNavigate(ViewState.GAME_DASHBOARD)}
            className={className || "fixed bottom-56 right-4 z-40 bg-white dark:bg-slate-800 text-text-main rounded-full shadow-lg border border-border-color flex items-center justify-center gap-2 hover:scale-105 transition-transform animate-in zoom-in duration-300 group w-12 h-12 lg:w-auto lg:h-auto lg:px-4 lg:py-2"}
        >
            <span className="text-xl group-hover:rotate-12 transition-transform">🥊</span>
            <span className="hidden lg:inline font-bold text-sm whitespace-nowrap">Beat Baro</span>
        </button>
    );
};
