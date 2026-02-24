import React from 'react';
import { useRadio } from '../contexts/RadioContext';
import { Icon } from './Icon';

interface Props {
    visible: boolean;
    className?: string;
}

export const FloatingRadioPlayer: React.FC<Props> = ({ visible, className }) => {
    const { isPlaying, pause, volume, setVolume } = useRadio();

    if (!visible || !isPlaying) return null;

    const content = (
        <>
            {/* Pulsing Icon - Acts as Stop button on mobile */}
            <button onClick={pause} className="relative flex items-center justify-center">
                <div className="absolute inset-0 bg-[#E5C100] rounded-full animate-ping opacity-20"></div>
                <div className="relative bg-[#E5C100] text-black p-1 rounded-full flex items-center justify-center">
                    <Icon name="radio" className="text-lg" />
                </div>
            </button>

            <div className="hidden md:flex flex-col pr-1">
                <span className="text-[10px] font-bold text-[#E5C100] uppercase tracking-wider leading-none">ON</span>
            </div>

            <div className="hidden md:block h-4 w-px bg-white/10 mx-1"></div>

            <button 
                onClick={pause}
                className="hidden md:block p-1 rounded-full bg-white/10 hover:bg-red-500/20 text-white hover:text-red-400 transition-colors"
                title="Stop Radio"
            >
                <Icon name="stop" className="text-lg" />
            </button>
        </>
    );

    if (className) {
        return (
            <div className={className}>
                {content}
            </div>
        );
    }

    return (
        <div className="fixed bottom-40 right-4 z-50 animate-in slide-in-from-bottom-5 fade-in duration-300">
            <div className="bg-black/80 backdrop-blur-md border border-[#E5C100]/30 rounded-full shadow-lg flex items-center justify-center w-12 h-12 md:w-auto md:h-auto md:p-2 gap-2">
                {content}
            </div>
        </div>
    );
};
