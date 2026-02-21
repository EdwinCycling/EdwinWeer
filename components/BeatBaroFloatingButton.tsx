
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

    if (loading) return null;

    // Logic:
    // 1. If hasBet (user already placed a bet): Show GREEN circle button with ONLY icon (no text)
    // 2. If !hasBet (no bet yet): Show WHITE pill button with TEXT + ICON

    if (hasBet) {
         return (
            <button
                onClick={() => onNavigate(ViewState.GAME_DASHBOARD)}
            className={className || "fixed bottom-[160px] md:bottom-40 right-4 z-40 bg-green-500 text-white p-3 rounded-full shadow-lg border border-green-600 flex items-center justify-center hover:scale-105 transition-transform animate-in zoom-in duration-300"}
            aria-label={t('game.title')}
            >
                <Icon name="sports_mma" className="text-xl" />
            </button>
        );
    }

    // Default state (Call to Action)
    return (
        <button
            onClick={() => onNavigate(ViewState.GAME_DASHBOARD)}
            className={className || "fixed bottom-[160px] md:bottom-40 right-4 z-40 bg-white dark:bg-slate-800 text-text-main px-4 py-2 rounded-full shadow-lg border border-border-color flex items-center gap-2 hover:scale-105 transition-transform animate-in zoom-in duration-300 group"}
        >
            <span className="text-xl group-hover:rotate-12 transition-transform">🥊</span>
            <span className="font-bold text-sm whitespace-nowrap">Beat Baro</span>
        </button>
    );
};
