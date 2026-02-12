import React, { useEffect, useState } from 'react';
import { Icon } from './Icon';
import { getUsage, getLimit } from '../services/usageService';
import { API_LIMITS } from '../services/apiConfig';

interface Props {
    userEmail: string | null;
    onClose: () => void;
}

export const LoginToast: React.FC<Props> = ({ userEmail, onClose }) => {
    const [stats, setStats] = useState<any>(null);

    useEffect(() => {
        setStats(getUsage());
        const timer = setTimeout(onClose, 5000); // Auto close after 5s
        return () => clearTimeout(timer);
    }, [onClose]);

    if (!stats) return null;

    const isEdwin = userEmail === 'AskBaroApp@gmail.com';
    const status = isEdwin ? 'Baro Weerman' : 'Free Plan'; // Logic can be expanded for Pro
    
    // Credits
    const weatherLimit = getLimit();
    const weatherUsed = stats.dayCount || 0;
    const weatherRemaining = Math.max(0, weatherLimit - weatherUsed);

    const aiLimit = 25; // Matching usageService limit
    const aiUsed = stats.aiCalls || 0;
    const aiRemaining = Math.max(0, aiLimit - aiUsed);

    return (
        <div className="fixed bottom-[68px] md:bottom-24 right-6 left-6 md:left-auto md:w-80 z-[100] animate-in slide-in-from-bottom-4 duration-500">
            <div className="bg-bg-card backdrop-blur-xl border border-border-color rounded-3xl p-4 shadow-2xl flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-accent-primary to-indigo-600 flex items-center justify-center text-white shadow-lg shrink-0">
                    <Icon name="person" className="text-2xl" />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-accent-primary uppercase tracking-wider mb-0.5">{status}</p>
                    <h4 className="font-bold text-text-main truncate leading-tight">
                        Welkom terug!
                    </h4>
                    <div className="flex items-center gap-2 mt-1 text-[10px] text-text-muted font-medium">
                        <div className="flex items-center gap-1">
                            <Icon name="auto_awesome" className="text-[10px] text-yellow-500" />
                            <span>Baro Credits: <b>{aiRemaining}</b> / {aiLimit}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
