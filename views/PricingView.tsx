
import React, { useState, useEffect } from 'react';
import { Icon } from '../components/Icon';
import { ViewState, AppSettings } from '../types';
import { getTranslation } from '../services/translations';
import { useAuth } from '../contexts/AuthContext';
import { API_LIMITS } from '../services/apiConfig';
import { getUsage, UsageStats, loadRemoteUsage } from '../services/usageService';

interface Props {
  onNavigate: (view: ViewState) => void;
  settings: AppSettings;
}

export const PricingView: React.FC<Props> = ({ onNavigate, settings }) => {
  const t = (key: string, params?: Record<string, any>) => getTranslation(key, settings.language, params);
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ show: boolean, priceId: string | null }>({ show: false, priceId: null });

  useEffect(() => {
    // Load usage stats
    setUsageStats(getUsage());

    // Check for success query param
    const init = async () => {
        const params = new URLSearchParams(window.location.search);
        if (params.get('success') === 'true') {
            // Only proceed if user is loaded
            if (!user?.uid) return;

            setShowSuccess(true);
            
            // Poll for credit updates (webhook latency)
            const checkCredits = async () => {
                try {
                    await loadRemoteUsage(user.uid);
                    setUsageStats(getUsage());
                } catch (e) {
                    console.error("Error refreshing credits:", e);
                }
            };

            // Initial check
            await checkCredits();

            // Retry a few times
            let retries = 0;
            const interval = setInterval(async () => {
                retries++;
                await checkCredits();
                if (retries >= 5) clearInterval(interval);
            }, 2000);

            // Clean URL
            window.history.replaceState({}, '', window.location.pathname);
        }
    };
    
    init();
  }, [user]);

  const hasProCredits = (usageStats?.weatherCredits || 0) > 0;
  const hasBaroCredits = (usageStats?.baroCredits || 0) > 0;
  const hasAnyCredits = hasProCredits || hasBaroCredits;

  const handleBuy = (priceId: string) => {
    if (!user) {
        alert('Log eerst in om credits te kopen.');
        return;
    }
    setConfirmModal({ show: true, priceId });
  };

  const startCheckout = async () => {
    const priceId = confirmModal.priceId;
    if (!user || !priceId) return;

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
                locale: settings.language,
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
        setConfirmModal({ show: false, priceId: null });
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

        {/* Confirmation Modal */}
        {confirmModal.show && confirmModal.priceId && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-md overflow-hidden shadow-xl">
                    <div className="p-6">
                        <h3 className="text-xl font-bold mb-4">
                            {confirmModal.priceId === import.meta.env.VITE_STRIPE_PRICE_WEATHER 
                                ? t('pricing.confirm.title_weather') 
                                : t('pricing.confirm.title_baro')}
                        </h3>
                        
                        <p className="text-slate-600 dark:text-slate-300 mb-4">
                            {confirmModal.priceId === import.meta.env.VITE_STRIPE_PRICE_WEATHER 
                                ? t('pricing.confirm.desc_weather', { amount: '10.000' })
                                : t('pricing.confirm.desc_baro', { amount: '500' })}
                        </p>

                        {confirmModal.priceId === import.meta.env.VITE_STRIPE_PRICE_WEATHER && (
                            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl mb-4 text-sm">
                                <p className="font-bold text-blue-800 dark:text-blue-200 whitespace-pre-line">
                                    {t('pricing.confirm.limits')}
                                </p>
                            </div>
                        )}

                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-6 flex items-start gap-2">
                             <Icon name="lock" className="text-sm shrink-0 mt-0.5" />
                             {t('pricing.confirm.stripe_info')}
                        </p>

                        <div className="flex gap-3">
                            <button
                                onClick={() => setConfirmModal({ show: false, priceId: null })}
                                className="flex-1 py-3 px-4 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                            >
                                {t('pricing.confirm.cancel')}
                            </button>
                            <button
                                onClick={startCheckout}
                                disabled={loading}
                                className="flex-1 py-3 px-4 bg-primary text-white rounded-xl font-bold hover:opacity-90 transition-opacity"
                            >
                                {loading ? '...' : t('pricing.confirm.continue')}
                            </button>
                        </div>
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
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* Free Tier */}
            <div className="bg-white dark:bg-card-dark rounded-3xl p-8 border border-slate-200 dark:border-white/5 shadow-sm relative overflow-hidden flex flex-col">
                <h3 className="text-2xl font-bold mb-2">{t('pricing.free_name')}</h3>
                <p className="text-slate-500 dark:text-white/60 mb-2">{t('pricing.free_description')}</p>
                <div className="text-4xl font-bold mb-8">
                    $0
                    <span className="text-lg font-normal text-slate-400">{t('pricing.per_month')}</span>
                </div>

                <ul className="space-y-4 mb-8">
                    <li className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
                        <Icon name="check" className="text-green-500" />
                        <span>Tot {API_LIMITS.FREE.DAY} calls per dag</span>
                    </li>
                    <li className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
                        <Icon name="calendar_month" className="text-green-500" />
                        <span>{API_LIMITS.FREE.MONTH} calls per maand</span>
                    </li>
                    <li className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
                        <Icon name="check" className="text-green-500" />
                        <span>{t('pricing.free_feature_traffic')}</span>
                    </li>
                </ul>

                {!hasProCredits && (
                    <button className="w-full py-3 rounded-xl bg-slate-100 dark:bg-white/10 font-bold text-slate-600 dark:text-white hover:bg-slate-200 dark:hover:bg-white/20 transition-colors mt-auto">
                        {t('pricing.free_button')}
                    </button>
                )}
            </div>

            {/* Pro Tier */}
            <div className="bg-gradient-to-br from-slate-900 to-slate-800 dark:from-blue-900/40 dark:to-indigo-900/40 rounded-3xl p-8 border border-slate-200 dark:border-white/10 shadow-xl relative overflow-hidden text-white flex flex-col">
                <div className="absolute top-0 right-0 bg-gradient-to-l from-yellow-400 to-orange-500 text-xs font-bold px-3 py-1 rounded-bl-xl uppercase tracking-wider">
                    {t('pricing.pro_badge')}
                </div>
                
                <h3 className="text-2xl font-bold mb-2">{t('pricing.pro_name')}</h3>
                <p className="text-slate-300 mb-2">{t('pricing.pro_description')}</p>
                <div className="text-4xl font-bold mb-8">
                    {t('pricing.pro_price')}
                    <span className="text-sm font-normal text-slate-400"> eenmalig</span>
                </div>

                <ul className="space-y-2 mb-8">
                    <li className="flex items-center gap-3 text-sm text-slate-200">
                        <Icon name="speed" className="text-blue-400" />
                        <span>250 calls per dag</span>
                    </li>
                    <li className="flex items-center gap-3 text-sm text-slate-200">
                        <Icon name="calendar_month" className="text-blue-400" />
                        <span>2500 calls per maand</span>
                    </li>
                    <li className="flex items-center gap-3 text-sm text-slate-200">
                        <Icon name="stars" className="text-blue-400" />
                        <span>10.000 Weather Credits</span>
                    </li>
                    <li className="flex items-center gap-3 text-sm text-slate-200">
                        <Icon name="history" className="text-blue-400" />
                        <span>Credits blijven onbeperkt geldig</span>
                    </li>
                </ul>

                {hasProCredits && (
                    <div className="mb-4 p-3 bg-white/10 rounded-xl text-center">
                        <p className="text-sm text-slate-300">Je hebt nog <strong className="text-white">{usageStats?.weatherCredits}</strong> credits</p>
                    </div>
                )}

                <button 
                    onClick={() => handleBuy(import.meta.env.VITE_STRIPE_PRICE_WEATHER)}
                    disabled={loading}
                    className="w-full py-3 rounded-xl bg-primary text-white font-bold hover:bg-primary/90 transition-colors mt-auto flex items-center justify-center gap-2"
                >
                    {loading ? 'Laden...' : t('pricing.pro_button')}
                </button>
            </div>

            {/* Baro Tier */}
            <div className="bg-gradient-to-br from-purple-900 to-indigo-900 rounded-3xl p-8 border border-purple-500/30 shadow-2xl relative overflow-hidden text-white flex flex-col transform md:-translate-y-4">
                <div className="absolute top-0 right-0 bg-gradient-to-l from-purple-400 to-pink-500 text-xs font-bold px-3 py-1 rounded-bl-xl uppercase tracking-wider">
                    BARO POWERED
                </div>
                
                <h3 className="text-2xl font-bold mb-2">Baro Weerman</h3>
                <p className="text-purple-200 mb-6">Het meest gepersonaliseerde weerbericht ter wereld.</p>
                <div className="text-4xl font-bold mb-8">
                    $ 2,50 <span className="text-sm font-normal text-purple-200">eenmalig</span>
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
                        <Icon name="mail" className="text-pink-400" />
                        <span>Mail mogelijkheden + Schedules</span>
                    </li>
                     <li className="flex items-center gap-3 text-sm text-purple-100">
                        <Icon name="bolt" className="text-pink-400" />
                        <span>500 Baro Credits (500 persoonlijke weerberichten)</span>
                    </li>
                </ul>

                {hasBaroCredits && (
                    <div className="mb-4 p-3 bg-white/10 rounded-xl text-center">
                        <p className="text-sm text-purple-100">Je hebt nog <strong className="text-white">{usageStats?.baroCredits}</strong> Baro credits</p>
                    </div>
                )}

                <button 
                    onClick={() => handleBuy(import.meta.env.VITE_STRIPE_PRICE_BARO)}
                    disabled={loading}
                    className="w-full py-3 rounded-xl font-bold transition-colors mt-auto bg-white text-purple-900 hover:bg-purple-50 flex items-center justify-center gap-2"
                >
                    {loading ? 'Laden...' : 'Koop Baro Pro'}
                </button>
            </div>
        </div>

        <div className="mt-12 text-center border-t border-slate-200 dark:border-white/10 pt-8">
            <p className="text-slate-500 dark:text-white/40 text-sm flex items-center justify-center gap-2">
                <Icon name="lock" className="text-base" />
                Alle betalingen verlopen veilig via Stripe.com, het meest betrouwbare betaalplatform ter wereld.
            </p>
        </div>
      </div>
    </div>
  );
};
