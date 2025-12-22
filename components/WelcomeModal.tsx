import React from 'react';
import { Modal } from './Modal';
import { Icon } from './Icon';

interface WelcomeModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const WelcomeModal: React.FC<WelcomeModalProps> = ({ isOpen, onClose }) => {
    return (
        <Modal 
            isOpen={isOpen} 
            onClose={onClose} 
            className="max-w-xl !p-0 overflow-hidden" // Override padding for full-width image
        >
            <div className="relative h-48 w-full overflow-hidden">
                <img 
                    src="/landing/hero-weather.jpg" 
                    alt="Welcome" 
                    className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 to-transparent flex items-end p-6">
                    <h2 className="text-3xl font-bold text-white">Welkom bij EdwinWeer!</h2>
                </div>
            </div>
            
            <div className="p-6 space-y-6">
                <p className="text-slate-600 dark:text-slate-300 text-lg leading-relaxed">
                    Geweldig dat je er bent! Met deze app heb je altijd het meest uitgebreide weerbericht op zak.
                </p>

                <div className="grid gap-4">
                    <div className="flex items-start gap-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-500/20">
                        <div className="p-2 bg-blue-100 dark:bg-blue-900/50 rounded-lg text-blue-600 dark:text-blue-400">
                            <Icon name="block" />
                        </div>
                        <div>
                            <h3 className="font-bold text-slate-900 dark:text-white mb-1">100% Reclamevrij</h3>
                            <p className="text-sm text-slate-600 dark:text-slate-400">
                                Wij houden niet van afleiding. Geniet van een schone interface zonder vervelende advertenties, ook in de gratis versie.
                            </p>
                        </div>
                    </div>

                    <div className="flex items-start gap-4 p-4 bg-purple-50 dark:bg-purple-900/20 rounded-xl border border-purple-100 dark:border-purple-500/20">
                        <div className="p-2 bg-purple-100 dark:bg-purple-900/50 rounded-lg text-purple-600 dark:text-purple-400">
                            <Icon name="verified" />
                        </div>
                        <div>
                            <h3 className="font-bold text-slate-900 dark:text-white mb-1">Freemium Model</h3>
                            <p className="text-sm text-slate-600 dark:text-slate-400">
                                De basis is gratis en zeer uitgebreid. Voor meer gebruik bieden we een (eenmalig) betalende optie aan om meer WeatherCredits aan te schaffen voor intensiever gebruik.
                            </p>
                        </div>
                    </div>

                    <div className="flex items-start gap-4 p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-100 dark:border-emerald-500/20">
                        <div className="p-2 bg-emerald-100 dark:bg-emerald-900/50 rounded-lg text-emerald-600 dark:text-emerald-400">
                            <Icon name="tune" />
                        </div>
                        <div>
                            <h3 className="font-bold text-slate-900 dark:text-white mb-1">Volledig Aanpasbaar</h3>
                            <p className="text-sm text-slate-600 dark:text-slate-400">
                                Via instellingen kun je alles naar wens aanpassen: van eenheden en weermodellen tot de volgorde van de kaarten op je dashboard.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="pt-4">
                    <button 
                        onClick={onClose}
                        className="w-full py-4 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white rounded-xl font-bold text-lg shadow-lg shadow-blue-500/30 transition-all transform hover:scale-[1.02] active:scale-[0.98]"
                    >
                        Start met Verkennen
                    </button>
                </div>
            </div>
        </Modal>
    );
};
