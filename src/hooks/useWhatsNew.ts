import { useState, useEffect } from 'react';
import { APP_UPDATES } from '../data/updates';

const STORAGE_KEY = 'whats_new_seen_version';

export const useWhatsNew = () => {
  const [hasUnreadUpdates, setHasUnreadUpdates] = useState(false);
  
  // Get latest version safely
  const latestVersion = APP_UPDATES.length > 0 ? APP_UPDATES[0].version : '0.0.0';

  useEffect(() => {
    try {
      const seenVersion = localStorage.getItem(STORAGE_KEY) || '0.0.0';
      if (compareVersions(latestVersion, seenVersion) > 0) {
        setHasUnreadUpdates(true);
      }
    } catch (error) {
      console.error('Error checking version:', error);
    }
  }, [latestVersion]);

  const markAsSeen = () => {
    try {
      localStorage.setItem(STORAGE_KEY, latestVersion);
      setHasUnreadUpdates(false);
    } catch (error) {
      console.error('Error saving seen version:', error);
    }
  };

  return {
    hasUnreadUpdates,
    markAsSeen,
    updates: APP_UPDATES,
    latestVersion
  };
};

function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);
  
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const n1 = parts1[i] || 0;
    const n2 = parts2[i] || 0;
    if (n1 > n2) return 1;
    if (n1 < n2) return -1;
  }
  return 0;
}
