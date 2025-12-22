import React, { useEffect, useState } from 'react';
import { ViewState, AppSettings } from '../types';
import { Icon } from '../components/Icon';
import { useAuth } from '../contexts/AuthContext';
import { getUsage, UsageStats, getLimit, resetDailyUsage } from '../services/usageService';
import { API_LIMITS } from '../services/apiConfig';
import { getTranslation } from '../services/translations';

interface Props {
  onNavigate: (view: ViewState) => void;
  settings: AppSettings;
  installPWA?: () => void;
  canInstallPWA?: boolean;
}

export const UserAccountView: React.FC<Props> = ({ onNavigate, settings, installPWA, canInstallPWA }) => {
  const { user, sessionExpiry, logout } = useAuth();
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null);

  const t = (key: string) => getTranslation(key, settings.language);

  useEffect(() => {
    setUsageStats(getUsage());
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-background-dark p-6 pb-24 text-slate-800 dark:text-white overflow-y-auto">
      <div className="max-w-md mx-auto">
        <div className="flex items-center gap-4 mb-8">
            <button onClick={() => onNavigate(ViewState.CURRENT)} className="size-10 flex items-center justify-center rounded-full hover:bg-slate-200 dark:hover:bg-white/10 transition-colors">
                <Icon name="arrow_back_ios_new" />
            </button>
            <h1 className="text-3xl font-bold">{t('nav.user_account')}</h1>
        </div>

        {/* User Profile Card */}
        <div className="bg-white dark:bg-card-dark rounded-3xl p-6 shadow-sm border border-slate-100 dark:border-white/5 mb-6 text-center">
            <div className="size-24 rounded-full bg-slate-200 dark:bg-white/10 mx-auto mb-4 overflow-hidden">
                {user?.photoURL ? (
                    <img src={user.photoURL} alt={user.displayName || 'User'} className="w-full h-full object-cover" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-400 dark:text-white/40">
                        <Icon name="person" className="text-5xl" />
                    </div>
                )}
            </div>
            
            <h2 className="text-xl font-bold mb-1">{user?.displayName || t('account.default_user')}</h2>
            <p className="text-slate-500 dark:text-white/60 text-sm mb-4">{user?.email}</p>

            {sessionExpiry && (
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-full text-xs font-medium mb-6">
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
                    Install App
                </button>
            )}

            <button 
                onClick={async () => {
                    await logout();
                    onNavigate(ViewState.CURRENT); // Or handle redirect in App.tsx
                }} 
                className="w-full py-3 rounded-xl border border-red-100 dark:border-red-500/20 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors font-medium flex items-center justify-center gap-2"
            >
                <Icon name="logout" />
                {t('auth.logout')}
            </button>
        </div>

        {/* Usage Stats Section */}
        <section>
            <h2 className="text-slate-600 dark:text-white/50 text-xs font-bold uppercase tracking-wider mb-3">{t('usage.limits_title')}</h2>
            <p className="text-xs text-slate-500 dark:text-white/40 mb-3">{t('usage.overview_short')}</p>
            <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-white/5 rounded-2xl overflow-hidden shadow-sm transition-colors">
                {usageStats && (
                    <>
                        <div className="p-4 border-b border-slate-100 dark:border-white/5 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <Icon name="analytics" className="text-slate-600 dark:text-white/60" />
                                <span className="font-medium">{t('usage.total')}</span>
                            </div>
                            <div className="font-bold text-slate-800 dark:text-white">
                                {usageStats.totalCalls}
                            </div>
                        </div>
                        <div className="p-4 border-b border-slate-100 dark:border-white/5 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <Icon name="today" className="text-slate-600 dark:text-white/60" />
                                <span className="font-medium">{t('usage.today')}</span>
                            </div>
                            <div className="font-bold text-slate-800 dark:text-white">
                                {usageStats.dayCount} / {getLimit()}
                            </div>
                        </div>
                        <div className="p-4 border-b border-slate-100 dark:border-white/5 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <Icon name="date_range" className="text-slate-600 dark:text-white/60" />
                                <span className="font-medium">{t('usage.this_month')}</span>
                            </div>
                            <div className="font-bold text-slate-800 dark:text-white">
                                {usageStats.monthCount} / {API_LIMITS.MONTH}
                            </div>
                        </div>
                        <div className="p-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <Icon name="verified_user" className="text-slate-600 dark:text-white/60" />
                                <span className="font-medium">{t('usage.status')}</span>
                            </div>
                            <div className={`px-3 py-1 rounded-full text-xs font-bold ${
                                usageStats.dayCount >= getLimit() 
                                    ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' 
                                    : usageStats.dayCount >= getLimit() * 0.8
                                    ? 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400'
                                    : 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
                            }`}>
                                {usageStats.dayCount >= getLimit() 
                                    ? t('usage.limit_reached')
                                    : usageStats.dayCount >= getLimit() * 0.8
                                    ? t('usage.warning')
                                    : t('usage.ok')
                                }
                            </div>
                        </div>
                    </>
                )}
            </div>

            {(user?.email === 'edwin@editsolutions.nl' || user?.email === 'edwin@editsolutions') && (
                <div className="mt-8 pt-8 border-t border-slate-200 dark:border-white/10">
                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Admin Zone</h3>
                    <button 
                        onClick={() => user.uid && resetDailyUsage(user.uid)}
                        className="w-full py-3 px-4 bg-red-50 dark:bg-red-900/10 text-red-500 dark:text-red-400 rounded-xl text-sm font-bold hover:bg-red-100 dark:hover:bg-red-900/20 transition-colors flex items-center justify-center gap-2"
                    >
                        <Icon name="refresh" />
                        Reset Daily Limits (Local & DB)
                    </button>
                </div>
            )}
        </section>

      </div>
    </div>
  );
};
