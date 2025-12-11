import { Location } from "../types";

export const searchCityByName = async (name: string): Promise<Location[]> => {
  if (!name || name.trim().length < 2) return [];
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=5&language=en`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Geocoding failed: ${res.status}`);
  const data = await res.json();
  const results = (data?.results || []) as any[];
  return results.map((r) => ({
    name: r.name,
    country: r.country || "",
    lat: r.latitude,
    lon: r.longitude,
  }));
};
