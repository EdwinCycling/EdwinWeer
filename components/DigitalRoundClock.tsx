import React from 'react';

interface Props {
    currentTime: Date;
    settings: {
        language: string;
    };
}

export const DigitalRoundClock: React.FC<Props> = ({ currentTime, settings }) => {
    const timeStr = currentTime.toLocaleTimeString(settings.language === 'nl' ? 'nl-NL' : 'en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
    
    const seconds = currentTime.getSeconds().toString().padStart(2, '0');
    
    const dateStr = currentTime.toLocaleDateString(settings.language === 'nl' ? 'nl-NL' : 'en-GB', {
        day: 'numeric',
        month: 'short'
    }).toUpperCase();

    return (
        <div className="relative p-8 flex flex-col items-center justify-center overflow-hidden transition-all duration-500">
            {/* LED Glow Background Effect (Optional, keep it subtle for transparency) */}
            <div className="absolute inset-0 bg-black/10 backdrop-blur-sm rounded-3xl border border-white/5 shadow-2xl" />
            
            <div className="z-10 flex flex-col items-center">
                <div className="flex items-baseline gap-2">
                    <div className="text-[100px] font-bold text-emerald-400 font-mono tracking-tighter leading-none drop-shadow-[0_0_15px_rgba(52,211,153,0.5)]">
                        {timeStr}
                    </div>
                    <div className="text-4xl font-bold text-emerald-500/80 font-mono drop-shadow-[0_0_10px_rgba(52,211,153,0.3)]">
                        {seconds}
                    </div>
                </div>
                <div className="text-xl font-bold text-emerald-300/60 mt-4 tracking-[0.3em] uppercase font-mono">
                    {dateStr}
                </div>
            </div>
            
            {/* Scanline overlay for that retro LED/CRT feel */}
            <div className="absolute inset-0 pointer-events-none opacity-[0.03] bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] z-20" style={{ backgroundSize: '100% 2px, 3px 100%' }} />
        </div>
    );
};
