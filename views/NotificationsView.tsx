import React, { useState, useEffect } from 'react';
import { ViewState, AppSettings, BaroProfile } from '../types';
import { Icon } from '../components/Icon';
import { useAuth } from '../contexts/AuthContext';
import { doc, getDoc, updateDoc, deleteField } from 'firebase/firestore';
import { db, messaging } from '../services/firebase';
import { getToken, deleteToken, onMessage } from 'firebase/messaging';
import { ScheduleConfig } from '../components/ScheduleConfig';
import { getTranslation } from '../services/translations';

interface Props {
  onNavigate: (view: ViewState) => void;
  settings?: AppSettings;
  onUpdateSettings?: (newSettings: AppSettings) => void;
}

export const NotificationsView: React.FC<Props> = ({ onNavigate, settings, onUpdateSettings }) => {
  const { user } = useAuth();
  const t = (key: string) => getTranslation(key, settings?.language || 'nl');
  const [fcmToken, setFcmToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (msg: string) => {
    console.log(`[NotifView] ${msg}`);
    setLogs(prev => [`${new Date().toLocaleTimeString()} - ${msg}`, ...prev].slice(0, 50));
  };
  
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
    const checkNotificationStatus = async () => {
      if (!user) {
        setLoading(false);
        return;
      }
      
      try {
        addLog('Checking notification status...');
        
        // Always check Firestore first
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          const dbToken = userDoc.data().fcmToken;
          if (dbToken) {
              setFcmToken(dbToken);
              addLog('Token found in Firestore.');
          }
        }

        // If permission is granted, verify local token matches
        if (Notification.permission === 'granted') {
            addLog('Permission granted, verifying local token...');
            
            const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
            addLog(`VAPID Check: ${vapidKey ? (vapidKey.startsWith('B') ? 'Valid prefix (B...)' : 'Invalid prefix') : 'MISSING'}`);

            const swUrl = `/firebase-messaging-sw.js?apiKey=${import.meta.env.VITE_FIREBASE_API_KEY}&authDomain=${import.meta.env.VITE_FIREBASE_AUTH_DOMAIN}&projectId=${import.meta.env.VITE_FIREBASE_PROJECT_ID}&storageBucket=${import.meta.env.VITE_FIREBASE_STORAGE_BUCKET}&messagingSenderId=${import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID}&appId=${import.meta.env.VITE_FIREBASE_APP_ID}&measurementId=${import.meta.env.VITE_FIREBASE_MEASUREMENT_ID}`;
            
            const registration = await navigator.serviceWorker.register(swUrl);
            await navigator.serviceWorker.ready; // Wait for active SW
            
            const currentToken = await getToken(messaging, { 
                vapidKey: vapidKey,
                serviceWorkerRegistration: registration 
            });

            if (currentToken) {
                if (currentToken !== userDoc.data()?.fcmToken) {
                    addLog('Local token differs from DB. Updating DB...');
                    await updateDoc(doc(db, 'users', user.uid), { fcmToken: currentToken });
                    setFcmToken(currentToken);
                    addLog('Token synced to DB.');
                } else {
                    addLog('Local token matches DB.');
                }
            } else {
                addLog('No local token retrieved.');
            }
        } else {
            addLog('Permission not granted: ' + Notification.permission);
        }

      } catch (error) {
        console.error('Error fetching notification status:', error);
        addLog('Error: ' + error);
      } finally {
        setLoading(false);
      }
    };

    checkNotificationStatus();
  }, [user]);

  // Handle foreground messages
  useEffect(() => {
    if (!fcmToken) return;
    
    addLog('Setting up foreground listener...');

    const unsubscribe = onMessage(messaging, (payload) => {
      console.log('Foreground message received:', payload);
      addLog(`📩 Message received: ${JSON.stringify(payload)}`);
      
      const title = payload.notification?.title || 'Nieuw bericht';
      const body = payload.notification?.body || '';
      
      // Show simple alert for now
      alert(`🔔 ${title}\n\n${body}`);
      
      if (Notification.permission === 'granted') {
          new Notification(title, {
            body: body,
            icon: '/icons/baro-icon-192.png'
          });
      }
    });

    return () => unsubscribe();
  }, [fcmToken]);

  const handleEnableNotifications = async () => {
    if (!user) return;

    try {
      addLog('Requesting permission...');
      const permission = await Notification.requestPermission();
      addLog(`Permission result: ${permission}`);
      
      if (permission === 'granted') {
        const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
        if (!vapidKey) {
            addLog('Error: VAPID key is missing in environment variables!');
            alert('Configuratie fout: VAPID key ontbreekt.');
            return;
        }
        
        // Unregister existing workers to ensure clean state
        if (navigator.serviceWorker) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (const registration of registrations) {
                if (registration.active?.scriptURL.includes('firebase-messaging-sw.js')) {
                    addLog('Unregistering old SW...');
                    await registration.unregister();
                }
            }
        }

        // Register Service Worker with config params to avoid hardcoding in public/sw.js
        const swUrl = `/firebase-messaging-sw.js?apiKey=${import.meta.env.VITE_FIREBASE_API_KEY}&authDomain=${import.meta.env.VITE_FIREBASE_AUTH_DOMAIN}&projectId=${import.meta.env.VITE_FIREBASE_PROJECT_ID}&storageBucket=${import.meta.env.VITE_FIREBASE_STORAGE_BUCKET}&messagingSenderId=${import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID}&appId=${import.meta.env.VITE_FIREBASE_APP_ID}&measurementId=${import.meta.env.VITE_FIREBASE_MEASUREMENT_ID}`;
        
        addLog('Registering Service Worker...');
        const registration = await navigator.serviceWorker.register(swUrl);
        
        addLog('SW Registered. Waiting for ready...');
        await navigator.serviceWorker.ready;
        addLog('SW Ready. Getting token...');
        
        let token;
        try {
            token = await getToken(messaging, { 
              vapidKey: vapidKey,
              serviceWorkerRegistration: registration 
            });
        } catch (tokenError: any) {
            addLog(`Token Error: ${tokenError.message || tokenError}`);
            if (tokenError.code === 'messaging/permission-blocked') {
                alert('Notificaties zijn geblokkeerd door de browser. Controleer de site-instellingen.');
            } else {
                throw tokenError;
            }
            return;
        }
        
        if (token) {
          addLog('Token received! Saving to DB...');
          await updateDoc(doc(db, 'users', user.uid), {
            fcmToken: token
          });
          setFcmToken(token);
          addLog('Saved to DB.');
          alert(t('notifications.success') || '✅ Meldingen staan aan!');
        } else {
            addLog('No token received.');
        }
      } else {
        alert(t('notifications.permission_denied') || 'Toestemming geweigerd voor meldingen.');
      }
    } catch (error: any) {
      console.error('Error enabling notifications:', error);
      addLog(`General Error: ${error.message || error}`);
      alert(t('notifications.error') || 'Er ging iets mis bij het aanzetten van meldingen.');
    }
  };

  const handleDisableNotifications = async () => {
    if (!user || !confirm(t('notifications.confirm_disable') || 'Weet je zeker dat je meldingen wilt uitzetten?')) return;

    try {
      await deleteToken(messaging);
      await updateDoc(doc(db, 'users', user.uid), {
        fcmToken: deleteField()
      });
      setFcmToken(null);
    } catch (error) {
      console.error('Error disabling notifications:', error);
      alert(t('notifications.error_disable') || 'Er ging iets mis bij het uitzetten van meldingen.');
    }
  };

  const handleTestNotification = async () => {
    if (!fcmToken) return;
    
    setLoading(true);
    try {
      const response = await fetch('/.netlify/functions/test-push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token: fcmToken }),
      });
      
      if (response.ok) {
        alert('Test bericht verstuurd! Controleer je notificaties.');
      } else {
        alert('Kon geen test bericht versturen.');
      }
    } catch (error) {
      console.error('Error sending test notification:', error);
      alert('Er is een fout opgetreden.');
    } finally {
      setLoading(false);
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
          <h1 className="text-lg font-bold">{t('notifications.title') || 'Web Push Notificaties'}</h1>
        </div>
      </div>

      <div className="p-4 flex-grow flex flex-col items-center max-w-lg mx-auto w-full space-y-6">
        
        {/* Intro Card */}
        <div className="bg-white dark:bg-card-dark w-full p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-white/5">
          <div className="flex items-center gap-4 mb-4">
            <div className="size-12 rounded-full bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center text-blue-500">
              <Icon name="notifications" className="text-2xl" />
            </div>
            <div>
              <h2 className="font-bold text-lg">{t('notifications.intro.title') || 'Mis nooit meer een update!'}</h2>
              <p className="text-sm text-slate-500 dark:text-white/60">{t('notifications.intro.subtitle') || 'Ontvang dagelijks weerberichten.'}</p>
            </div>
          </div>
          
          <div className="text-sm leading-relaxed mb-6 space-y-4">
            <p>
                {t('notifications.intro.body1') || 'Activeer pushmeldingen om dagelijks op de hoogte te blijven van het weer.'}
            </p>
          </div>

          {!user ? (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-xl border border-yellow-100 dark:border-yellow-900/50 text-sm text-yellow-800 dark:text-yellow-200">
              {t('notifications.login_required') || 'Je moet ingelogd zijn om meldingen te ontvangen.'}
            </div>
          ) : loading ? (
            <div className="flex justify-center p-4">
              <Icon name="sync" className="animate-spin text-slate-400" />
            </div>
          ) : fcmToken ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-green-600 dark:text-green-400 font-medium bg-green-50 dark:bg-green-900/20 p-4 rounded-xl border border-green-100 dark:border-green-900/50">
                <Icon name="check_circle" />
                <span>{t('notifications.active') || 'Meldingen staan aan!'}</span>
              </div>
              
              <button 
                onClick={handleDisableNotifications}
                className="w-full py-3 px-4 rounded-xl border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-sm font-bold flex items-center justify-center gap-2"
              >
                <Icon name="notifications_off" />
                {t('notifications.disable') || 'Meldingen uitzetten'}
              </button>
              
              <button 
                onClick={handleTestNotification}
                className="w-full py-3 px-4 rounded-xl border border-blue-200 dark:border-blue-900/50 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors text-sm font-bold flex items-center justify-center gap-2"
              >
                <Icon name="send" />
                Stuur test bericht
              </button>
            </div>
          ) : (
            <button 
              onClick={handleEnableNotifications}
              className="w-full py-3 px-4 bg-[#0088cc] hover:bg-[#0077b5] text-white rounded-xl shadow-lg shadow-blue-500/20 transition-all flex items-center justify-center gap-2 font-bold"
            >
              <Icon name="notifications_active" />
              {t('notifications.enable') || '🔔 Zet Meldingen Aan'}
            </button>
          )}

          {/* Debug Log Area */}
          <div className="mt-8 w-full bg-slate-100 dark:bg-black/20 p-4 rounded-xl border border-slate-200 dark:border-white/5 font-mono text-xs overflow-hidden">
            <h4 className="font-bold mb-2 text-slate-500 uppercase tracking-wider">Debug Log</h4>
            <div className="h-32 overflow-y-auto space-y-1 text-slate-600 dark:text-slate-400">
                {logs.length === 0 ? (
                    <span className="italic opacity-50">Wachten op acties...</span>
                ) : (
                    logs.map((log, i) => <div key={i}>{log}</div>)
                )}
            </div>
          </div>
        </div>

        {/* Feature List */}
        <div className="grid grid-cols-1 gap-4 w-full">
           <div className="flex items-start gap-3 p-4 bg-slate-50 dark:bg-white/5 rounded-xl">
             <Icon name="schedule" className="text-slate-400 mt-1" />
             <div>
               <h3 className="font-bold text-sm">{t('notifications.feature.daily') || 'Dagelijkse Update'}</h3>
               <p className="text-xs text-slate-500 dark:text-white/60 mt-1">{t('notifications.feature.daily_desc') || 'Ontvang meldingen zelfs als de browser gesloten is.'}</p>
             </div>
           </div>
        </div>

        {/* Schedule Config */}
        {fcmToken && settings && onUpdateSettings && profiles.length > 0 && (
            <div className="w-full space-y-4 pt-6 border-t border-slate-200 dark:border-white/10">
                <h3 className="font-bold text-lg px-1">{t('notifications.schedule.title') || 'Melding Schema'}</h3>
                
                {/* Profile Selector */}
                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-white mb-2 px-1">
                        {t('notifications.select_profile') || 'Selecteer Profiel'}
                    </label>
                    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide px-1">
                        {profiles.map((p, idx) => (
                            <button
                                key={p.id || `profile-${idx}`}
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
                        title={`Schema voor ${selectedProfile.name}`}
                        schedule={selectedProfile.messengerSchedule} // Reusing messengerSchedule for now as requested
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
