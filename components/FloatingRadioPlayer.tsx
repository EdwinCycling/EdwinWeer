import React from 'react';
import { useRadio } from '../contexts/RadioContext';
import { Icon } from './Icon';

interface Props {
    visible: boolean;
}

export const FloatingRadioPlayer: React.FC<Props> = ({ visible }) => {
    const { isPlaying, pause, volume, setVolume } = useRadio();

    if (!visible || !isPlaying) return null;

    return (
        <div className="fixed bottom-[120px] md:bottom-40 right-4 z-50 animate-in slide-in-from-bottom-5 fade-in duration-300">
            <div className="bg-black/80 backdrop-blur-md border border-[#E5C100]/30 rounded-full shadow-lg p-2 flex items-center gap-2">
                {/* Pulsing Icon */}
                <div className="relative">
                    <div className="absolute inset-0 bg-[#E5C100] rounded-full animate-ping opacity-20"></div>
                    <div className="relative bg-[#E5C100] text-black p-1 rounded-full">
                        <Icon name="radio" className="text-lg" />
                    </div>
                </div>

                <div className="flex flex-col pr-1">
                    <span className="text-[10px] font-bold text-[#E5C100] uppercase tracking-wider leading-none">ON</span>
                </div>

                <div className="h-4 w-px bg-white/10 mx-1"></div>

                <button 
                    onClick={pause}
                    className="p-1 rounded-full bg-white/10 hover:bg-red-500/20 text-white hover:text-red-400 transition-colors"
                    title="Stop Radio"
                >
                    <Icon name="stop" className="text-lg" />
                </button>
            </div>
        </div>
    );
};
