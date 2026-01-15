import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

function ReloadPrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      console.log('SW Registered: ' + r);
    },
    onRegisterError(error) {
      console.log('SW registration error', error);
    },
  });

  const close = () => {
    setNeedRefresh(false);
  };

  const handleUpdate = () => {
    console.log('Updating service worker and reloading...');
    updateServiceWorker(true);
    
    // Fallback: als de hook niet automatisch herlaadt binnen 2 seconden, doen we het handmatig
    setTimeout(() => {
      if (needRefresh) {
        console.log('Fallback reload triggered');
        window.location.reload();
      }
    }, 2000);
  };

  useEffect(() => {
    if (needRefresh) {
      console.log('PWA Update available!');
    }
  }, [needRefresh]);

  if (!needRefresh) return null;

  return (
    <div className="pwa-toast">
      <div className="pwa-message">
        🎉 Er is een nieuwe versie van Baro!
      </div>
      <div className="pwa-buttons">
        <button
          className="pwa-update-btn"
          onClick={handleUpdate}
        >
          Update Nu ↻
        </button>
        <button className="pwa-close-btn" onClick={close}>
          Later
        </button>
      </div>

      <style>{`
        .pwa-toast {
          position: fixed;
          right: 20px;
          bottom: 20px;
          margin: 16px;
          padding: 12px;
          border: 1px solid rgba(136, 136, 136, 0.3);
          border-radius: 8px;
          z-index: 9999;
          background-color: var(--bg-card, #fff);
          color: var(--text-main, #333);
          box-shadow: 0 4px 10px rgba(0,0,0,0.2);
          display: flex;
          flex-direction: column;
          gap: 10px;
          animation: slideUp 0.5s ease;
        }
        .pwa-buttons { display: flex; gap: 10px; }
        .pwa-update-btn {
            background: var(--accent-primary, #007bff);
            color: white;
            border: none;
            padding: 8px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-weight: bold;
        }
        .pwa-close-btn {
            background: transparent;
            border: 1px solid #ccc;
            padding: 8px 12px;
            border-radius: 4px;
            cursor: pointer;
            color: var(--text-main);
        }
        @keyframes slideUp {
            from { transform: translateY(100px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

export default ReloadPrompt;
