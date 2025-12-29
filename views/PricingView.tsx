
import React, { useState, useEffect } from 'react';
import { Icon } from '../components/Icon';
import { ViewState, AppSettings } from '../types';
import { getTranslation } from '../services/translations';
import { useAuth } from '../contexts/AuthContext';

interface Props {
  onNavigate: (view: ViewState) => void;
  settings: AppSettings;
}

export const PricingView: React.FC<Props> = ({ onNavigate, settings }) => {
  const t = (key: string) => getTranslation(key, settings.language);
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    // Check for success query param
    const params = new URLSearchParams(window.location.search);
    if (params.get('success') === 'true') {
        setShowSuccess(true);
        // Clean URL
        window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const handleBuy = async (priceId: string) => {
    if (!user) {
        // Redirect to login or show warning
        alert('Log eerst in om credits te kopen.');
        return;
    }

    if (!priceId) {
        alert('Configuratiefout: Geen prijs ingesteld.');
        return;
    }

    setLoading(true);
    try {
        const response = await fetch('/.netlify/functions/create-checkout', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                priceId: priceId,
                userId: user.uid,
                returnUrl: window.location.origin + window.location.pathname
            }),
        });

        const data = await response.json();
        
        if (data.url) {
            window.location.href = data.url;
        } else {
            console.error('No checkout URL returned', data);
            alert('Er ging iets mis bij het starten van de betaling.');
        }
    } catch (error) {
        console.error('Payment Error:', error);
        alert('Kan geen verbinding maken met het betalingssysteem.');
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-background-dark p-6 pb-24 text-slate-800 dark:text-white overflow-y-auto">
       {/* Success Modal */}
       {showSuccess && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-md overflow-hidden shadow-xl text-center">
                    <div className="p-8">
                        <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
                            <Icon name="check" className="text-3xl" />
                        </div>
                        
                        <h3 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">Bedankt voor je aankoop!</h3>
                        <p className="text-slate-600 dark:text-slate-300 mb-6">
                            Je betaling is succesvol verwerkt. De credits zijn toegevoegd aan je account.
                        </p>

                        <button
                            onClick={() => {
                                setShowSuccess(false);
                                window.location.reload();
                            }}
                            className="w-full py-3 px-4 bg-slate-900 dark:bg-white dark:text-slate-900 text-white rounded-xl font-bold hover:opacity-90 transition-opacity"
                        >
                            Sluiten & Verversen
                        </button>
                    </div>
                </div>
            </div>
        )}

       <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
            <button onClick={() => onNavigate(ViewState.CURRENT)} className="size-10 flex items-center justify-center rounded-full hover:bg-slate-200 dark:hover:bg-white/10 transition-colors">
                <Icon name="arrow_back_ios_new" />
            </button>
            <h1 className="text-3xl font-bold">{t('pricing.title')}</h1>
        </div>

        <div className="text-center mb-12">
            <h2 className="text-4xl font-bold mb-4">{t('pricing.subtitle')}</h2>
            <p className="text-slate-500 dark:text-white/60">{t('pricing.subtitle_desc')}</p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* Free Tier */}
            <div className="bg-white dark:bg-card-dark rounded-3xl p-8 border border-slate-200 dark:border-white/5 shadow-sm relative overflow-hidden">
                <h3 className="text-2xl font-bold mb-2">{t('pricing.free_name')}</h3>
                <p className="text-slate-500 dark:text-white/60 mb-2">{t('pricing.free_description')}</p>
                <p className="text-[11px] font-medium text-slate-400 dark:text-white/40 mb-6 uppercase tracking-wide">
                    {t('pricing.free_limits')}
                </p>
                <div className="text-4xl font-bold mb-8">
                    €0
                    <span className="text-lg font-normal text-slate-400">{t('pricing.per_month')}</span>
                </div>

                <ul className="space-y-4 mb-8">
                    <li className="flex items-center gap-3">
                        <Icon name="check_circle" className="text-green-500" />
                        <span>{t('pricing.free_feature_traffic')}</span>
                    </li>
                </ul>

                <button className="w-full py-3 rounded-xl bg-slate-100 dark:bg-white/10 font-bold text-slate-600 dark:text-white hover:bg-slate-200 dark:hover:bg-white/20 transition-colors mt-auto">
                    {t('pricing.free_button')}
                </button>
            </div>

            {/* Pro Tier */}
            <div className="bg-gradient-to-br from-slate-900 to-slate-800 dark:from-blue-900/40 dark:to-indigo-900/40 rounded-3xl p-8 border border-slate-200 dark:border-white/10 shadow-xl relative overflow-hidden text-white flex flex-col">
                <div className="absolute top-0 right-0 bg-gradient-to-l from-yellow-400 to-orange-500 text-xs font-bold px-3 py-1 rounded-bl-xl uppercase tracking-wider">
                    {t('pricing.pro_badge')}
                </div>
                
                <h3 className="text-2xl font-bold mb-2">{t('pricing.pro_name')}</h3>
                <p className="text-slate-300 mb-2">{t('pricing.pro_description')}</p>
                <p className="text-[11px] font-medium text-slate-400 mb-4 uppercase tracking-wide">
                    {t('pricing.pro_limits')}
                </p>
                <div className="text-2xl font-bold mb-8">
                    € 4,99
                    <span className="text-lg font-normal text-slate-400"> / 100 Credits</span>
                </div>

                <ul className="space-y-2 mb-8">
                    <li className="flex items-center gap-3 text-sm text-slate-200">
                        <Icon name="network_check" className="text-blue-400" />
                        <span>{t('pricing.pro_feature_traffic')}</span>
                    </li>
                </ul>

                <button 
                    onClick={() => handleBuy(import.meta.env.VITE_STRIPE_PRICE_WEATHER)}
                    disabled={loading}
                    className="w-full py-3 rounded-xl bg-primary text-white font-bold hover:bg-primary/90 transition-colors mt-auto flex items-center justify-center gap-2"
                >
                    {loading ? 'Laden...' : 'Koop Bundel'}
                </button>
            </div>

            {/* Baro Tier */}
            <div className="bg-gradient-to-br from-purple-900 to-indigo-900 rounded-3xl p-8 border border-purple-500/30 shadow-2xl relative overflow-hidden text-white flex flex-col transform md:-translate-y-4">
                <div className="absolute top-0 right-0 bg-gradient-to-l from-purple-400 to-pink-500 text-xs font-bold px-3 py-1 rounded-bl-xl uppercase tracking-wider">
                    BARO POWERED
                </div>
                
                <h3 className="text-2xl font-bold mb-2">Baro Weerman</h3>
                <p className="text-purple-200 mb-2">Het meest gepersonaliseerde weerbericht ter wereld.</p>
                <p className="text-[11px] font-medium text-purple-300 mb-4 uppercase tracking-wide">
                    + 500 Credits
                </p>
                <div className="text-2xl font-bold mb-8">
                    € 14,99 <span className="text-sm font-normal text-purple-200">eenmalig</span>
                </div>

                <ul className="space-y-2 mb-8">
                    <li className="flex items-center gap-3 text-sm text-purple-100">
                        <Icon name="auto_awesome" className="text-pink-400" />
                        <span>Gepersonaliseerd weerbericht</span>
                    </li>
                     <li className="flex items-center gap-3 text-sm text-purple-100">
                        <Icon name="person" className="text-pink-400" />
                        <span>Profiel voorkeuren</span>
                    </li>
                     <li className="flex items-center gap-3 text-sm text-purple-100">
                        <Icon name="bolt" className="text-pink-400" />
                        <span>500 Baro Credits</span>
                    </li>
                </ul>

                <button 
                    onClick={() => handleBuy(import.meta.env.VITE_STRIPE_PRICE_BARO)}
                    disabled={loading}
                    className="w-full py-3 rounded-xl font-bold transition-colors mt-auto bg-white text-purple-900 hover:bg-purple-50 flex items-center justify-center gap-2"
                >
                    {loading ? 'Laden...' : 'Koop Baro Pro'}
                </button>
            </div>
        </div>
      </div>
    </div>
  );
};
