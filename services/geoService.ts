import { Location } from "../types";
import { checkLimit, trackCall } from "./usageService";

export const searchCityByName = async (name: string, language: string = 'en'): Promise<Location[]> => {
  if (!name || name.trim().length < 2) return [];
  
  checkLimit();
  trackCall();
  
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=5&language=${language}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Geocoding failed: ${res.status}`);
  const data = await res.json();
  const results = (data?.results || []) as any[];
  return results.map((r) => ({
    name: r.name,
    country: (r.country || r.country_code || "").toString().toUpperCase(),
    lat: r.latitude,
    lon: r.longitude,
  }));
};
