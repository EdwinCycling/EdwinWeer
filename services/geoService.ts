import { Location } from "../types";
import { checkLimit, trackCall } from "./usageService";
import { throttledFetch } from "./weatherService";

export const searchCityByName = async (name: string, language: string = 'en'): Promise<Location[]> => {
  if (!name || name.trim().length < 2) return [];
  
  // checkLimit and trackCall are handled inside throttledFetch
  
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=5&language=${language}`;
  const data = await throttledFetch(url);
  
  const results = (data?.results || []) as any[];
  return results.map((r) => ({
    name: r.name,
    country: (r.country || r.country_code || "").toString().toUpperCase(),
    lat: r.latitude,
    lon: r.longitude,
  }));
};

export const reverseGeocode = async (lat: number, lon: number): Promise<string | null> => {
  try {
    checkLimit();
    trackCall();

    // limit precision to 4 decimal places to improve cache hit rate (if any) and privacy
    const latFixed = lat.toFixed(4);
    const lonFixed = lon.toFixed(4);
    
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latFixed}&lon=${lonFixed}&zoom=10`;
    
    // Add User-Agent as required by Nominatim usage policy
    const headers = {
      'User-Agent': 'BaroWeatherApp/1.0' 
    };

    const res = await fetch(url, { headers });
    if (!res.ok) return null;
    
    const data = await res.json();
    if (!data || !data.address) return null;
    
    // Try to find the most relevant name
    const result = data.address.city || 
           data.address.town || 
           data.address.village || 
           data.address.municipality || 
           data.address.suburb || 
           null;
    
    if (result) {
        return result;
    }
    return null;
  } catch (e) {
    console.error("Reverse geocoding failed", e);
    return null;
  }
};

export const reverseGeocodeFull = async (lat: number, lon: number): Promise<{ name: string, countryCode: string, countryName?: string } | null> => {
  try {
    checkLimit();
    trackCall();

    const latFixed = lat.toFixed(4);
    const lonFixed = lon.toFixed(4);
    
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latFixed}&lon=${lonFixed}&zoom=10`;
    const headers = { 'User-Agent': 'BaroWeatherApp/1.0' };

    const res = await fetch(url, { headers });
    if (!res.ok) return null;
    
    const data = await res.json();
    if (!data || !data.address) return null;
    
    const name = data.address.city || 
           data.address.town || 
           data.address.village || 
           data.address.municipality || 
           data.address.suburb || 
           null;
    
    const countryCode = data.address.country_code ? data.address.country_code.toUpperCase() : 'US';
    const countryName = data.address.country;

    if (name) {
        return { name, countryCode, countryName };
    }
    return null;
  } catch (e) {
    console.error("Reverse geocoding full failed", e);
    return null;
  }
};
