import { useState, useEffect } from 'react';
import { BLOCKED_COUNTRIES } from '../src/config/blockedCountries';

interface GeoData {
  country: string;
  ip: string;
}

export const useGeoBlock = () => {
  const [isBlocked, setIsBlocked] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const checkLocation = async () => {
      // Check if we already have a session verdict to avoid repeated API calls
      const sessionBlocked = sessionStorage.getItem('geo_blocked');
      if (sessionBlocked === 'true') {
        setIsBlocked(true);
        setLoading(false);
        return;
      }

      try {
        // Try primary service: ipapi.co (free tier, no key needed for basic usage)
        const response = await fetch('https://ipapi.co/json/');
        if (response.ok) {
            const data = await response.json();
            if (data && data.country_code && BLOCKED_COUNTRIES.includes(data.country_code)) {
                setIsBlocked(true);
                sessionStorage.setItem('geo_blocked', 'true');
            }
            return;
        }

        // Fallback: ip-api.com (non-SSL only on free tier, might be blocked by mixed content but worth a try if allowed)
        // Or better fallback: just fail open if primary fails
        // console.warn('Geo check primary service failed, failing open');
      } catch (error) {
        // Silently fail to avoid console noise for users with adblockers
        // console.warn('Geo check diagnostics failed (adblocker?):', error);
        // Fail open - do not block if we can't verify
      } finally {
        setLoading(false);
      }
    };

    checkLocation();
  }, []);

  return { isBlocked, loading };
};
