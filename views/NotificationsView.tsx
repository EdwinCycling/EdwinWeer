import React, { useState, useEffect } from 'react';
import { ViewState, AppSettings, BaroProfile } from '../types';
import { Icon } from '../components/Icon';
import { useAuth } from '../hooks/useAuth';
import { doc, getDoc, updateDoc, deleteField } from 'firebase/firestore';
import { db, messaging } from '../services/firebase';
import { getToken, deleteToken, onMessage } from 'firebase/messaging';
import { ScheduleConfig } from '../components/ScheduleConfig';
import { getTranslation } from '../services/translations';
import { getUsage } from '../services/usageService';

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
  const [baroCredits, setBaroCredits] = useState<number>(0);
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  const addLog = (msg: string) => {
    console.log(`[NotifView] ${msg}`);
    setLogs(prev => [`${new Date().toLocaleTimeString()} - ${msg}`, ...prev].slice(0, 50));
  };

  useEffect(() => {
    const fetchCredits = async () => {
      if (user) {
        const usage = getUsage();
        setBaroCredits(usage.baroCredits || 0);
      }
    };
    fetchCredits();
  }, [user]);
  
  // Profile & Location handling
  const locations = settings?.favorites || [];
  const currentProfile = settings?.baroProfile || (settings?.baroProfiles && settings.baroProfiles.length > 0 ? settings.baroProfiles[0] : null);
  const [selectedLocationName, setSelectedLocationName] = useState<string>(currentProfile?.location || (locations.length > 0 ? locations[0].name : ''));

  // Update local state when profile changes
  useEffect(() => {
    if (currentProfile?.location) {
        setSelectedLocationName(currentProfile.location);
    }
  }, [currentProfile]);

  const updateLocation = (newLocation: string) => {
      if (!settings || !onUpdateSettings || !currentProfile) return;
      
      const updatedProfile = {
          ...currentProfile,
          location: newLocation
      };

      // Update in settings
      onUpdateSettings({
          ...settings,
          baroProfile: updatedProfile,
          // Also update in the list if it exists there
          baroProfiles: settings.baroProfiles?.map(p => p.id === updatedProfile.id ? updatedProfile : p) || [updatedProfile]
      });
      
      setSelectedLocationName(newLocation);
  };

  const updateSchedule = (newSchedule: any) => {
      if (!settings || !onUpdateSettings || !currentProfile) return;
      
      const updatedProfile = {
          ...currentProfile,
          messengerSchedule: newSchedule
      };

      onUpdateSettings({
          ...settings,
          baroProfile: updatedProfile,
          baroProfiles: settings.baroProfiles?.map(p => p.id === updatedProfile.id ? updatedProfile : p) || [updatedProfile]
      });
  };

  useEffect(() => {
    const checkNotificationStatus = async () => {
      // Feature is mobile only
      if (!isMobile) {
          setLoading(false);
          return;
      }

      if (!user) {
        setLoading(false);
        return;
      }
      
      try {
        // Always check Firestore first
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          const dbToken = userDoc.data().fcmToken;
          if (dbToken) {
              setFcmToken(dbToken);
          }
        }

        // If permission is granted, verify local token matches
        if (Notification.permission === 'granted') {
            const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;

            const swUrl = `/firebase-messaging-sw.js?apiKey=${import.meta.env.VITE_FIREBASE_API_KEY}&authDomain=${import.meta.env.VITE_FIREBASE_AUTH_DOMAIN}&projectId=${import.meta.env.VITE_FIREBASE_PROJECT_ID}&storageBucket=${import.meta.env.VITE_FIREBASE_STORAGE_BUCKET}&messagingSenderId=${import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID}&appId=${import.meta.env.VITE_FIREBASE_APP_ID}&measurementId=${import.meta.env.VITE_FIREBASE_MEASUREMENT_ID}`;
            
            const registration = await navigator.serviceWorker.register(swUrl);
            await navigator.serviceWorker.ready; // Wait for active SW
            
            const currentToken = await getToken(messaging, { 
                vapidKey: vapidKey,
                serviceWorkerRegistration: registration 
            });

            if (currentToken) {
                if (currentToken !== userDoc.data()?.fcmToken) {
                    await updateDoc(doc(db, 'users', user.uid), { fcmToken: currentToken });
                    setFcmToken(currentToken);
                }
            }
        }

      } catch (error) {
        console.error('Error fetching notification status:', error);
      } finally {
        setLoading(false);
      }
    };

    checkNotificationStatus();
  }, [user]);

  // Handle foreground messages
  useEffect(() => {
    if (!fcmToken) return;
    
    const unsubscribe = onMessage(messaging, (payload) => {
      console.log('Foreground message received:', payload);
      
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
      const permission = await Notification.requestPermission();
      
      if (permission === 'granted') {
        const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
        if (!vapidKey) {
            alert('Configuratie fout: VAPID key ontbreekt.');
            return;
        }
        
        // Unregister existing workers to ensure clean state
        if (navigator.serviceWorker) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (const registration of registrations) {
                if (registration.active?.scriptURL.includes('firebase-messaging-sw.js')) {
                    await registration.unregister();
                }
            }
        }

        // Register Service Worker with config params to avoid hardcoding in public/sw.js
        const swUrl = `/firebase-messaging-sw.js?apiKey=${import.meta.env.VITE_FIREBASE_API_KEY}&authDomain=${import.meta.env.VITE_FIREBASE_AUTH_DOMAIN}&projectId=${import.meta.env.VITE_FIREBASE_PROJECT_ID}&storageBucket=${import.meta.env.VITE_FIREBASE_STORAGE_BUCKET}&messagingSenderId=${import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID}&appId=${import.meta.env.VITE_FIREBASE_APP_ID}&measurementId=${import.meta.env.VITE_FIREBASE_MEASUREMENT_ID}`;
        
        const registration = await navigator.serviceWorker.register(swUrl);
        
        await navigator.serviceWorker.ready;
        
        let token;
        try {
            token = await getToken(messaging, { 
              vapidKey: vapidKey,
              serviceWorkerRegistration: registration 
            });
        } catch (tokenError: any) {
            console.error('Token retrieval failed', tokenError);
            
            if (tokenError.message.includes('push service error')) {
                 alert('Configuratie fout: Push service weigert de registratie. Controleer of de VAPID key in .env overeenkomt met het Firebase project.');
            } else if (tokenError.code === 'messaging/permission-blocked') {
                alert('Notificaties zijn geblokkeerd door de browser. Controleer de site-instellingen.');
            } else {
                // Try fallback: unregister and let browser handle default registration
                try {
                    token = await getToken(messaging, { vapidKey: vapidKey });
                } catch (retryError: any) {
                     console.error('Fallback failed', retryError);
                }
            }
        }
        
        if (token) {
          await updateDoc(doc(db, 'users', user.uid), {
            fcmToken: token
          });
          setFcmToken(token);
          alert(t('notifications.success') || '✅ Meldingen staan aan!');
        } else {
            console.warn('No token received.');
        }
      } else {
        alert(t('notifications.permission_denied') || 'Toestemming geweigerd voor meldingen.');
      }
    } catch (error: any) {
      console.error('Error enabling notifications:', error);
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
    if (!fcmToken || !user) return;
    
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const response = await fetch('/.netlify/functions/test-push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
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
          <h1 className="text-lg font-bold">{t('notifications.title') || 'Web Push Notificaties'}</h1>
        </div>
      </div>

      <div className="p-4 flex-grow flex flex-col items-center max-w-lg mx-auto w-full space-y-6">
        
        {/* Intro Card */}
        <div className="bg-bg-card w-full p-6 rounded-2xl shadow-sm border border-border-color">
          <div className="flex items-center gap-4 mb-4">
            <div className="size-12 rounded-full bg-accent-primary/10 flex items-center justify-center text-accent-primary">
              <Icon name="notifications" className="text-2xl" />
            </div>
            <div>
              <h2 className="font-bold text-lg">{t('notifications.intro.title') || 'Mis nooit meer een update!'}</h2>
              <p className="text-sm text-text-muted">{t('notifications.intro.subtitle') || 'Ontvang dagelijks weerberichten.'}</p>
            </div>
          </div>
          
          <div className="text-sm leading-relaxed mb-6 space-y-4">
            <p>
                {t('notifications.intro.body1') || 'Activeer pushmeldingen om dagelijks op de hoogte te blijven van het weer.'}
            </p>
          </div>

          {!user ? (
            <div className="bg-yellow-500/10 p-4 rounded-xl border border-yellow-500/20 text-sm text-yellow-600">
              {t('notifications.login_required') || 'Je moet ingelogd zijn om meldingen te ontvangen.'}
            </div>
          ) : !isMobile ? (
            <div className="bg-accent-primary/10 p-4 rounded-xl border border-accent-primary/20 text-sm text-accent-primary">
                <div className="flex items-center gap-2 mb-2 font-bold">
                    <Icon name="info" />
                    <span>{t('notifications.mobile_only') || 'Alleen op mobiel'}</span>
                </div>
                <p>{t('notifications.platform_note') || 'Je kunt hieronder wel het schema instellen, maar de meldingen zelf ontvang je op je telefoon.'}</p>
            </div>
          ) : loading ? (
            <div className="flex justify-center p-4">
              <Icon name="sync" className="animate-spin text-text-muted" />
            </div>
          ) : fcmToken ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-green-600 font-medium bg-green-500/10 p-4 rounded-xl border border-green-500/20">
                <Icon name="check_circle" />
                <span>{t('notifications.active') || 'Meldingen staan aan!'}</span>
              </div>
              
              <button 
                onClick={handleDisableNotifications}
                className="w-full py-3 px-4 rounded-xl border border-red-500/20 text-red-600 hover:bg-red-500/10 transition-colors text-sm font-bold flex items-center justify-center gap-2"
              >
                <Icon name="notifications_off" />
                {t('notifications.disable') || 'Meldingen uitzetten'}
              </button>
              
              <button 
                onClick={handleTestNotification}
                className="w-full py-3 px-4 rounded-xl border border-accent-primary/20 text-accent-primary hover:bg-accent-primary/10 transition-colors text-sm font-bold flex items-center justify-center gap-2"
              >
                <Icon name="send" />
                Stuur test bericht
              </button>
            </div>
          ) : (
            <button 
              onClick={handleEnableNotifications}
              className="w-full py-3 px-4 bg-accent-primary hover:bg-accent-hover text-text-inverse rounded-xl shadow-lg shadow-accent-primary/20 transition-all flex items-center justify-center gap-2 font-bold"
            >
              <Icon name="notifications_active" />
              {t('notifications.enable') || '🔔 Zet Meldingen Aan'}
            </button>
          )}
        </div>

        {/* Feature List */}
        <div className="grid grid-cols-1 gap-4 w-full">
           <div className="flex items-start gap-3 p-4 bg-bg-page rounded-xl">
             <Icon name="schedule" className="text-text-muted mt-1" />
             <div>
               <h3 className="font-bold text-sm">{t('notifications.feature.daily') || 'Dagelijkse Update'}</h3>
               <p className="text-xs text-text-muted mt-1">{t('notifications.feature.daily_desc') || 'Ontvang meldingen zelfs als de browser gesloten is.'}</p>
             </div>
           </div>
        </div>

        {/* Notification Schedule Config */}
        {fcmToken && settings && onUpdateSettings && currentProfile && (
            <div className="w-full space-y-4 pt-6 border-t border-border-color">
                <h3 className="font-bold text-lg px-1">{t('notifications.schedule.title') || 'Melding Schema'}</h3>
                
                {baroCredits <= 0 ? (
                    <div className="bg-red-500/10 p-4 rounded-xl border border-red-500/20 text-center">
                        <p className="text-red-600 font-bold mb-2">Geen Baro Credits beschikbaar</p>
                        <p className="text-sm text-red-500 mb-4">
                            Je hebt Baro credits nodig om een schema te maken en weerberichten te ontvangen.
                        </p>
                        <button
                            onClick={() => onNavigate(ViewState.PRICING)}
                            className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-lg font-bold transition-colors">
                            Credits kopen
                        </button>
                    </div>
                ) : (
                    <>
                        <div className="bg-accent-primary/10 p-3 rounded-xl border border-accent-primary/20 mb-4 flex items-center justify-between">
                            <span className="text-sm text-accent-primary font-medium">
                                Beschikbare Baro Credits: <strong>{baroCredits}</strong>
                            </span>
                        </div>

                        {/* Location Selector (Only for notifications view) */}
                        <div>
                            <label className="block text-sm font-medium text-text-main mb-2 px-1">
                                {t('notifications.select_location') || 'Selecteer Locatie'}
                            </label>
                            {locations.length > 0 ? (
                                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide px-1">
                                    {locations.map((loc, idx) => (
                                        <button
                                            key={`${loc.name}-${idx}`}
                                            onClick={() => updateLocation(loc.name)}
                                            className={`px-4 py-2 rounded-xl whitespace-nowrap transition-colors border ${
                                                selectedLocationName === loc.name
                                                    ? 'bg-accent-primary border-accent-primary text-text-inverse shadow-md'
                                                    : 'bg-bg-card border-border-color text-text-muted hover:border-accent-primary/50'
                                            }`}
                                        >
                                            {loc.name}
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-text-muted italic px-1">
                                    {t('notifications.no_locations') || 'Geen favoriete locaties gevonden.'}
                                </p>
                            )}
                        </div>

                        <ScheduleConfig 
                            title={`Schema voor ${selectedLocationName}`}
                            schedule={currentProfile.messengerSchedule} // Reuse messenger schedule structure for push
                            onUpdate={(newSchedule) => updateSchedule(newSchedule)}
                            language={settings.language}
                        />
                        
                        <p className="text-xs text-text-muted px-1 mt-2">
                            {t('notifications.platform_note') || 'Je ontvangt meldingen op dit apparaat.'}
                        </p>
                    </>
                )}
            </div>
        )}

      </div>
    </div>
  );
};
