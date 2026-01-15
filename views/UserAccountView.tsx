import React, { useEffect, useState } from 'react';
import { ViewState, AppSettings } from '../types';
import { Icon } from '../components/Icon';
import { Modal } from '../components/Modal';
import { useAuth } from '../hooks/useAuth';
import { getUsage, UsageStats, getLimit, resetDailyUsage } from '../services/usageService';
import { API_LIMITS } from '../services/apiConfig';
import { getTranslation } from '../services/translations';
import { StaticWeatherBackground } from '../components/StaticWeatherBackground';

interface Props {
  onNavigate: (view: ViewState) => void;
  settings: AppSettings;
  installPWA?: () => void;
  canInstallPWA?: boolean;
  showInstallInstructions?: boolean;
}

export const UserAccountView: React.FC<Props> = ({ onNavigate, settings, installPWA, canInstallPWA, showInstallInstructions }) => {
  const { user, sessionExpiry, logout, deleteAccount } = useAuth();
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const t = (key: string) => getTranslation(key, settings.language);

  const handleDeleteAccount = async () => {
    try {
      await deleteAccount();
      setShowDeleteConfirm(false);
      onNavigate(ViewState.CURRENT);
    } catch (error) {
      console.error("Delete failed", error);
      alert(t('error'));
    }
  };

  useEffect(() => {
    setUsageStats(getUsage());
  }, []);

  return (
    <div className="relative min-h-screen flex flex-col pb-24 overflow-y-auto text-text-main bg-bg-page transition-colors duration-300">
      {/* Background Layer */}
      <div className="absolute top-0 left-0 right-0 h-[50vh] z-0 overflow-hidden rounded-b-[3rem]">
          <StaticWeatherBackground 
              weatherCode={0} 
              isDay={1} 
              className="absolute inset-0 w-full h-full"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-bg-page" />
      </div>

      <div className="fixed inset-0 bg-gradient-to-b from-black/40 via-transparent to-transparent dark:from-black/60 dark:via-black/5 dark:to-bg-page/90 z-0 pointer-events-none" />

      <div className="relative z-10 max-w-md mx-auto p-6">
        <div className="flex items-center gap-4 mb-8">
            <button onClick={() => onNavigate(ViewState.CURRENT)} className="size-10 flex items-center justify-center rounded-full bg-bg-card/50 backdrop-blur text-text-main hover:bg-bg-card transition-colors">
                <Icon name="arrow_back_ios_new" />
            </button>
            <h1 className="text-3xl font-bold drop-shadow-md">{t('nav.user_account')}</h1>
        </div>

        {/* User Profile Card */}
        <div className="bg-bg-card/80 backdrop-blur-md rounded-3xl p-6 shadow-sm border border-border-color mb-6 text-center">
            <div className="size-24 rounded-full bg-bg-subtle mx-auto mb-4 overflow-hidden">
                {user?.photoURL ? (
                    <img src={user.photoURL} alt={user.displayName || 'User'} className="w-full h-full object-cover" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-text-muted">
                        <Icon name="person" className="text-5xl" />
                    </div>
                )}
            </div>
            
            <h2 className="text-xl font-bold mb-1 text-text-main">{user?.displayName || t('account.default_user')}</h2>
            <p className="text-text-muted text-sm mb-4">{user?.email}</p>

            {sessionExpiry && (
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-500/10 text-blue-500 rounded-full text-xs font-medium mb-6">
                    <Icon name="history" className="text-sm" />
                    <span>
                      {t('account.logged_in_until')}{' '}
                      {sessionExpiry.toLocaleDateString(settings.language === 'nl' ? 'nl-NL' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </span>
                </div>
            )}

            {canInstallPWA && (
                <button 
                    onClick={installPWA}
                    className="w-full mb-3 py-3 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors font-medium flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20"
                >
                    <Icon name="download" />
                    {t('install_app')}
                </button>
            )}

            {!canInstallPWA && showInstallInstructions && (
                <div className="w-full mb-3 p-4 bg-blue-500/10 rounded-xl text-left border border-blue-500/20">
                    <div className="flex items-center gap-2 mb-2 text-blue-500 font-bold text-sm">
                        <Icon name="ios_share" />
                        <span>{t('install.mac_safari_title') || 'Installeren op Mac'}</span>
                    </div>
                    <p className="text-xs text-text-muted leading-relaxed">
                        {t('install.mac_safari_desc') || 'Klik op "Deel" in de werkbalk en kies "Zet in Dock" om de app te installeren.'}
                    </p>
                </div>
            )}

            <button 
                onClick={async () => {
                    await logout();
                    onNavigate(ViewState.CURRENT); // Or handle redirect in App.tsx
                }} 
                className="w-full py-3 rounded-xl border border-red-500/20 text-red-500 hover:bg-red-500/10 transition-colors font-medium flex items-center justify-center gap-2"
            >
                <Icon name="logout" />
                {t('auth.logout')}
            </button>
        </div>

        {/* Usage Stats Section */}
        <section>
            <h2 className="text-text-muted/60 text-xs font-bold uppercase tracking-wider mb-3">{t('usage.limits_title')}</h2>
            <p className="text-xs text-text-muted mb-3">{t('usage.overview_short')}</p>
            <div className="bg-bg-card/80 backdrop-blur-md border border-border-color rounded-2xl overflow-hidden shadow-sm transition-colors">
                {usageStats && (
                    <>
                        <div className="p-4 border-b border-border-color flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <Icon name="analytics" className="text-text-muted" />
                                <span className="font-medium text-text-main">{t('usage.total')}</span>
                            </div>
                            <div className="font-bold text-text-main">
                                {usageStats.totalCalls}
                            </div>
                        </div>

                        {/* Credits Display */}
                        {(usageStats.weatherCredits > 0 || usageStats.baroCredits > 0) && (
                             <div className="p-4 border-b border-border-color flex items-center justify-between bg-yellow-500/10">
                                <div className="flex items-center gap-3">
                                    <Icon name="stars" className="text-yellow-500" />
                                    <span className="font-medium text-text-main">Credits</span>
                                </div>
                                <div className="text-right">
                                    {usageStats.weatherCredits > 0 && (
                                        <div className="font-bold text-text-main">
                                            {usageStats.weatherCredits} <span className="text-xs font-normal text-text-muted">Weather</span>
                                        </div>
                                    )}
                                    {usageStats.baroCredits > 0 && (
                                        <div className="font-bold text-text-main">
                                            {usageStats.baroCredits} <span className="text-xs font-normal text-text-muted">Baro</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        <div className="p-4 border-b border-border-color flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <Icon name="today" className="text-text-muted" />
                                <span className="font-medium text-text-main">{t('usage.today')}</span>
                            </div>
                            <div className="font-bold text-text-main">
                                {usageStats.dayCount} / {getLimit()}
                            </div>
                        </div>
                        <div className="p-4 border-b border-border-color flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <Icon name="date_range" className="text-text-muted" />
                                <span className="font-medium text-text-main">{t('usage.this_month')}</span>
                            </div>
                            <div className="font-bold text-text-main">
                                {usageStats.monthCount} / {(usageStats.weatherCredits > 0 ? API_LIMITS.PRO.MONTH : API_LIMITS.FREE.MONTH)}
                            </div>
                        </div>
                        <div className="p-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <Icon name="verified_user" className="text-text-muted" />
                                <span className="font-medium text-text-main">{t('usage.status')}</span>
                            </div>
                            <div className={`px-3 py-1 rounded-full text-xs font-bold ${
                                usageStats.dayCount >= getLimit() 
                                    ? 'bg-red-500/20 text-red-500' 
                                    : usageStats.dayCount >= getLimit() * 0.8
                                    ? 'bg-yellow-500/20 text-yellow-500'
                                    : 'bg-green-500/20 text-green-500'
                            }`}>
                                {usageStats.dayCount >= getLimit() 
                                    ? t('usage.limit_reached')
                                    : usageStats.dayCount >= getLimit() * 0.8
                                    ? t('usage.warning')
                                    : t('usage.ok')
                                }
                            </div>
                        </div>

                        {/* History Graph Removed as per request */}
                    </>
                )}
            </div>

            <div className="mt-8 flex justify-center">
                <button 
                    onClick={() => onNavigate(ViewState.PRICING)}
                    className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-colors shadow-lg shadow-blue-500/30"
                >
                    <Icon name="store" />
                    <span>{t('account.manage_credits')}</span>
                </button>
            </div>

            {/* Delete Account Section */}
            <div className="mt-8 pt-8 border-t border-border-color">
                <button 
                    onClick={() => setShowDeleteConfirm(true)}
                    className="w-full py-3 px-4 text-red-500/60 hover:text-red-600 text-sm transition-colors flex items-center justify-center gap-2"
                >
                    <Icon name="delete" />
                    {t('faq.q.delete')}
                </button>
            </div>
        </section>

        <Modal
            isOpen={showDeleteConfirm}
            onClose={() => setShowDeleteConfirm(false)}
            title={t('faq.q.delete')}
        >
            <div className="text-center">
                <div className="size-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4 text-red-500">
                    <Icon name="warning" className="text-3xl" />
                </div>
                <h3 className="text-lg font-bold mb-2 text-text-main">
                    {t('faq.q.delete')}?
                </h3>
                <p className="text-text-muted mb-6">
                    {t('faq.a.delete')}
                </p>
                <div className="flex gap-3">
                    <button
                        onClick={() => setShowDeleteConfirm(false)}
                        className="flex-1 py-3 bg-bg-subtle text-text-main rounded-xl font-medium hover:bg-bg-subtle/80 transition-colors"
                    >
                        {t('cancel')}
                    </button>
                    <button
                        onClick={handleDeleteAccount}
                        className="flex-1 py-3 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 transition-colors shadow-lg shadow-red-600/20"
                    >
                        {t('delete')}
                    </button>
                </div>
            </div>
        </Modal>

      </div>
    </div>
  );
};
