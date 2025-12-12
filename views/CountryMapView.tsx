import React, { useState, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, ZoomControl } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { AppSettings, ViewState, Location } from '../types';
import { Icon } from '../components/Icon';
import L from 'leaflet';
import { getTranslation } from '../services/translations';
import { searchCityByName } from '../services/geoService';
import { convertTemp, convertWind, convertPrecip, convertPressure } from '../services/weatherService';
import { loadCurrentLocation } from '../services/storageService';

// @ts-ignore
import icon from 'leaflet/dist/images/marker-icon.png';
// @ts-ignore
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

interface CountryMapViewProps {
    onNavigate: (view: ViewState) => void;
    settings: AppSettings;
}

interface WeatherStation {
    lat: number;
    lon: number;
    temp: number;
    minTemp?: number;
    maxTemp?: number;
    feelsLike: number;
    windSpeed: number;
    windDirection: number;
    humidity: number;
    pressure: number;
    clouds: number;
    precip: number;
    gusts: number;
    dewPoint: number;
    name: string;
    isGrid?: boolean;
}

// Generate grid points for better coverage
const generateGridPoints = (centerLat: number, centerLon: number, zoom: number, bounds?: [number, number, number, number]): {lat: number, lon: number, name: string, isGrid: boolean}[] => {
    const points: {lat: number, lon: number, name: string, isGrid: boolean}[] = [];
    const step = Math.max(0.5, 8 / Math.pow(2, zoom - 4)); 
    const rangeLat = 15 / Math.pow(1.5, zoom - 4);
    const rangeLon = 25 / Math.pow(1.5, zoom - 4);

    for (let lat = centerLat - rangeLat; lat <= centerLat + rangeLat; lat += step) {
        for (let lon = centerLon - rangeLon; lon <= centerLon + rangeLon; lon += step) {
            if (lat > -85 && lat < 85) {
                points.push({
                    lat: Number(lat.toFixed(2)),
                    lon: Number(lon.toFixed(2)),
                    name: `Locatie (${lat.toFixed(1)}, ${lon.toFixed(1)})`,
                    isGrid: true
                });
            }
        }
    }
    return points.slice(0, 60);
};

const TEMP_STOPS = [
    { val: -15, r: 79, g: 70, b: 229 },  // Deep Purple/Indigo
    { val: -5,  r: 59, g: 130, b: 246 }, // Blue
    { val: 5,   r: 6, g: 182, b: 212 },  // Cyan/Light Blue
    { val: 15,  r: 34, g: 197, b: 94 },  // Green
    { val: 22,  r: 250, g: 204, b: 21 }, // Yellow
    { val: 28,  r: 249, g: 115, b: 22 }, // Orange
    { val: 35,  r: 239, g: 68, b: 68 },  // Red
    { val: 40,  r: 153, g: 27, b: 27 }   // Dark Red
];

// Beaufort scale based colors for wind (km/h)
const WIND_STOPS = [
    { val: 0, r: 255, g: 255, b: 255 },    // 0 Bft - White
    { val: 5, r: 224, g: 242, b: 254 },    // 1 Bft - Very Light Blue
    { val: 11, r: 186, g: 230, b: 253 },   // 2 Bft - Light Blue
    { val: 19, r: 125, g: 211, b: 252 },   // 3 Bft - Sky Blue
    { val: 28, r: 52, g: 211, b: 153 },    // 4 Bft - Green
    { val: 38, r: 163, g: 230, b: 53 },    // 5 Bft - Lime Green
    { val: 49, r: 250, g: 204, b: 21 },    // 6 Bft - Yellow
    { val: 61, r: 251, g: 146, b: 60 },    // 7 Bft - Orange
    { val: 74, r: 239, g: 68, b: 68 },     // 8 Bft - Red
    { val: 88, r: 185, g: 28, b: 28 },     // 9 Bft - Dark Red
    { val: 102, r: 126, g: 34, b: 206 },   // 10 Bft - Purple
    { val: 117, r: 88, g: 28, b: 135 }     // 11+ Bft - Deep Purple
];

type MapLayer = 'temp' | 'min_temp' | 'max_temp' | 'feels_like' | 'wind' | 'humidity' | 'pressure' | 'clouds' | 'precip' | 'gusts' | 'dew_point';

const interpolateColor = (val: number, stops: {val: number, r: number, g: number, b: number}[]) => {
    for (let i = 0; i < stops.length - 1; i++) {
        const start = stops[i];
        const end = stops[i + 1];
        if (val >= start.val && val <= end.val) {
            const t = (val - start.val) / (end.val - start.val);
            return {
                r: Math.round(start.r + t * (end.r - start.r)),
                g: Math.round(start.g + t * (end.g - start.g)),
                b: Math.round(start.b + t * (end.b - start.b))
            };
        }
    }
    if (val < stops[0].val) return { r: stops[0].r, g: stops[0].g, b: stops[0].b };
    if (val > stops[stops.length - 1].val) return { r: stops[stops.length - 1].r, g: stops[stops.length - 1].g, b: stops[stops.length - 1].b };
    return { r: 128, g: 128, b: 128 };
};

