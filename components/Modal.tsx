import React, { useEffect } from 'react';
import { Icon } from './Icon';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title?: string;
    children: React.ReactNode;
    className?: string;
    fullScreen?: boolean;
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, className = '', fullScreen = false }) => {
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in" onClick={onClose}>
            <div 
                className={`bg-white dark:bg-[#1e293b] w-full ${fullScreen ? 'h-full max-w-none rounded-none m-0' : 'max-w-md rounded-3xl'} overflow-hidden relative flex flex-col shadow-2xl animate-in zoom-in-95 duration-200 ${className}`}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                {(title || onClose) && (
                    <div className={`p-4 border-b border-slate-100 dark:border-white/10 flex justify-between items-center bg-slate-50/50 dark:bg-white/5 ${fullScreen ? 'absolute top-0 left-0 right-0 z-[2001] bg-white/80 dark:bg-black/40 backdrop-blur-md' : ''}`}>
                        {title && (
                            <h3 className="font-bold text-lg text-slate-800 dark:text-white">
                                {title}
                            </h3>
                        )}
                        <button 
                            onClick={onClose} 
                            className="ml-auto p-2 hover:bg-slate-200 dark:hover:bg-white/10 rounded-full transition-colors text-slate-500 dark:text-white/60"
                        >
                            <Icon name="close" />
                        </button>
                    </div>
                )}
                
                {/* Content */}
                <div className={`${fullScreen ? 'h-full w-full p-0' : 'p-6 overflow-y-auto max-h-[80vh]'}`}>
                    {children}
                </div>
            </div>
        </div>
    );
};
