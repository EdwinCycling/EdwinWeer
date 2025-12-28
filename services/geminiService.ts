import { Location, AIProfile } from "../types";
import { MAJOR_CITIES } from "./cityData";

const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

const haversineDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const bearingTo = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
  const brng = toDeg(Math.atan2(y, x));
  return (brng + 360) % 360;
};

const dirCenters: Record<string, number> = {
  N: 0,
  NO: 45,
  O: 90,
  ZO: 135,
  Z: 180,
  ZW: 225,
  W: 270,
  NW: 315,
};

const inTolerance = (angle: number, center: number, tol: number) => {
  const a = (angle + 360) % 360;
  const c = (center + 360) % 360;
  const diff = Math.min(Math.abs(a - c), 360 - Math.abs(a - c));
  return diff <= tol;
};

const resolveCountry = async (name: string): Promise<string> => {
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=en`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Geocoding failed: ${res.status}`);
    const data = await res.json();
    const first = data && data.results && data.results[0];
    return first?.country ?? "No data available";
  } catch {
    return "No data available";
  }
};

export const getLuckyCity = async (
  currentLocation: Location,
  direction?: string
): Promise<Location> => {
  const filtered = (() => {
    const dir = (direction || "").toUpperCase();
    if (!dir || typeof dirCenters[dir] === 'undefined') return MAJOR_CITIES;
    const center = dirCenters[dir];
    const tolerance = 12.5;
    return MAJOR_CITIES.filter((c) => {
      const b = bearingTo(currentLocation.lat, currentLocation.lon, c.lat, c.lon);
      return inTolerance(b, center, tolerance);
    });
  })();

  const ranked = filtered
    .map((c) => ({
      city: c,
      dist: haversineDistance(currentLocation.lat, currentLocation.lon, c.lat, c.lon),
    }))
    .sort((a, b) => a.dist - b.dist);

  const minStep = 150; // km
  const maxStep = 600; // km
  let pickEntry = ranked.find(r => r.dist >= minStep && r.dist <= maxStep) || ranked[0];
  if (!pickEntry) {
    pickEntry = { city: MAJOR_CITIES[Math.floor(Math.random() * MAJOR_CITIES.length)], dist: 0 };
  }
  const pick = pickEntry.city;
  const country = await resolveCountry(pick.name);
  return { name: pick.name, country, lat: pick.lat, lon: pick.lon };
};

export const getWeatherDescription = async (): Promise<string> => {
  return "No data available";
}

export const generateAIWeatherReport = async (weatherData: any, profile: AIProfile, userName?: string, language: string = 'nl'): Promise<string> => {
    try {
        // Prepare the payload, ensuring types are serializable/friendly for the backend
        const payload = {
            weatherData,
            profile: {
                ...profile,
                location: typeof profile.location === 'string' ? profile.location : (profile.location as any)?.name || "onbekend",
                activities: profile.activities
            },
            userName,
            language
        };

        // Try to call the Netlify function
        // We use a relative path which works if deployed or proxied.
        const url = '/.netlify/functions/ai-weather';

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-App-Source': 'EdwinWeerApp'
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`AI Service Error: ${response.status} Details: ${errorText.substring(0, 100)}`);
            }

            const data = await response.json();
            return data.text;
        } catch (error: any) {
            console.error("Failed to generate AI report:", error);
            
            // Helpful error for localhost development
            if (window.location.hostname === 'localhost' && 
               (error.message?.includes("Failed to fetch") || error.message?.includes("Connection refused"))) {
                throw new Error("Lokale server error: De AI service is niet bereikbaar. Draait 'netlify dev'?");
            }
            
            throw error;
        }

    } catch (error) {
        console.error("Failed to generate AI report:", error);
        throw error;
    }
};
