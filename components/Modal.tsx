import React, { useEffect } from 'react';
import { Icon } from './Icon';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title?: string;
    children: React.ReactNode;
    className?: string;
    fullScreen?: boolean;
    hideHeader?: boolean;
}

export const Modal: React.FC<ModalProps> = ({ 
    isOpen, 
    onClose, 
    title, 
    children, 
    className = '', 
    fullScreen = false,
    hideHeader = false
}) => {
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
                className={`bg-bg-card text-text-main w-full ${fullScreen ? 'h-full max-w-none rounded-none m-0' : 'max-w-md rounded-3xl'} overflow-hidden relative flex flex-col shadow-2xl animate-in zoom-in-95 duration-200 ${className}`}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                {!hideHeader && (title || onClose) && (
                    <div className={`p-4 border-b border-border-color flex justify-between items-center bg-bg-page/50 ${fullScreen ? 'absolute top-0 left-0 right-0 z-[2001] bg-bg-card/80 backdrop-blur-md' : ''}`}>
                        {title && (
                            <h3 className="font-bold text-lg text-text-main">
                                {title}
                            </h3>
                        )}
                        <button 
                            onClick={onClose} 
                            className="ml-auto p-2 hover:bg-black/5 dark:hover:bg-white/10 rounded-full transition-colors text-text-muted"
                        >
                            <Icon name="close" />
                        </button>
                    </div>
                )}
                
                {/* Content */}
                <div className={`${fullScreen ? 'h-full w-full' + (!hideHeader ? ' pt-16' : '') : 'p-6 overflow-y-auto max-h-[80vh]'}`}>
                    {children}
                </div>
            </div>
        </div>
    );
};
