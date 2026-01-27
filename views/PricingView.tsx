
import React, { useState, useEffect } from 'react';
import { Icon } from '../components/Icon';
import { ViewState, AppSettings } from '../types';
import { getTranslation } from '../services/translations';
import { useAuth } from '../hooks/useAuth';
import { API_LIMITS } from '../services/apiConfig';
import { getUsage, UsageStats, loadRemoteUsage } from '../services/usageService';
import { StaticWeatherBackground } from '../components/StaticWeatherBackground';

interface Props {
  onNavigate: (view: ViewState) => void;
  settings: AppSettings;
}

export const PricingView: React.FC<Props> = ({ onNavigate, settings }) => {
  const t = (key: string, params?: Record<string, any>) => getTranslation(key, settings.language, params);
  const { user, logout } = useAuth();
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
                    console.log("[PricingView] Checking credits...");
                    await loadRemoteUsage(user.uid);
                    const newUsage = getUsage();
                    console.log("[PricingView] New usage stats:", newUsage);
                    setUsageStats(newUsage);
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

  const handleBuy = (priceId: string | undefined) => {
    if (!user) {
        alert('Log eerst in om credits te kopen.');
        return;
    }
    
    if (!priceId) {
        console.error('Price ID is missing. Check environment variables.');
        alert('Fout: Product informatie niet gevonden. Neem contact op met support.');
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
    <div className="relative min-h-screen flex flex-col pb-24 overflow-y-auto text-text-main bg-bg-page transition-colors duration-300">
       <div className="relative z-10 p-6">
       {/* Success Modal */}
       {showSuccess && (
            <div className="fixed inset-0 z-[4000] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                <div className="bg-bg-card rounded-2xl w-full max-w-md overflow-hidden shadow-xl text-center border border-border-color">
                    <div className="p-8">
                        <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
                            <Icon name="check" className="text-3xl" />
                        </div>
                        
                        <h3 className="text-2xl font-bold text-text-main mb-2">Bedankt voor je aankoop!</h3>
                        <p className="text-text-muted mb-6">
                            Je betaling is succesvol verwerkt. De credits worden toegevoegd aan je account.<br/>
                            <span className="text-xs text-text-muted/60">Dit kan enkele seconden duren...</span>
                        </p>

                        <div className="space-y-3">
                            <button
                                onClick={() => {
                                    setShowSuccess(false);
                                    window.location.reload();
                                }}
                                className="w-full py-3 px-4 bg-primary text-white rounded-xl font-bold hover:opacity-90 transition-opacity"
                            >
                                Sluiten & Verversen
                            </button>
                            
                            <button
                                onClick={async () => {
                                    await loadRemoteUsage(user?.uid || '');
                                    setUsageStats(getUsage());
                                }}
                                className="w-full py-2 px-4 text-sm text-text-muted hover:text-text-main font-medium"
                            >
                                Status handmatig checken
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* Confirmation Modal */}
        {confirmModal.show && confirmModal.priceId && (
            <div className="fixed inset-0 z-[4000] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                <div className="bg-bg-card rounded-2xl w-full max-w-md overflow-hidden shadow-xl border border-border-color">
                    <div className="p-6">
                        <h3 className="text-xl font-bold mb-4 text-text-main">
                            {confirmModal.priceId === import.meta.env.VITE_STRIPE_PRICE_WEATHER 
                                ? t('pricing.confirm.title_weather') 
                                : t('pricing.confirm.title_baro')}
                        </h3>
                        
                        <p className="text-text-muted mb-4">
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

                        <p className="text-xs text-text-muted/60 mb-6 flex items-start gap-2">
                             <Icon name="lock" className="text-sm shrink-0 mt-0.5" />
                             {t('pricing.confirm.stripe_info')}
                        </p>

                        <div className="flex gap-3">
                            <button
                                onClick={() => setConfirmModal({ show: false, priceId: null })}
                                className="flex-1 py-3 px-4 bg-bg-subtle text-text-main rounded-xl font-bold hover:bg-bg-subtle/80 transition-colors"
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
            <button onClick={() => onNavigate(ViewState.CURRENT)} className="size-10 flex items-center justify-center rounded-full bg-bg-card/50 backdrop-blur text-text-main hover:bg-bg-card transition-colors">
                <Icon name="arrow_back_ios_new" />
            </button>
            <h1 className="text-3xl font-bold text-text-main drop-shadow-md">{t('pricing.title')}</h1>
        </div>

        <div className="text-center mb-12">
            <h2 className="text-4xl font-bold mb-4 text-text-main drop-shadow-sm">{t('pricing.subtitle')}</h2>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* Free Tier */}
            <div className="bg-bg-card/80 backdrop-blur-md rounded-3xl p-8 border border-border-color shadow-sm relative overflow-hidden flex flex-col">
                <h3 className="text-2xl font-bold mb-2 text-text-main">{t('pricing.free_name')}</h3>
                <p className="text-text-muted mb-2">{t('pricing.free_description')}</p>
                <div className="text-4xl font-bold mb-8 text-text-main">
                    $0
                    <span className="text-lg font-normal text-text-muted/60">{t('pricing.per_month')}</span>
                </div>

                <ul className="space-y-4 mb-8">
                    <li className="flex items-center gap-3 text-sm text-text-muted">
                        <Icon name="check" className="text-green-500" />
                        <span>{t('pricing.free_daily_limit', { limit: API_LIMITS.FREE.DAY })}</span>
                    </li>
                    <li className="flex items-center gap-3 text-sm text-text-muted">
                        <Icon name="calendar_month" className="text-green-500" />
                        <span>{t('pricing.free_monthly_limit', { limit: API_LIMITS.FREE.MONTH })}</span>
                    </li>
                    <li className="flex items-center gap-3 text-sm text-text-muted">
                        <Icon name="check" className="text-green-500" />
                        <span>{t('pricing.free_feature_traffic')}</span>
                    </li>
                </ul>

                {!hasProCredits && (
                    <button className="w-full py-3 rounded-xl bg-bg-subtle font-bold text-text-main hover:bg-bg-subtle/80 transition-colors mt-auto">
                        {t('pricing.free_button')}
                    </button>
                )}
            </div>

            {/* Pro Tier */}
            <div className="bg-gradient-to-br from-slate-900 to-slate-800 dark:from-blue-900/40 dark:to-indigo-900/40 rounded-3xl p-8 border border-white/10 shadow-xl relative overflow-hidden text-white flex flex-col">
                <div className="absolute top-0 right-0 bg-gradient-to-l from-yellow-400 to-orange-500 text-xs font-bold px-3 py-1 rounded-bl-xl uppercase tracking-wider text-white">
                    {t('pricing.pro_badge')}
                </div>
                
                <h3 className="text-2xl font-bold mb-2">{t('pricing.pro_name')}</h3>
                <p className="text-slate-300 mb-2">{t('pricing.pro_description')}</p>
                <div className="text-4xl font-bold mb-8">
                    {t('pricing.pro_price')}
                    <span className="text-sm font-normal text-slate-400"> {t('pricing.one_time')}</span>
                </div>

                <ul className="space-y-2 mb-8">
                    <li className="flex items-center gap-3 text-sm text-slate-200">
                        <Icon name="speed" className="text-blue-400" />
                        <span>{t('pricing.pro_daily_limit')}</span>
                    </li>
                    <li className="flex items-center gap-3 text-sm text-slate-200">
                        <Icon name="calendar_month" className="text-blue-400" />
                        <span>{t('pricing.pro_monthly_limit')}</span>
                    </li>
                    <li className="flex items-center gap-3 text-sm text-slate-200">
                        <Icon name="stars" className="text-blue-400" />
                        <span>{t('pricing.pro_credits')}</span>
                    </li>
                    <li className="flex items-center gap-3 text-sm text-slate-200">
                        <Icon name="history" className="text-blue-400" />
                        <span>{t('pricing.pro_validity')}</span>
                    </li>
                </ul>

                {hasProCredits && (
                    <div className="mb-4 p-3 bg-white/10 rounded-xl text-center">
                        <p className="text-sm text-slate-300">{t('pricing.credits_remaining_prefix')}<strong className="text-white">{usageStats?.weatherCredits}</strong>{t('pricing.credits_remaining_suffix')}</p>
                    </div>
                )}

                <button 
                    onClick={() => handleBuy(import.meta.env.VITE_STRIPE_PRICE_WEATHER)}
                    disabled={loading}
                    className="w-full py-3 rounded-xl bg-primary text-white font-bold hover:bg-primary/90 transition-colors mt-auto flex items-center justify-center gap-2"
                >
                    {loading ? t('pricing.loading') : t('pricing.pro_button')}
                </button>
            </div>

            {/* Baro Tier */}
            <div className="bg-gradient-to-br from-purple-900 to-indigo-900 rounded-3xl p-8 border border-purple-500/30 shadow-2xl relative overflow-hidden text-white flex flex-col transform md:-translate-y-4">
                <div className="absolute top-0 right-0 bg-gradient-to-l from-purple-400 to-pink-500 text-xs font-bold px-3 py-1 rounded-bl-xl uppercase tracking-wider text-white">
                    BARO POWERED
                </div>
                
                <h3 className="text-2xl font-bold mb-2">{t('pricing.baro_weerman')}</h3>
                <p className="text-purple-200 mb-6">{t('pricing.baro_desc')}</p>
                <div className="text-4xl font-bold mb-8">
                    {t('pricing.baro_price')} <span className="text-sm font-normal text-purple-200">{t('pricing.one_time')}</span>
                </div>

                <ul className="space-y-2 mb-8">
                    <li className="flex items-center gap-3 text-sm text-purple-100">
                        <Icon name="auto_awesome" className="text-pink-400" />
                        <span>{t('pricing.baro_feat1')}</span>
                    </li>
                     <li className="flex items-center gap-3 text-sm text-purple-100">
                        <Icon name="person" className="text-pink-400" />
                        <span>{t('pricing.baro_feat2')}</span>
                    </li>
                    <li className="flex items-center gap-3 text-sm text-purple-100">
                        <Icon name="mail" className="text-pink-400" />
                        <span>{t('pricing.baro_feat3')}</span>
                    </li>
                     <li className="flex items-center gap-3 text-sm text-purple-100">
                        <Icon name="history_edu" className="text-pink-400" />
                        <span>{t('pricing.baro_feat5')}</span>
                    </li>
                     <li className="flex items-center gap-3 text-sm text-purple-100">
                        <Icon name="bolt" className="text-pink-400" />
                        <span>{t('pricing.baro_feat4')}</span>
                    </li>
                </ul>

                {hasBaroCredits && (
                    <div className="mb-4 p-3 bg-white/10 rounded-xl text-center">
                        <p className="text-sm text-purple-100">{t('pricing.credits_remaining_prefix')}<strong className="text-white">{usageStats?.baroCredits}</strong>{t('pricing.credits_remaining_suffix')}</p>
                    </div>
                )}

                <button 
                    onClick={() => handleBuy(import.meta.env.VITE_STRIPE_PRICE_BARO)}
                    disabled={loading}
                    className="w-full py-3 rounded-xl font-bold transition-colors mt-auto bg-white text-purple-900 hover:bg-purple-50 flex items-center justify-center gap-2"
                >
                    {loading ? t('pricing.loading') : t('pricing.baro_buy')}
                </button>
            </div>

            {/* Credits Overview */}
            <div className="bg-bg-card/80 backdrop-blur-md rounded-3xl p-8 border border-border-color shadow-sm relative overflow-hidden flex flex-col">
                <h3 className="text-2xl font-bold mb-2 text-text-main">{t('pricing.credits_title')}</h3>
                <p className="text-text-muted mb-8">{t('pricing.credits_desc')}</p>

                <div className="space-y-6 mt-auto">
                    <div className="bg-bg-subtle/50 p-4 rounded-2xl border border-border-color/50">
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium text-text-muted">{t('pricing.weather_credits')}</span>
                            <Icon name="cloud" className="text-primary" />
                        </div>
                        <div className="text-3xl font-bold text-text-main">
                            {usageStats?.weatherCredits?.toLocaleString() || 0}
                        </div>
                    </div>

                    <div className="bg-bg-subtle/50 p-4 rounded-2xl border border-border-color/50">
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium text-text-muted">{t('pricing.baro_credits')}</span>
                            <Icon name="bolt" className="text-purple-500" />
                        </div>
                        <div className="text-3xl font-bold text-text-main">
                            {usageStats?.baroCredits?.toLocaleString() || 0}
                        </div>
                    </div>
                </div>

                <div className="mt-8 pt-8 border-t border-border-color">
                    <button 
                        onClick={async () => {
                            await logout();
                            onNavigate(ViewState.CURRENT);
                        }} 
                        className="w-full py-3 rounded-xl border border-red-500/20 text-red-500 hover:bg-red-500/10 transition-colors font-medium flex items-center justify-center gap-2"
                    >
                        <Icon name="logout" />
                        {t('auth.logout')}
                    </button>
                </div>
            </div>
        </div>

        <div className="mt-12 text-center border-t border-border-color pt-8">
            <p className="text-text-muted text-sm flex items-center justify-center gap-2">
                <Icon name="lock" className="text-base" />
                {t('pricing.stripe_secure')}
            </p>
        </div>
      </div>
      </div>
    </div>
  );
};
