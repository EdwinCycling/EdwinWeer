import React from 'react';
import { Modal } from './Modal';
import { Icon } from './Icon';
import { ViewState } from '../types';
import { STORAGE_KEY } from '../services/apiConfig';
import { useAuth } from '../hooks/useAuth';

interface LimitReachedModalProps {
    isOpen: boolean;
    onClose: () => void;
    onNavigate?: (view: ViewState) => void;
    limit?: number;
    scope?: string; // 'day', 'month', etc.
    message?: string;
}

export const LimitReachedModal: React.FC<LimitReachedModalProps> = ({ isOpen, onClose, onNavigate, limit, scope, message }) => {
    const { user } = useAuth();

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Limit Reached">
            <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-4 text-red-600 dark:text-red-400">
                    <Icon name="warning" className="text-3xl" />
                </div>
                
                <h3 className="text-xl font-bold mb-2 text-slate-900 dark:text-white">
                    {message ? 'Limit Reached' : 'WeatherCredits Limit Reached'}
                </h3>
                
                <p className="text-slate-600 dark:text-slate-300 mb-6">
                    {message || (
                        <>
                        You have reached your daily limit of <strong>{limit}</strong> WeatherCredits. 
                        Your credits will reset tomorrow.
                        </>
                    )}
                </p>

                <div className="w-full space-y-3">
                    {onNavigate && (
                    <button 
                        onClick={() => {
                            onClose();
                            onNavigate(ViewState.PRICING);
                        }}
                        className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white rounded-xl font-bold shadow-lg shadow-blue-500/30 transition-all transform hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2"
                    >
                        <Icon name="upgrade" />
                        Upgrade Plan
                    </button>
                    )}
                    
                    <button 
                        onClick={onClose}
                        className="w-full py-3 px-4 bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/20 text-slate-700 dark:text-white rounded-xl font-medium transition-colors"
                    >
                        Close
                    </button>
                </div>
            </div>
        </Modal>
    );
};
