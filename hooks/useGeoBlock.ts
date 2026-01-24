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
        // Using api.country.is which is free and simple
        // Returns { "ip": "xx.xx.xx.xx", "country": "US" }
        const response = await fetch('https://api.country.is');
        
        if (!response.ok) {
           // If API fails, we fail open (allow access)
           setLoading(false);
           return;
        }

        const data: GeoData = await response.json();
        
        // Check if country is in the blocked list
        if (data && data.country && BLOCKED_COUNTRIES.includes(data.country)) {
          setIsBlocked(true);
          sessionStorage.setItem('geo_blocked', 'true');
        }
      } catch (error) {
        console.error('Geo check diagnostics failed:', error);
        // Fail open - do not block if we can't verify
      } finally {
        setLoading(false);
      }
    };

    checkLocation();
  }, []);

  return { isBlocked, loading };
};
