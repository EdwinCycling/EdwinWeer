import React, { useEffect } from 'react';
import { Icon } from './Icon';

interface ToastProps {
    message: string;
    type?: 'success' | 'error' | 'info';
    onClose: () => void;
    duration?: number;
}

export const Toast: React.FC<ToastProps> = ({ 
    message, 
    type = 'success', 
    onClose, 
    duration = 3000 
}) => {
    useEffect(() => {
        const timer = setTimeout(onClose, duration);
        return () => clearTimeout(timer);
    }, [onClose, duration]);

    const bgClass = type === 'success' 
        ? 'bg-emerald-500 text-white' 
        : type === 'error' 
            ? 'bg-red-500 text-white' 
            : 'bg-indigo-600 text-white';

    const iconName = type === 'success' 
        ? 'check_circle' 
        : type === 'error' 
            ? 'error' 
            : 'info';

    return (
        <div className="fixed bottom-[68px] md:bottom-24 left-6 right-6 md:left-auto md:right-6 md:w-80 z-[3000] animate-in slide-in-from-bottom-4 duration-300">
            <div className={`${bgClass} shadow-2xl rounded-2xl p-4 flex items-center gap-3 border border-white/10`}>
                <Icon name={iconName} className="text-xl" />
                <p className="text-sm font-bold flex-1">{message}</p>
                <button onClick={onClose} className="opacity-70 hover:opacity-100 transition-opacity">
                    <Icon name="close" className="text-lg" />
                </button>
            </div>
        </div>
    );
};
