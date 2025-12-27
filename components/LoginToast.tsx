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

    const isEdwin = userEmail === 'edwin@editsolutions.nl';
    const status = isEdwin ? 'AI Weerman' : 'Free Plan'; // Logic can be expanded for Pro
    
    // Credits
    const weatherLimit = getLimit();
    const weatherUsed = stats.dayCount || 0;
    const weatherRemaining = Math.max(0, weatherLimit - weatherUsed);

    const aiLimit = 5; // Hardcoded for now, or move to config
    const aiUsed = stats.aiCalls || 0;
    const aiRemaining = Math.max(0, aiLimit - aiUsed);

    return (
        <div className="fixed top-24 right-4 z-[3000] animate-in slide-in-from-right fade-in duration-500">
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl p-4 flex items-start gap-4 max-w-sm">
                <div className={`p-3 rounded-xl ${isEdwin ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600'}`}>
                    <Icon name={isEdwin ? "smart_toy" : "person"} className="text-xl" />
                </div>
                <div>
                    <h4 className="font-bold text-slate-900 dark:text-white">Welkom terug!</h4>
                    <p className="text-xs text-slate-500 dark:text-white/60 mb-2">
                        Status: <span className="font-medium text-slate-700 dark:text-white">{status}</span>
                    </p>
                    
                    <div className="space-y-1">
                        <div className="flex items-center gap-2 text-xs">
                            <Icon name="cloud" className="text-slate-400 text-[10px]" />
                            <span>Weather Credits: <b>{weatherRemaining}</b> / {weatherLimit}</span>
                        </div>
                        {isEdwin && (
                            <div className="flex items-center gap-2 text-xs">
                                <Icon name="bolt" className="text-purple-400 text-[10px]" />
                                <span>AI Credits: <b>{aiRemaining}</b> / {aiLimit}</span>
                            </div>
                        )}
                    </div>
                </div>
                <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-white">
                    <Icon name="close" className="text-sm" />
                </button>
            </div>
        </div>
    );
};