// Heatmap Layer Component
const HeatmapLayer = ({ data, layer, settings }: { data: WeatherStation[], layer: MapLayer, settings: AppSettings }) => {
    const map = useMap();
    const canvasRef = React.useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const draw = () => {
            const size = map.getSize();
            canvas.width = size.x;
            canvas.height = size.y;
            ctx.clearRect(0, 0, size.x, size.y);

            if (data.length === 0) return;

            ctx.globalCompositeOperation = 'source-over';

            data.forEach(station => {
                const point = map.latLngToContainerPoint([station.lat, station.lon]);
                // Extend bounds check slightly to avoid clipping edges
                if (point.x < -150 || point.x > size.x + 150 || point.y < -150 || point.y > size.y + 150) return;

                let val = 0;
                let r=128, g=128, b=128;

                switch (layer) {
                    case 'wind':
                    case 'gusts':
                        val = layer === 'wind' ? station.windSpeed : station.gusts;
                        const windColor = interpolateColor(val, WIND_STOPS);
                        r = windColor.r;
                        g = windColor.g;
                        b = windColor.b;
                        break;
                    case 'humidity':
                        val = station.humidity;
                        r = 200 - (val * 2);
                        g = 200 - (val * 2);
                        b = 255;
                        break;
                    case 'clouds':
                        val = station.clouds;
                        const gray = 255 - (val * 1.5); 
                        r = gray; g = gray; b = gray;
                        break;
                    case 'precip':
                        val = station.precip;
                        if (val === 0) { r=255; g=255; b=255; } 
                        else {
                            const rainInt = Math.min(1, val / 10);
                            r = 200 - rainInt * 200;
                            g = 200 - rainInt * 200;
                            b = 255;
                        }
                        break;
                    case 'pressure':
                        val = station.pressure;
                        const pNorm = Math.max(0, Math.min(1, (val - 980) / 60));
                        r = pNorm * 255;
                        g = 50;
                        b = (1 - pNorm) * 255;
                        break;
                    default: 
                        val = layer === 'feels_like' ? station.feelsLike : (layer === 'dew_point' ? station.dewPoint : station.temp);
                        if (val < 0) { r=79; g=70; b=229; } 
                        else if (val < 10) { r=59; g=130; b=246; } 
                        else if (val < 20) { r=34; g=197; b=94; } 
                        else if (val < 30) { r=234; g=179; b=8; } 
                        else { r=239; g=68; b=68; } 
                }

                const radius = 100; 
                const grd = ctx.createRadialGradient(point.x, point.y, 10, point.x, point.y, radius);
                grd.addColorStop(0, `rgba(${r},${g},${b},0.8)`);
                grd.addColorStop(0.5, `rgba(${r},${g},${b},0.4)`);
                grd.addColorStop(1, `rgba(${r},${g},${b},0)`);

                ctx.fillStyle = grd;
                ctx.beginPath();
                ctx.arc(point.x, point.y, radius, 0, 2 * Math.PI);
                ctx.fill();
            });
        };

        draw();
        map.on('moveend zoomend move', draw); // Add 'move' for smoother updates
        return () => {
            map.off('moveend zoomend move', draw);
        };
    }, [map, data, layer]);

    return <div className="leaflet-layer" style={{ pointerEvents: 'none', zIndex: 200, opacity: 0.7 }}>
        <canvas ref={canvasRef} className="leaflet-zoom-animated" style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%' }} />
    </div>;
};

