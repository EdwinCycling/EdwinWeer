importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

// Parse config from URL parameters
const urlParams = new URLSearchParams(self.location.search);
const config = {
  apiKey: urlParams.get('apiKey'),
  authDomain: urlParams.get('authDomain'),
  projectId: urlParams.get('projectId'),
  storageBucket: urlParams.get('storageBucket'),
  messagingSenderId: urlParams.get('messagingSenderId'),
  appId: urlParams.get('appId'),
  measurementId: urlParams.get('measurementId')
};

if (config.apiKey && config.projectId) {
  firebase.initializeApp(config);

  const messaging = firebase.messaging();

  messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] Received background message ', payload);
    const notificationTitle = payload.notification.title;
    const notificationOptions = {
      body: payload.notification.body,
      icon: '/icons/baro-icon-192.png'
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
  });
} else {
  console.warn('[firebase-messaging-sw.js] Missing config parameters in URL.');
}
