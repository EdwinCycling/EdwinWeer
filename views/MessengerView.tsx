import React, { useState, useEffect } from 'react';
import { ViewState, AppSettings, BaroProfile } from '../types';
import { Icon } from '../components/Icon';
import { useAuth } from '../contexts/AuthContext';
import { doc, getDoc, updateDoc, deleteField } from 'firebase/firestore';
import { db } from '../services/firebase';
import { ScheduleConfig } from '../components/ScheduleConfig';

interface Props {
  onNavigate: (view: ViewState) => void;
  settings?: AppSettings;
  onUpdateSettings?: (newSettings: AppSettings) => void;
}

export const MessengerView: React.FC<Props> = ({ onNavigate, settings, onUpdateSettings }) => {
  const { user } = useAuth();
  const [telegramChatId, setTelegramChatId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  
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
    if (!user || !confirm('Weet je zeker dat je Telegram wilt ontkoppelen?')) return;

    try {
      await updateDoc(doc(db, 'users', user.uid), {
        telegramChatId: deleteField()
      });
      setTelegramChatId(null);
    } catch (error) {
      console.error('Error disconnecting Telegram:', error);
      alert('Er ging iets mis bij het ontkoppelen.');
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 dark:bg-background-dark pb-24 animate-in fade-in slide-in-from-bottom-4 text-slate-800 dark:text-white transition-colors duration-300">
      {/* Header */}
      <div className="flex flex-col sticky top-0 bg-white/95 dark:bg-[#101d22]/95 backdrop-blur z-20 border-b border-slate-200 dark:border-white/5 transition-colors">
        <div className="flex items-center p-4">
          <button 
            onClick={() => onNavigate(ViewState.CURRENT)} 
            className="size-10 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-white/10 mr-2"
          >
            <Icon name="arrow_back_ios_new" />
          </button>
          <h1 className="text-lg font-bold">Baro Messenger</h1>
        </div>
      </div>

      <div className="p-4 flex-grow flex flex-col items-center max-w-lg mx-auto w-full space-y-6">
        
        {/* Intro Card */}
        <div className="bg-white dark:bg-card-dark w-full p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-white/5">
          <div className="flex items-center gap-4 mb-4">
            <div className="size-12 rounded-full bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center text-blue-500">
              <Icon name="send" className="text-2xl" />
            </div>
            <div>
              <h2 className="font-bold text-lg">Zet Baro in je broekzak!</h2>
              <p className="text-sm text-slate-500 dark:text-white/60">Ontvang je weerbericht direct in Telegram</p>
            </div>
          </div>
          
          <div className="text-sm leading-relaxed mb-6 space-y-4">
            <p>
                Wil je jouw persoonlijke weerbericht elke ochtend direct op je telefoon? Koppel Baro nu aan Telegram. Het werkt razendsnel, is superveilig en 100% gratis.
            </p>
            <p className="text-slate-500 dark:text-white/60 text-xs bg-slate-50 dark:bg-white/5 p-3 rounded-lg">
                <strong>Gebruik je nog geen Telegram?</strong><br/>
                Geen probleem! Veel mensen installeren het alleen als hun exclusieve "Baro-App". Het is gratis te downloaden, reclamevrij en binnen 1 minuut geregeld. Geen spam, alleen het weer waar jij van houdt.
            </p>
          </div>

          {!user ? (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-xl border border-yellow-100 dark:border-yellow-900/50 text-sm text-yellow-800 dark:text-yellow-200">
              Je moet ingelogd zijn om Telegram te koppelen.
            </div>
          ) : loading ? (
            <div className="flex justify-center p-4">
              <Icon name="sync" className="animate-spin text-slate-400" />
            </div>
          ) : telegramChatId ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-green-600 dark:text-green-400 font-medium bg-green-50 dark:bg-green-900/20 p-4 rounded-xl border border-green-100 dark:border-green-900/50">
                <Icon name="check_circle" />
                <span>Telegram is verbonden</span>
              </div>
              
              <button 
                onClick={handleDisconnect}
                className="w-full py-3 px-4 rounded-xl border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-sm font-bold flex items-center justify-center gap-2"
              >
                <Icon name="link_off" />
                Ontkoppelen
              </button>
            </div>
          ) : (
            <a 
              href={`https://t.me/AskBaroBot?start=${user.uid}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-3 px-4 bg-[#0088cc] hover:bg-[#0077b5] text-white rounded-xl shadow-lg shadow-blue-500/20 transition-all flex items-center justify-center gap-2 font-bold"
            >
              <Icon name="send" />
              Verbind met Telegram
            </a>
          )}
        </div>

        {/* Feature List */}
        <div className="grid grid-cols-1 gap-4 w-full">
           <div className="flex items-start gap-3 p-4 bg-slate-50 dark:bg-white/5 rounded-xl">
             <Icon name="schedule" className="text-slate-400 mt-1" />
             <div>
               <h3 className="font-bold text-sm">Dagelijkse Update</h3>
               <p className="text-xs text-slate-500 dark:text-white/60 mt-1">Ontvang elke ochtend een compact weerbericht afgestemd op jouw profiel.</p>
             </div>
           </div>
           
           <div className="flex items-start gap-3 p-4 bg-slate-50 dark:bg-white/5 rounded-xl">
             <Icon name="warning" className="text-slate-400 mt-1" />
             <div>
               <h3 className="font-bold text-sm">Noodweer Waarschuwingen</h3>
               <p className="text-xs text-slate-500 dark:text-white/60 mt-1">Directe notificaties bij code oranje of rood in jouw regio.</p>
             </div>
           </div>
        </div>

        {/* Messenger Schedule Config */}
        {telegramChatId && settings && onUpdateSettings && profiles.length > 0 && (
            <div className="w-full space-y-4 pt-6 border-t border-slate-200 dark:border-white/10">
                <h3 className="font-bold text-lg px-1">Messenger Schema</h3>
                
                {/* Profile Selector */}
                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-white mb-2 px-1">
                        Selecteer Profiel
                    </label>
                    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide px-1">
                        {profiles.map(p => (
                            <button
                                key={p.id}
                                onClick={() => setSelectedProfileId(p.id)}
                                className={`px-4 py-2 rounded-xl whitespace-nowrap transition-colors border ${
                                    selectedProfileId === p.id
                                        ? 'bg-primary border-primary text-white shadow-md'
                                        : 'bg-white dark:bg-card-dark border-slate-200 dark:border-white/10 text-slate-600 dark:text-white/70 hover:border-primary/50'
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
            </div>
        )}

      </div>
    </div>
  );
};