// Control to reset map view
const ResetViewControl = ({ center, zoom }: { center: [number, number], zoom: number }) => {
    const map = useMap();
    return (
        <div className="leaflet-bottom leaflet-right" style={{ marginBottom: '80px', marginRight: '10px', pointerEvents: 'auto', zIndex: 1000 }}>
             <div className="leaflet-control leaflet-bar">
                <a 
                    role="button" 
                    title="Herstel weergave" 
                    href="#" 
                    onClick={(e) => { e.preventDefault(); map.setView(center, zoom, { animate: true }); }}
                    className="flex items-center justify-center bg-white dark:bg-slate-800 text-slate-700 dark:text-white hover:bg-slate-50 w-[30px] h-[30px] cursor-pointer"
                    style={{ width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                    <Icon name="refresh" className="text-lg" />
                </a>
            </div>
        </div>
    );
};

// Helper to center map on country change
function MapUpdater({ center, zoom }: { center: [number, number], zoom: number }) {
    const map = useMap();
    useEffect(() => {
        map.setView(center, zoom);
    }, [center, zoom, map]);
    return null;
}

// Rough country coordinates and cities
const COUNTRY_CONFIG: Record<string, { lat: number, lon: number, zoom: number, cities: Array<{name: string, lat: number, lon: number}> }> = {
    'NL': { 
        lat: 52.1326, lon: 5.2913, zoom: 7,
        cities: [
            { name: 'Amsterdam', lat: 52.3676, lon: 4.9041 },
            { name: 'Rotterdam', lat: 51.9244, lon: 4.4777 },
            { name: 'Utrecht', lat: 52.0907, lon: 5.1214 },
            { name: 'Groningen', lat: 53.2194, lon: 6.5665 },
            { name: 'Maastricht', lat: 50.8514, lon: 5.6910 },
            { name: 'Vlissingen', lat: 51.4537, lon: 3.5719 },
            { name: 'Den Helder', lat: 52.9599, lon: 4.7520 },
            { name: 'Enschede', lat: 52.2215, lon: 6.8937 },
            { name: 'Arnhem', lat: 51.9851, lon: 5.8987 },
            { name: 'Leeuwarden', lat: 53.2012, lon: 5.7999 },
            { name: 'Zwolle', lat: 52.5168, lon: 6.0830 },
            { name: 'Eindhoven', lat: 51.4416, lon: 5.4697 }
        ]
    },
    'BE': { 
        lat: 50.5039, lon: 4.4699, zoom: 8,
        cities: [
            { name: 'Brussels', lat: 50.8503, lon: 4.3517 },
            { name: 'Antwerp', lat: 51.2194, lon: 4.4025 },
            { name: 'Ghent', lat: 51.0543, lon: 3.7174 },
            { name: 'Liege', lat: 50.6326, lon: 5.5797 },
            { name: 'Charleroi', lat: 50.4101, lon: 4.4446 },
            { name: 'Brugge', lat: 51.2093, lon: 3.2247 },
            { name: 'Namur', lat: 50.4674, lon: 4.8720 },
            { name: 'Ostend', lat: 51.2154, lon: 2.9287 },
            { name: 'Hasselt', lat: 50.9307, lon: 5.3325 },
            { name: 'Arlon', lat: 49.6833, lon: 5.8167 }
        ]
    },
    'DE': {
        lat: 51.1657, lon: 10.4515, zoom: 6,
        cities: [
            { name: 'Berlin', lat: 52.5200, lon: 13.4050 },
            { name: 'Munich', lat: 48.1351, lon: 11.5820 },
            { name: 'Hamburg', lat: 53.5511, lon: 9.9937 },
            { name: 'Cologne', lat: 50.9375, lon: 6.9603 },
            { name: 'Frankfurt', lat: 50.1109, lon: 8.6821 },
            { name: 'Stuttgart', lat: 48.7758, lon: 9.1829 },
            { name: 'Dusseldorf', lat: 51.2277, lon: 6.7735 },
            { name: 'Leipzig', lat: 51.3397, lon: 12.3731 },
            { name: 'Dortmund', lat: 51.5136, lon: 7.4653 },
            { name: 'Essen', lat: 51.4556, lon: 7.0116 }
        ]
    },
    'FR': {
        lat: 46.2276, lon: 2.2137, zoom: 6,
        cities: [
            { name: 'Paris', lat: 48.8566, lon: 2.3522 },
            { name: 'Marseille', lat: 43.2965, lon: 5.3698 },
            { name: 'Lyon', lat: 45.7640, lon: 4.8357 },
            { name: 'Toulouse', lat: 43.6045, lon: 1.4442 },
            { name: 'Nice', lat: 43.7102, lon: 7.2620 },
            { name: 'Nantes', lat: 47.2184, lon: -1.5536 },
            { name: 'Strasbourg', lat: 48.5734, lon: 7.7521 },
            { name: 'Montpellier', lat: 43.6108, lon: 3.8767 },
            { name: 'Bordeaux', lat: 44.8378, lon: -0.5792 },
            { name: 'Lille', lat: 50.6292, lon: 3.0573 }
        ]
    },
    'US': {
        lat: 39.8283, lon: -98.5795, zoom: 4,
        cities: [
            { name: 'New York', lat: 40.7128, lon: -74.0060 },
            { name: 'Los Angeles', lat: 34.0522, lon: -118.2437 },
            { name: 'Chicago', lat: 41.8781, lon: -87.6298 },
            { name: 'Houston', lat: 29.7604, lon: -95.3698 },
            { name: 'Phoenix', lat: 33.4484, lon: -112.0740 },
            { name: 'Philadelphia', lat: 39.9526, lon: -75.1652 },
            { name: 'San Antonio', lat: 29.4241, lon: -98.4936 },
            { name: 'San Diego', lat: 32.7157, lon: -117.1611 },
            { name: 'Dallas', lat: 32.7767, lon: -96.7970 },
            { name: 'San Jose', lat: 37.3382, lon: -121.8863 },
            { name: 'Austin', lat: 30.2672, lon: -97.7431 },
            { name: 'Jacksonville', lat: 30.3322, lon: -81.6557 },
            { name: 'Fort Worth', lat: 32.7555, lon: -97.3308 },
            { name: 'Columbus', lat: 39.9612, lon: -82.9988 },
            { name: 'San Francisco', lat: 37.7749, lon: -122.4194 },
            { name: 'Charlotte', lat: 35.2271, lon: -80.8431 },
            { name: 'Indianapolis', lat: 39.7684, lon: -86.1581 },
            { name: 'Seattle', lat: 47.6062, lon: -122.3321 },
            { name: 'Denver', lat: 39.7392, lon: -104.9903 },
            { name: 'Washington', lat: 38.9072, lon: -77.0369 },
            { name: 'Boston', lat: 42.3601, lon: -71.0589 },
            { name: 'Nashville', lat: 36.1627, lon: -86.7816 },
            { name: 'Detroit', lat: 42.3314, lon: -83.0458 },
            { name: 'Oklahoma City', lat: 35.4676, lon: -97.5164 },
            { name: 'Portland', lat: 45.5152, lon: -122.6784 },
            { name: 'Las Vegas', lat: 36.1699, lon: -115.1398 },
            { name: 'Memphis', lat: 35.1495, lon: -90.0490 },
            { name: 'Louisville', lat: 38.2527, lon: -85.7585 },
            { name: 'Baltimore', lat: 39.2904, lon: -76.6122 },
            { name: 'Milwaukee', lat: 43.0389, lon: -87.9065 },
            { name: 'Albuquerque', lat: 35.0844, lon: -106.6504 },
            { name: 'Tucson', lat: 32.2226, lon: -110.9747 },
            { name: 'Fresno', lat: 36.7378, lon: -119.7871 },
            { name: 'Mesa', lat: 33.4152, lon: -111.8315 },
            { name: 'Sacramento', lat: 38.5816, lon: -121.4944 },
            { name: 'Atlanta', lat: 33.7490, lon: -84.3880 },
            { name: 'Kansas City', lat: 39.0997, lon: -94.5786 },
            { name: 'Colorado Springs', lat: 38.8339, lon: -104.8214 },
            { name: 'Miami', lat: 25.7617, lon: -80.1918 },
            { name: 'Raleigh', lat: 35.7796, lon: -78.6382 }
        ]
    }
};

// Helper to get flag emoji
function getFlagEmoji(countryCode: string) {
    if (!countryCode || countryCode === '??') return '🏳️';
    try {
        const codePoints = countryCode
          .toUpperCase()
          .split('')
          .map(char =>  127397 + char.charCodeAt(0));
        return String.fromCodePoint(...codePoints);
    } catch (e) {
        return '🏳️';
    }
}

const COUNTRY_MAPPING: Record<string, { name: string, code: string }> = {
    'NL': { name: 'Nederland', code: 'NL' },
    'NEDERLAND': { name: 'Nederland', code: 'NL' },
    'THE NETHERLANDS': { name: 'Nederland', code: 'NL' },
    'BE': { name: 'België', code: 'BE' },
    'BELGIE': { name: 'België', code: 'BE' },
    'BELGIUM': { name: 'België', code: 'BE' },
    'DE': { name: 'Duitsland', code: 'DE' },
    'GERMANY': { name: 'Duitsland', code: 'DE' },
    'DEUTSCHLAND': { name: 'Duitsland', code: 'DE' },
    'FR': { name: 'Frankrijk', code: 'FR' },
    'FRANCE': { name: 'Frankrijk', code: 'FR' },
    'UK': { name: 'Verenigd Koninkrijk', code: 'UK' },
    'UNITED KINGDOM': { name: 'Verenigd Koninkrijk', code: 'UK' },
    'GREAT BRITAIN': { name: 'Verenigd Koninkrijk', code: 'UK' },
    'US': { name: 'Verenigde Staten', code: 'US' },
    'USA': { name: 'Verenigde Staten', code: 'US' },
    'JP': { name: 'Japan', code: 'JP' },
    'JAPAN': { name: 'Japan', code: 'JP' },
    'ES': { name: 'Spanje', code: 'ES' },
    'SPAIN': { name: 'Spanje', code: 'ES' },
    'IT': { name: 'Italië', code: 'IT' },
    'ITALY': { name: 'Italië', code: 'IT' },
    'CH': { name: 'Zwitserland', code: 'CH' },
    'SWITZERLAND': { name: 'Zwitserland', code: 'CH' },
    'AT': { name: 'Oostenrijk', code: 'AT' },
    'AUSTRIA': { name: 'Oostenrijk', code: 'AT' },
    'DK': { name: 'Denemarken', code: 'DK' },
    'DENMARK': { name: 'Denemarken', code: 'DK' },
    'SE': { name: 'Zweden', code: 'SE' },
    'SWEDEN': { name: 'Zweden', code: 'SE' },
    'NO': { name: 'Noorwegen', code: 'NO' },
    'NORWAY': { name: 'Noorwegen', code: 'NO' },
};

function normalizeCountry(input: string): { name: string, code: string } {
    if (!input) return { name: 'Onbekend', code: '??' };
    const upper = input.trim().toUpperCase();
    if (COUNTRY_MAPPING[upper]) {
        return COUNTRY_MAPPING[upper];
    }
    // Fallback: use input as name if long, assume code if short
    if (upper.length === 2) {
        return { name: upper, code: upper };
    }
    return { name: input, code: input.substring(0, 2).toUpperCase() };
}

export const CountryMapView: React.FC<CountryMapViewProps> = ({ onNavigate, settings }) => {
    const [selectedCountry, setSelectedCountry] = useState<{name: string, code: string} | null>(null);
    const [selectedLocationName, setSelectedLocationName] = useState<string | null>(null);
    const [weatherData, setWeatherData] = useState<WeatherStation[]>([]);
    const [layer, setLayer] = useState<MapLayer>('temp');
    const [viewMode, setViewMode] = useState<'points' | 'surface'>('points');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedDate, setSelectedDate] = useState<Date>(new Date());
    const [showGridPoints, setShowGridPoints] = useState(true);
    
    // Search state
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<Location[]>([]);
    const [searching, setSearching] = useState(false);
    const [showDropdown, setShowDropdown] = useState(false);

    // Auto-select current location on mount
    useEffect(() => {
        const loc = loadCurrentLocation();
        if (loc && loc.country) {
            const norm = normalizeCountry(loc.country);
            handleCountrySelect(norm, loc);
        }
    }, []);

    // Extract unique countries from favorites
    const availableCountries = useMemo(() => {
        const unique = new Map<string, {name: string, code: string}>();
        
        const add = (c: string) => {
             const norm = normalizeCountry(c);
             if (!unique.has(norm.code)) {
                 unique.set(norm.code, norm);
             }
        };

        // Add ONLY favorites
        settings.favorites.forEach(f => add(f.country));

        return Array.from(unique.values()).sort((a, b) => a.name.localeCompare(b.name));
    }, [settings.favorites]);

    // Handle country selection
    const handleCountrySelect = (country: {name: string, code: string}, location?: Location) => {
        setSelectedCountry(country);
        setSelectedLocationName(location?.name || null);
        // Reset search
        setSearchQuery('');
        setSearchResults([]);
        setShowDropdown(false);
        
        // Always reset date to today on new country
        const now = new Date();
        setSelectedDate(now);
        fetchWeather(country, location, now);
    };

    const handleSearch = async (query: string) => {
        setSearchQuery(query);
        if (query.length < 2) {
            setSearchResults([]);
            setShowDropdown(false);
            return;
        }

        setSearching(true);
        try {
            const results = await searchCityByName(query, settings.language);
            setSearchResults(results);
            setShowDropdown(true);
        } catch (e) {
            // silent fail
        } finally {
            setSearching(false);
        }
    };

    const handleDateChange = (days: number) => {
        const newDate = new Date(selectedDate);
        newDate.setDate(newDate.getDate() + days);
        setSelectedDate(newDate);
        if (selectedCountry) {
            fetchWeather(selectedCountry, undefined, newDate);
        }
    };

    const fetchWeather = async (country: {name: string, code: string}, specificLocation?: Location, date: Date = new Date()) => {
        setLoading(true);
        setError(null);
        setWeatherData([]); // Clear previous data
        
        const config = COUNTRY_CONFIG[country.code];
        
        // Start with defined cities
        let cities = config?.cities ? [...config.cities] : [];
        
        // Add favorites for this country
        const favs = settings.favorites.filter(f => normalizeCountry(f.country).code === country.code);
        if (favs.length > 0) {
            favs.forEach(f => {
                // Avoid duplicates
                if (!cities.find(c => Math.abs(c.lat - f.lat) < 0.1 && Math.abs(c.lon - f.lon) < 0.1)) {
                    cities.push({ name: f.name, lat: f.lat, lon: f.lon });
                }
            });
        }

        // If specific location, ensure it's included
        if (specificLocation) {
             if (!cities.find(c => Math.abs(c.lat - specificLocation.lat) < 0.1 && Math.abs(c.lon - specificLocation.lon) < 0.1)) {
                 cities.push({
                     name: specificLocation.name,
                     lat: specificLocation.lat,
                     lon: specificLocation.lon
                 });
             }
        }

        // DYNAMIC POINTS: If few cities, generate grid
        const centerLat = config?.lat ?? (specificLocation?.lat || cities[0]?.lat || 50);
        const centerLon = config?.lon ?? (specificLocation?.lon || cities[0]?.lon || 10);
        const zoom = config?.zoom ?? 6;

        if (cities.length < 30) {
            const grid = generateGridPoints(centerLat, centerLon, zoom);
            cities = [...cities, ...grid];
        }

        if (cities.length === 0) {
             setError(`Geen weerstations gevonden voor ${country.name}. Voeg eerst een favoriete plaats toe in dit land of zoek specifiek naar een plaats.`);
             setLoading(false);
             return;
        }

        // Limit to 80 points to be safe
        cities = cities.slice(0, 80);

        const lats = cities.map(c => c.lat).join(',');
        const lons = cities.map(c => c.lon).join(',');
        
        const isToday = date.toDateString() === new Date().toDateString();
        const dateStr = date.toISOString().split('T')[0];
        
        // Decide API endpoint
        // Archive is for > 5 days ago usually, but Forecast API handles recent past/future
        // We'll use Forecast API for now as it's simpler, unless date is far back
        const baseUrl = 'https://api.open-meteo.com/v1/forecast';
        
        // Use OpenMeteo API with Expanded Data
        // Always fetch hourly for the date range to pick noon value if not current
        let url = `${baseUrl}?latitude=${lats}&longitude=${lons}&start_date=${dateStr}&end_date=${dateStr}&hourly=temperature_2m,apparent_temperature,wind_speed_10m,wind_direction_10m,relative_humidity_2m,surface_pressure,cloud_cover,precipitation,wind_gusts_10m,dew_point_2m&daily=temperature_2m_max,temperature_2m_min&timezone=auto`;
        
        if (isToday) {
            url += `&current=temperature_2m,apparent_temperature,wind_speed_10m,wind_direction_10m,relative_humidity_2m,surface_pressure,cloud_cover,precipitation,wind_gusts_10m,dew_point_2m`;
        }
        
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error('Network response was not ok');
            const data = await res.json();
            
            const results = Array.isArray(data) ? data : [data];
            const stations: WeatherStation[] = [];
            
            results.forEach((d: any, i: number) => {
                // Helper to get value: Current (if today) or Hourly Noon (index 12)
                const getVal = (field: string) => {
                    if (isToday && d.current && d.current[field] != null) return d.current[field];
                    if (d.hourly && d.hourly[field]) return d.hourly[field][12] ?? d.hourly[field][0];
                    return 0;
                };

                stations.push({
                    lat: cities[i].lat,
                    lon: cities[i].lon,
                    name: cities[i].name,
                    // @ts-ignore
                    isGrid: cities[i].isGrid,
                    temp: getVal('temperature_2m'),
                    feelsLike: getVal('apparent_temperature'),
                    windSpeed: getVal('wind_speed_10m'),
                    windDirection: getVal('wind_direction_10m'),
                    humidity: getVal('relative_humidity_2m'),
                    pressure: getVal('surface_pressure'),
                    clouds: getVal('cloud_cover'),
                    precip: getVal('precipitation'),
                    gusts: getVal('wind_gusts_10m'),
                    dewPoint: getVal('dew_point_2m'),
                    minTemp: d.daily?.temperature_2m_min?.[0],
                    maxTemp: d.daily?.temperature_2m_max?.[0]
                });
            });
            setWeatherData(stations);
        } catch (e) {
            setError("Kan weerdata niet ophalen. Controleer je internetverbinding.");
        } finally {
            setLoading(false);
        }
    };

    const mapConfig = selectedCountry && COUNTRY_CONFIG[selectedCountry.code] 
        ? COUNTRY_CONFIG[selectedCountry.code] 
        : { lat: 50.0, lon: 10.0, zoom: 4 };

    // Update map config if country selected but not in config (use first city/station)
    if (selectedCountry && !COUNTRY_CONFIG[selectedCountry.code] && weatherData.length > 0) {
        mapConfig.lat = weatherData[0].lat;
        mapConfig.lon = weatherData[0].lon;
        mapConfig.zoom = 7;
    }

    if (!selectedCountry) {
        return (
            <div className="flex flex-col min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-white">
                {/* Header */}
                <div className="flex items-center p-4 pt-8 sticky top-0 bg-white/95 dark:bg-[#101d22]/95 backdrop-blur z-20 border-b border-slate-200 dark:border-white/5 transition-colors">
                    <button onClick={() => onNavigate(ViewState.CURRENT)} className="size-10 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-white/10 mr-2">
                        <Icon name="arrow_back_ios_new" />
                    </button>
                    <h1 className="text-lg font-bold">Kies een land</h1>
                </div>

                <div className="p-4 w-full max-w-lg mx-auto space-y-6">
                    {/* Search Section */}
                    <div className="relative z-50">
                        <div className="flex items-center gap-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 shadow-sm focus-within:ring-2 focus-within:ring-blue-500">
                            <Icon name="search" className="text-slate-400 w-5 h-5" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => handleSearch(e.target.value)}
                                placeholder="Zoek een ander land..."
                                className="flex-1 bg-transparent outline-none placeholder:text-slate-400"
                            />
                            {searching && <div className="animate-spin w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full" />}
                        </div>

                        {/* Search Dropdown */}
                        {showDropdown && searchResults.length > 0 && (
                            <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-100 dark:border-slate-700 overflow-hidden max-h-60 overflow-y-auto">
                                {searchResults.map((result, idx) => {
                                    const norm = normalizeCountry(result.country);
                                    return (
                                        <button
                                            key={`${result.name}-${idx}`}
                                            onClick={() => handleCountrySelect(norm, result)}
                                            className="w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center justify-between border-b border-slate-100 dark:border-slate-700/50 last:border-0"
                                        >
                                            <div>
                                                <div className="font-medium">{result.country}</div>
                                                <div className="text-xs text-slate-500">{result.name}</div>
                                            </div>
                                            <span className="text-2xl">{getFlagEmoji(norm.code)}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Favorites List */}
                    <div>
                        <h2 className="text-xs font-bold uppercase text-slate-500 mb-3 tracking-wider">Uit mijn favorieten</h2>
                        <div className="space-y-3">
                            {availableCountries.length === 0 ? (
                                <p className="text-slate-400 text-sm italic">Geen landen gevonden in favorieten.</p>
                            ) : (
                                availableCountries.map(country => (
                                    <button
                                        key={country.code}
                                        onClick={() => handleCountrySelect(country)}
                                        className="w-full p-4 flex items-center justify-between bg-white dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-slate-700 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm transition-all group"
                                    >
                                        <span className="text-lg font-medium flex items-center gap-3">
                                            <span className="text-2xl shadow-sm rounded-sm">{getFlagEmoji(country.code)}</span> 
                                            <span className="group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{country.name}</span>
                                        </span>
                                        <Icon name="chevron_right" className="w-5 h-5 opacity-30 group-hover:opacity-100 transition-opacity" />
                                    </button>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    const isToday = selectedDate.toDateString() === new Date().toDateString();
    const isFuture = selectedDate > new Date();

    return (
        <div className="flex flex-col h-screen w-full fixed inset-0 z-[10] bg-slate-200 dark:bg-slate-900">
             <style>{`
                .custom-popup .leaflet-popup-content-wrapper,
                .custom-popup .leaflet-popup-tip {
                    background-color: white;
                    color: #1e293b;
                }
                .dark .custom-popup .leaflet-popup-content-wrapper,
                .dark .custom-popup .leaflet-popup-tip {
                    background-color: #1e293b;
                    color: white;
                }
                .leaflet-container {
                    background: #cbd5e1;
                }
                .dark .leaflet-container {
                    background: #0f172a;
                }
            `}</style>

            {/* Header */}
            <div className="absolute top-0 left-0 right-0 z-[1000] p-4 pointer-events-none">
                <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-md shadow-lg rounded-2xl p-4 pointer-events-auto flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <button onClick={() => {
                                setSelectedCountry(null);
                                setSearchQuery('');
                                setSearchResults([]);
                                setShowDropdown(false);
                            }} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full">
                                <Icon name="arrow_back" className="w-5 h-5" />
                            </button>
                            <div>
                                <h2 className="font-bold text-lg leading-tight flex items-center gap-2">
                                    {selectedCountry.name}
                                    {selectedLocationName && <span className="text-sm font-normal text-slate-500 dark:text-slate-400">({selectedLocationName})</span>}
                                </h2>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                    {isToday ? 'Actueel' : (isFuture ? 'Voorspelling' : 'Historie')} - {selectedDate.toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'long' })}
                                </p>
                            </div>
                        </div>
                        
                        {/* Date Controls */}
                        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
                             <button onClick={() => handleDateChange(-1)} className="p-1 hover:bg-white dark:hover:bg-slate-700 rounded-md">
                                 <Icon name="chevron_left" className="w-4 h-4" />
                             </button>
                             <button onClick={() => setSelectedDate(new Date())} className="text-xs font-bold px-2 hover:text-blue-500">
                                 Vandaag
                             </button>
                             <button onClick={() => handleDateChange(1)} className="p-1 hover:bg-white dark:hover:bg-slate-700 rounded-md">
                                 <Icon name="chevron_right" className="w-4 h-4" />
                             </button>
                        </div>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                        {/* View Mode Toggles */}
                        <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
                            <button 
                                onClick={() => setViewMode('points')}
                                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${viewMode === 'points' ? 'bg-white dark:bg-slate-700 shadow-sm' : 'opacity-60 hover:opacity-100'}`}
                            >
                                Punten
                            </button>
                            <button 
                                onClick={() => setViewMode('surface')}
                                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${viewMode === 'surface' ? 'bg-white dark:bg-slate-700 shadow-sm' : 'opacity-60 hover:opacity-100'}`}
                            >
                                Vlak
                            </button>
                        </div>
                        
                         {/* Grid Toggle */}
                         <button 
                            onClick={() => setShowGridPoints(!showGridPoints)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all flex items-center gap-2 ${showGridPoints ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300' : 'bg-transparent border-slate-200 dark:border-slate-700 text-slate-500'}`}
                        >
                            <Icon name="grid_on" className="w-4 h-4" />
                            {showGridPoints ? 'Raster Aan' : 'Raster Uit'}
                        </button>
                    </div>
                    
                    {/* Layer Toggles (Scrollable) */}
                    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-2 px-2">
                        {[
                            { id: 'temp', label: 'Temperatuur' },
                            { id: 'feels_like', label: 'Gevoel' },
                            { id: 'wind', label: 'Wind' },
                            { id: 'gusts', label: 'Windstoten' },
                            { id: 'precip', label: 'Neerslag' },
                            { id: 'humidity', label: 'Vochtigheid' },
                            { id: 'clouds', label: 'Bewolking' },
                            { id: 'pressure', label: 'Luchtdruk' },
                            { id: 'dew_point', label: 'Dauwpunt' },
                        ].map((item) => (
                            <button 
                                key={item.id}
                                onClick={() => setLayer(item.id as MapLayer)}
                                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all whitespace-nowrap ${layer === item.id ? 'bg-blue-500 text-white shadow-md' : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
                            >
                                {item.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Loading Overlay */}
            {loading && (
                <div className="absolute inset-0 z-[800] flex flex-col items-center justify-center bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm">
                    <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-xl flex flex-col items-center">
                        <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full mb-4" />
                        <div className="font-bold text-slate-800 dark:text-white">Weerdata ophalen...</div>
                        <div className="text-sm text-slate-500">Moment geduld a.u.b.</div>
                    </div>
                </div>
            )}

            {/* Error Message */}
            {error && (
                <div className="absolute inset-0 z-[900] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-6">
                    <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-2xl max-w-sm text-center">
                        <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Icon name="warning" className="w-6 h-6" />
                        </div>
                        <p className="font-medium text-slate-800 dark:text-white mb-2">{error}</p>
                        <button 
                            onClick={() => setSelectedCountry(null)}
                            className="text-primary font-bold hover:underline"
                        >
                            Terug naar overzicht
                        </button>
                    </div>
                </div>
            )}

            {/* Map */}
            <div className="flex-grow w-full h-full relative z-0">
                <MapContainer 
                    key={selectedCountry.code}
                    center={[mapConfig.lat, mapConfig.lon]} 
                    zoom={mapConfig.zoom} 
                    style={{ height: '100%', width: '100%' }}
                    zoomControl={false}
                >
                    <ZoomControl position="bottomright" />
                    <ResetViewControl center={[mapConfig.lat, mapConfig.lon]} zoom={mapConfig.zoom} />
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        url={settings.theme === 'dark' 
                            ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png' 
                            : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
                        }
                    />
                    <MapUpdater center={[mapConfig.lat, mapConfig.lon]} zoom={mapConfig.zoom} />
                    
                    {viewMode === 'surface' && <HeatmapLayer data={weatherData} layer={layer} settings={settings} />}

                    {/* Markers */}
                    {viewMode === 'points' && weatherData
                        .filter(station => showGridPoints || !station.isGrid)
                        .map((station, idx) => {
                        let displayVal = '';
                        let unit = '';
                        let color = '#3b82f6';
                        let rotate = 0;
                        let showRotate = false;

                        switch (layer) {
                            case 'wind':
                            case 'gusts':
                                const valWind = layer === 'wind' ? station.windSpeed : station.gusts;
                                displayVal = convertWind(valWind, settings.windUnit).toString();
                                unit = settings.windUnit === 'km/h' ? '' : settings.windUnit;
                                color = 'rgba(30, 41, 59, 0.9)';
                                rotate = station.windDirection;
                                showRotate = true;
                                break;
                            case 'humidity':
                                displayVal = station.humidity.toString();
                                unit = '%';
                                color = `rgb(${200 - station.humidity * 2}, ${200 - station.humidity * 2}, 255)`;
                                break;
                            case 'pressure':
                                displayVal = Math.round(station.pressure).toString();
                                unit = 'hPa';
                                color = '#64748b';
                                break;
                            case 'clouds':
                                displayVal = station.clouds.toString();
                                unit = '%';
                                const c = 200 - station.clouds;
                                color = `rgb(${c},${c},${c})`;
                                break;
                            case 'precip':
                                displayVal = convertPrecip(station.precip, settings.precipUnit).toString();
                                unit = settings.precipUnit;
                                color = station.precip > 0 ? '#3b82f6' : '#94a3b8';
                                break;
                            default: // Temp, Feels Like, Dew Point
                                const valTemp = layer === 'feels_like' ? station.feelsLike : (layer === 'dew_point' ? station.dewPoint : station.temp);
                                displayVal = convertTemp(valTemp, settings.tempUnit).toString();
                                unit = '°';
                                color = getTempColor(valTemp);
                        }
                        
                        return (
                            <Marker 
                                key={idx} 
                                position={[station.lat, station.lon]}
                                icon={L.divIcon({
                                    className: '',
                                    html: `
                                        <div style="
                                            background-color: ${color};
                                            color: white;
                                            padding: 4px 8px;
                                            border-radius: 12px;
                                            font-weight: bold;
                                            font-size: 12px;
                                            box-shadow: 0 2px 4px rgba(0,0,0,0.3);
                                            display: flex;
                                            align-items: center;
                                            justify-content: center;
                                            gap: 4px;
                                            white-space: nowrap;
                                            border: 2px solid white;
                                            min-width: 50px;
                                        ">
                                            ${showRotate 
                                                ? `<div style="transform: rotate(${rotate}deg); display: inline-block;">⬇</div> ${displayVal}`
                                                : `${displayVal}${unit}`
                                            }
                                        </div>
                                    `,
                                    iconSize: [40, 24],
                                    iconAnchor: [20, 12]
                                })}
                            >
                                <Popup className="custom-popup">
                                    <div className="text-center min-w-[150px]">
                                        <div className="font-bold text-lg mb-1">{station.name}</div>
                                        <div className="text-3xl font-bold mb-2">
                                            {displayVal} <span className="text-base font-normal">{unit}</span>
                                        </div>
                                        
                                        {/* Min/Max Daily (only show for temp related) */}
                                        {(['temp', 'feels_like', 'dew_point'].includes(layer) && station.minTemp !== undefined && station.maxTemp !== undefined) && (
                                            <div className="flex justify-center gap-4 text-sm bg-slate-100 dark:bg-slate-700 p-2 rounded-lg mb-2">
                                                <div>
                                                    <div className="text-slate-500 text-xs">Min</div>
                                                    <div className="font-bold">{convertTemp(station.minTemp, settings.tempUnit)}°</div>
                                                </div>
                                                <div>
                                                    <div className="text-slate-500 text-xs">Max</div>
                                                    <div className="font-bold">{convertTemp(station.maxTemp, settings.tempUnit)}°</div>
                                                </div>
                                            </div>
                                        )}

                                        <div className="grid grid-cols-2 gap-2 text-xs text-left bg-slate-50 dark:bg-slate-800 p-2 rounded">
                                            <div>Vocht: {station.humidity}%</div>
                                            <div>Druk: {Math.round(station.pressure)} hPa</div>
                                            <div>Wind: {convertWind(station.windSpeed, settings.windUnit)} {settings.windUnit}</div>
                                            <div>Neerslag: {convertPrecip(station.precip, settings.precipUnit)} {settings.precipUnit}</div>
                                        </div>
                                    </div>
                                </Popup>
                            </Marker>
                        );
                    })}
                </MapContainer>
            </div>
            
            {/* Legend */}
            <div className="absolute bottom-24 right-4 z-[500] bg-white/90 dark:bg-slate-900/90 backdrop-blur p-2 rounded-lg text-xs shadow-lg border border-slate-200 dark:border-white/10">
                <div className="font-bold mb-1">Legenda ({layer === 'temp' ? 'Temperatuur' : layer})</div>
                {(layer === 'wind' || layer === 'gusts') ? (
                    <div className="space-y-1">
                         <div className="flex items-center gap-2 mb-2"><span className="text-blue-500">⬇</span> Windrichting</div>
                         <div className="grid grid-cols-1 gap-1">
                            <div className="flex items-center gap-2"><div className="w-3 h-3 border border-slate-300 bg-[rgb(255,255,255)] rounded-full"></div> 0-10 km/u (1-2 Bft)</div>
                            <div className="flex items-center gap-2"><div className="w-3 h-3 bg-[rgb(125,211,252)] rounded-full"></div> 10-20 km/u (3 Bft)</div>
                            <div className="flex items-center gap-2"><div className="w-3 h-3 bg-[rgb(52,211,153)] rounded-full"></div> 20-30 km/u (4 Bft)</div>
                            <div className="flex items-center gap-2"><div className="w-3 h-3 bg-[rgb(163,230,53)] rounded-full"></div> 30-50 km/u (5-6 Bft)</div>
                            <div className="flex items-center gap-2"><div className="w-3 h-3 bg-[rgb(251,146,60)] rounded-full"></div> 50-75 km/u (7-8 Bft)</div>
                            <div className="flex items-center gap-2"><div className="w-3 h-3 bg-[rgb(239,68,68)] rounded-full"></div> &gt; 75 km/u (9+ Bft)</div>
                         </div>
                    </div>
                ) : (['temp', 'feels_like', 'dew_point'].includes(layer)) ? (
                    <div className="space-y-1">
                        <div className="flex items-center gap-2"><div className="w-3 h-3 bg-[#4f46e5] rounded-full"></div> Zeer koud (&lt;0{settings.tempUnit})</div>
                        <div className="flex items-center gap-2"><div className="w-3 h-3 bg-blue-500 rounded-full"></div> Koud (0-10{settings.tempUnit})</div>
                        <div className="flex items-center gap-2"><div className="w-3 h-3 bg-green-500 rounded-full"></div> Matig (10-20{settings.tempUnit})</div>
                        <div className="flex items-center gap-2"><div className="w-3 h-3 bg-yellow-500 rounded-full"></div> Warm (20-30{settings.tempUnit})</div>
                        <div className="flex items-center gap-2"><div className="w-3 h-3 bg-red-500 rounded-full"></div> Heet (&gt;30{settings.tempUnit})</div>
                    </div>
                ) : (
                    <div className="space-y-1">
                        <div>Waarde: {layer}</div>
                    </div>
                )}
            </div>
        </div>
    );
};

// Helper for temp colors
function getTempColor(t: number): string {
    if (t < 0) return '#4f46e5'; // Indigo-600
    if (t < 10) return '#3b82f6'; // Blue-500
    if (t < 20) return '#22c55e'; // Green-500
    if (t < 30) return '#eab308'; // Yellow-500
    return '#ef4444'; // Red-500
}
