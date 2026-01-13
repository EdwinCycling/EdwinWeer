import React, { useState, useEffect } from 'react';
import { ViewState, AppSettings, BaroProfile } from '../types';
import { Icon } from '../components/Icon';
import { useAuth } from '../hooks/useAuth';
import { doc, getDoc, updateDoc, deleteField } from 'firebase/firestore';
import { db } from '../services/firebase';
import { ScheduleConfig } from '../components/ScheduleConfig';
import { getTranslation } from '../services/translations';
import { getUsage } from '../services/usageService';

interface Props {
  onNavigate: (view: ViewState) => void;
  settings?: AppSettings;
  onUpdateSettings?: (newSettings: AppSettings) => void;
}

export const MessengerView: React.FC<Props> = ({ onNavigate, settings, onUpdateSettings }) => {
  const { user } = useAuth();
  const t = (key: string) => getTranslation(key, settings?.language || 'nl');
  const [telegramChatId, setTelegramChatId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [baroCredits, setBaroCredits] = useState(getUsage().baroCredits);

  useEffect(() => {
      const interval = setInterval(() => {
          setBaroCredits(getUsage().baroCredits);
      }, 2000);
      return () => clearInterval(interval);
  }, []);
  
  // Profile handling
  const profiles = settings?.baroProfiles || (settings?.baroProfile ? [settings.baroProfile] : []);
  const [selectedProfileId, setSelectedProfileId] = useState<string>(settings?.baroProfile?.id || (profiles.length > 0 ? profiles[0].id : ''));
  const selectedProfile = profiles.find(p => p.id === selectedProfileId);

  const updateProfile = (updatedProfile: BaroProfile) => {
      if (!settings || !onUpdateSettings) return;
      const index = profiles.findIndex(p => p.id === updatedProfile.id);
      if (index === -1) return;

      const newList = [...profiles];
      newList[index] = updatedProfile;

      onUpdateSettings({
          ...settings,
          baroProfiles: newList,
          baroProfile: settings.baroProfile?.id === updatedProfile.id ? updatedProfile : settings.baroProfile
      });
  };

  useEffect(() => {
    const checkTelegramStatus = async () => {
      if (!user) {
        setLoading(false);
        return;
      }
      
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          setTelegramChatId(userDoc.data().telegramChatId || null);
        }
      } catch (error) {
        console.error('Error fetching telegram status:', error);
      } finally {
        setLoading(false);
      }
    };

    checkTelegramStatus();
  }, [user]);

  const handleDisconnect = async () => {
    if (!user || !confirm(t('messenger.confirm_disconnect'))) return;

    try {
      await updateDoc(doc(db, 'users', user.uid), {
        telegramChatId: deleteField()
      });
      setTelegramChatId(null);
    } catch (error) {
      console.error('Error disconnecting Telegram:', error);
      alert(t('messenger.error_disconnect'));
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-bg-page pb-24 animate-in fade-in slide-in-from-bottom-4 text-text-main transition-colors duration-300">
      {/* Header */}
      <div className="flex flex-col sticky top-0 bg-bg-card/95 backdrop-blur z-20 border-b border-border-color transition-colors">
        <div className="flex items-center p-4">
          <button 
            onClick={() => onNavigate(ViewState.CURRENT)} 
            className="size-10 flex items-center justify-center rounded-full hover:bg-bg-page mr-2"
          >
            <Icon name="arrow_back_ios_new" />
          </button>
          <h1 className="text-lg font-bold">{t('messenger.title')}</h1>
        </div>
      </div>

      <div className="p-4 flex-grow flex flex-col items-center max-w-lg mx-auto w-full space-y-6">
        
        {/* Intro Card */}
        <div className="bg-bg-card w-full p-6 rounded-2xl shadow-sm border border-border-color">
          <div className="flex items-center gap-4 mb-4">
            <div className="size-12 rounded-full bg-accent-primary/10 flex items-center justify-center text-accent-primary">
              <Icon name="send" className="text-2xl" />
            </div>
            <div>
              <h2 className="font-bold text-lg">{t('messenger.intro.title')}</h2>
              <p className="text-sm text-text-muted">{t('messenger.intro.subtitle')}</p>
            </div>
          </div>
          
          <div className="text-sm leading-relaxed mb-6 space-y-4">
            <p>
                {t('messenger.intro.body1')}
            </p>
            <p className="text-text-muted text-xs bg-bg-page p-3 rounded-lg">
                <strong>{t('messenger.intro.body2_bold')}</strong><br/>
                {t('messenger.intro.body2_text')}
            </p>
          </div>

          {!user ? (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-xl border border-yellow-100 dark:border-yellow-900/50 text-sm text-yellow-800 dark:text-yellow-200">
              {t('messenger.login_required')}
            </div>
          ) : loading ? (
            <div className="flex justify-center p-4">
              <Icon name="sync" className="animate-spin text-text-muted" />
            </div>
          ) : telegramChatId ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-green-600 dark:text-green-400 font-medium bg-green-50 dark:bg-green-900/20 p-4 rounded-xl border border-green-100 dark:border-green-900/50">
                <Icon name="check_circle" />
                <span>{t('messenger.status.connected')}</span>
              </div>
              
              <button 
                onClick={handleDisconnect}
                className="w-full py-3 px-4 rounded-xl border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-sm font-bold flex items-center justify-center gap-2"
              >
                <Icon name="link_off" />
                {t('messenger.action.disconnect')}
              </button>
            </div>
          ) : (
            <a 
              href={`https://t.me/AskBaroBot?start=${user.uid}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-3 px-4 bg-accent-primary hover:bg-accent-hover text-text-inverse rounded-xl shadow-lg shadow-accent-primary/20 transition-all flex items-center justify-center gap-2 font-bold"
            >
              <Icon name="send" />
              {t('messenger.action.connect')}
            </a>
          )}
        </div>

        {/* Feature List */}
        <div className="grid grid-cols-1 gap-4 w-full">
           <div className="flex items-start gap-3 p-4 bg-bg-page rounded-xl">
             <Icon name="schedule" className="text-text-muted mt-1" />
             <div>
               <h3 className="font-bold text-sm">{t('messenger.feature.daily_update')}</h3>
               <p className="text-xs text-text-muted mt-1">{t('messenger.feature.daily_update_desc')}</p>
             </div>
           </div>
        </div>

        {/* Messenger Schedule Config */}
        {telegramChatId && settings && onUpdateSettings && profiles.length > 0 && (
            <div className="w-full space-y-4 pt-6 border-t border-border-color">
                <h3 className="font-bold text-lg px-1">{t('messenger.schedule.title')}</h3>

                {baroCredits <= 0 ? (
                    <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-xl border border-red-100 dark:border-red-900/50 text-center">
                        <p className="text-red-800 dark:text-red-200 font-bold mb-2">{t('messenger.schedule.no_credits_title')}</p>
                        <p className="text-sm text-red-600 dark:text-red-300 mb-4">
                            {t('messenger.schedule.no_credits_desc')}
                        </p>
                        <button
                            onClick={() => onNavigate(ViewState.PRICING)}
                            className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-lg font-bold transition-colors"
                        >
                            {t('messenger.schedule.buy_credits')}
                        </button>
                    </div>
                ) : (
                    <>
                        <div className="bg-accent-primary/10 p-3 rounded-xl border border-accent-primary/20 mb-4 flex items-center justify-between">
                            <span className="text-sm text-accent-primary font-medium">
                                {t('messenger.credits.available')} <strong>{baroCredits}</strong>
                            </span>
                        </div>
                
                        {/* Profile Selector */}
                        <div>
                            <label className="block text-sm font-medium text-text-main mb-2 px-1">
                                {t('messenger.profile.select')}
                            </label>
                            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide px-1">
                                {profiles.map((p, idx) => (
                                    <button
                                        key={p.id || `profile-${idx}`}
                                        onClick={() => setSelectedProfileId(p.id)}
                                        className={`px-4 py-2 rounded-xl whitespace-nowrap transition-colors border ${
                                            selectedProfileId === p.id
                                                ? 'bg-accent-primary border-accent-primary text-text-inverse shadow-md'
                                                : 'bg-bg-card border-border-color text-text-muted hover:border-accent-primary/50'
                                        }`}
                                    >
                                        {p.name}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {selectedProfile && (
                            <ScheduleConfig 
                                title={`Messenger Schema voor ${selectedProfile.name}`}
                                schedule={selectedProfile.messengerSchedule}
                                onUpdate={(newSchedule) => {
                                    updateProfile({ ...selectedProfile, messengerSchedule: newSchedule });
                                }}
                                language={settings.language}
                            />
                        )}
                    </>
                )}
            </div>
        )}

      </div>
    </div>
  );
};
