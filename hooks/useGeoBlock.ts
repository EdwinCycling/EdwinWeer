import { useState, useEffect } from 'react';

export const useGeoBlock = () => {
  const [isBlocked, setIsBlocked] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    // Geo-blocking is handled by Netlify Edge Functions / Redirects (netlify.toml)
    // Client-side check removed to avoid CORS and rate limit issues with ipapi.co
    setIsBlocked(false);
    setLoading(false);
  }, []);

  return { isBlocked, loading };
};
