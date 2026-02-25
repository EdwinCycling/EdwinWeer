
import React from 'react';
import { GuessWhoGame } from '../components/guess-who/GuessWhoGame';
import { Icon } from '../components/Icon';
import { AppSettings, ViewState } from '../types';

interface GuessWhoViewProps {
    onNavigate: (view: ViewState) => void;
    settings: AppSettings;
}

export const GuessWhoView: React.FC<GuessWhoViewProps> = ({ onNavigate, settings }) => {

    return (
        <div className="fixed inset-0 z-[60] bg-slate-900">
            <button 
                onClick={() => onNavigate(ViewState.CURRENT)}
                className="absolute top-4 right-4 z-[70] bg-white/10 hover:bg-white/20 text-white p-2 rounded-full backdrop-blur-md transition shadow-lg"
            >
                <Icon name="close" className="text-[24px]" />
            </button>
            
            <GuessWhoGame settings={settings} onExit={() => onNavigate(ViewState.CURRENT)} />
        </div>
    );
};
