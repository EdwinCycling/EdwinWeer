import React, { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, ZoomControl, LayersControl } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { AppSettings, ViewState, Location, MapBaseLayer, AppLanguage } from '../types';
import { Icon } from '../components/Icon';
import L from 'leaflet';
import { getTranslation } from '../services/translations';
import { searchCityByName } from '../services/geoService';
import { convertTemp, convertWind, convertPrecip, convertPressure } from '../services/weatherService';
import { loadCurrentLocation } from '../services/storageService';
import { trackCall } from '../services/usageService';

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
    onUpdateSettings?: (newSettings: AppSettings) => void;
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

// Color interpolation helper
function interpolateColor(val: number, stops: {val: number, color: [number, number, number]}[]) {
    // Sort stops just in case
    // stops.sort((a, b) => a.val - b.val); // Assume sorted for performance

    if (val <= stops[0].val) return `rgb(${stops[0].color.join(',')})`;
    if (val >= stops[stops.length - 1].val) return `rgb(${stops[stops.length - 1].color.join(',')})`;

    for (let i = 0; i < stops.length - 1; i++) {
        if (val >= stops[i].val && val <= stops[i+1].val) {
            const t = (val - stops[i].val) / (stops[i+1].val - stops[i].val);
            const r = Math.round(stops[i].color[0] + t * (stops[i+1].color[0] - stops[i].color[0]));
            const g = Math.round(stops[i].color[1] + t * (stops[i+1].color[1] - stops[i].color[1]));
            const b = Math.round(stops[i].color[2] + t * (stops[i+1].color[2] - stops[i].color[2]));
            return `rgb(${r},${g},${b})`;
        }
    }
    return 'rgb(128,128,128)';
}

// Temperature color scale (more detailed)
const TEMP_STOPS: {val: number, color: [number, number, number]}[] = [
    { val: -20, color: [48, 20, 100] },   // Deep Purple
    { val: -10, color: [0, 0, 255] },     // Blue
    { val: 0, color: [0, 191, 255] },     // Light Blue
    { val: 5, color: [0, 255, 127] },     // Spring Green
    { val: 10, color: [50, 205, 50] },    // Lime Green
    { val: 15, color: [255, 255, 0] },    // Yellow
    { val: 20, color: [255, 165, 0] },    // Orange
    { val: 25, color: [255, 69, 0] },     // Red-Orange
    { val: 30, color: [255, 0, 0] },      // Red
    { val: 40, color: [139, 0, 0] }       // Dark Red
];

// Humidity color scale (Dry -> Wet)
const HUMIDITY_STOPS: {val: number, color: [number, number, number]}[] = [
    { val: 0, color: [255, 0, 0] },       // Red (Very Dry)
    { val: 30, color: [255, 165, 0] },    // Orange
    { val: 50, color: [50, 205, 50] },    // Green (Comfortable)
    { val: 70, color: [0, 191, 255] },    // Blue (Humid)
    { val: 90, color: [0, 0, 255] },      // Dark Blue
    { val: 100, color: [0, 0, 139] }      // Very Dark Blue
];

// Dew Point color scale
const DEW_STOPS: {val: number, color: [number, number, number]}[] = [
    { val: 0, color: [0, 191, 255] },     // Comfortable
    { val: 10, color: [50, 205, 50] },    // Pleasant
    { val: 15, color: [255, 255, 0] },    // Humid
    { val: 20, color: [255, 165, 0] },    // Muggy
    { val: 25, color: [255, 0, 0] }       // Oppressive
];

// Beaufort Scale Colors
const BFT_COLORS = [
    { bft: 0, min: 0, color: '#FFFFFF' },      // Calm
    { bft: 1, min: 1, color: '#AEF1F9' },      // Light Air
    { bft: 2, min: 6, color: '#96F7DC' },      // Light Breeze
    { bft: 3, min: 12, color: '#96F7B4' },     // Gentle Breeze
    { bft: 4, min: 20, color: '#6FF46F' },     // Moderate Breeze
    { bft: 5, min: 29, color: '#73ED12' },     // Fresh Breeze
    { bft: 6, min: 39, color: '#A4ED12' },     // Strong Breeze
    { bft: 7, min: 50, color: '#DAED12' },     // High Wind
    { bft: 8, min: 62, color: '#EDC212' },     // Gale
    { bft: 9, min: 75, color: '#ED8F12' },     // Strong Gale
    { bft: 10, min: 89, color: '#ED6312' },    // Storm
    { bft: 11, min: 103, color: '#ED2912' },   // Violent Storm
    { bft: 12, min: 118, color: '#D5102D' }    // Hurricane
];

function getBftColor(speedKmH: number): string {
    for (let i = BFT_COLORS.length - 1; i >= 0; i--) {
        if (speedKmH >= BFT_COLORS[i].min) return BFT_COLORS[i].color;
    }
    return '#FFFFFF';
}

function getTempColor(temp: number) {
    return interpolateColor(temp, TEMP_STOPS);
}

function getHumidityColor(hum: number) {
    return interpolateColor(hum, HUMIDITY_STOPS);
}

function getDewPointColor(dew: number) {
    return interpolateColor(dew, DEW_STOPS);
}

// Legend Component
const MapLegend = ({ layer, isDark, lang, tempUnit }: { layer: MapLayer, isDark: boolean, lang: AppLanguage, tempUnit: AppSettings['tempUnit'] }) => {
    const t = (key: string) => getTranslation(key, lang);
    if (layer === 'wind' || layer === 'gusts') {
        return (
            <div className={`absolute bottom-[104px] left-4 z-[1000] p-2 rounded-lg shadow-lg text-xs ${isDark ? 'bg-slate-800 text-white' : 'bg-white text-slate-800'}`}>
                <div className="font-bold mb-1">{t('country_map.legend.beaufort')}</div>
                <div className="grid grid-cols-2 gap-1 w-32">
                    {BFT_COLORS.map(b => (
                        <div key={b.bft} className="flex items-center gap-1">
                            <div className="w-3 h-3 rounded-sm border border-slate-300" style={{ backgroundColor: b.color }}></div>
                            <span>{b.bft} ({b.min}+)</span>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    let stops: {val: number, color: [number, number, number]}[] = [];
    let title = '';
    let unit = '';

    switch(layer) {
        case 'temp':
        case 'max_temp':
        case 'min_temp':
        case 'feels_like':
            stops = TEMP_STOPS;
            title = t('temp');
            unit = tempUnit === 'F' ? '°F' : '°C';
            break;
        case 'humidity':
            stops = HUMIDITY_STOPS;
            title = t('humidity');
            unit = '%';
            break;
        case 'dew_point':
            stops = DEW_STOPS;
            title = t('dew_point');
            unit = tempUnit === 'F' ? '°F' : '°C';
            break;
        default:
            return null;
    }

    return (
        <div className={`absolute bottom-[104px] left-4 z-[1000] p-2 rounded-lg shadow-lg text-xs ${isDark ? 'bg-slate-800 text-white' : 'bg-white text-slate-800'}`}>
            <div className="font-bold mb-1">{title} ({unit})</div>
            <div className="flex flex-col-reverse gap-0.5">
                {stops.map((s, i) => (
                    <div key={i} className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded-sm border border-slate-300" style={{ backgroundColor: `rgb(${s.color.join(',')})` }}></div>
                        <span>{s.val}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

const COUNTRY_POLYGONS: Record<string, number[][]> = {
    'NL': [[51.8, 3.3], [53.5, 4.6], [53.6, 7.2], [52.2, 7.0], [50.7, 6.0], [51.3, 3.3]],
    'BE': [[51.5, 4.4], [51.3, 2.5], [50.7, 2.8], [49.5, 5.5], [50.1, 6.4], [51.2, 5.9]],
    'DE': [[54.9, 8.3], [54.5, 14.3], [51.4, 15.0], [47.3, 13.0], [47.5, 7.5], [49.2, 6.1], [51.0, 5.9], [53.5, 7.0]],
    'FR': [[51.1, 2.5], [49.0, 8.2], [43.7, 7.5], [42.4, 3.1], [43.3, -1.8], [48.4, -5.1]],
    'US': [[49.0, -125.0], [49.0, -66.9], [24.5, -80.0], [25.8, -97.0], [31.3, -110.0], [32.5, -117.0]]
};

function isPointInPolygon(lat: number, lon: number, polygon: number[][]): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i][0], yi = polygon[i][1];
        const xj = polygon[j][0], yj = polygon[j][1];
        
        const intersect = ((yi > lon) !== (yj > lon))
            && (lat < (xj - xi) * (lon - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}


// Generate grid points for better coverage
const generateGridPoints = (countryCode: string, gridLabel: string): {lat: number, lon: number, name: string, isGrid: boolean}[] => {
    const polygon = COUNTRY_POLYGONS[countryCode];
    if (!polygon) return [];

    // Calculate bounds
    let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
    polygon.forEach(p => {
        minLat = Math.min(minLat, p[0]);
        maxLat = Math.max(maxLat, p[0]);
        minLon = Math.min(minLon, p[1]);
        maxLon = Math.max(maxLon, p[1]);
    });

    const latRange = maxLat - minLat;
    const lonRange = maxLon - minLon;
    
    // Target ~64 points. sqrt(64) = 8.
    // We want proportional steps.
    // ratio = lonRange / latRange.
    // cols / rows = ratio.
    // cols * rows = 64.
    // rows^2 * ratio = 64 => rows = sqrt(64/ratio).
    
    const ratio = lonRange / latRange;
    const rows = Math.round(Math.sqrt(64 / ratio));
    const cols = Math.round(64 / rows);
    
    const latStep = latRange / rows;
    const lonStep = lonRange / cols;

    const points: {lat: number, lon: number, name: string, isGrid: boolean}[] = [];

    for (let lat = minLat; lat <= maxLat; lat += latStep) {
        for (let lon = minLon; lon <= maxLon; lon += lonStep) {
            if (isPointInPolygon(lat, lon, polygon)) {
                points.push({
                    lat: Number(lat.toFixed(2)),
                    lon: Number(lon.toFixed(2)),
                    name: `${gridLabel} (${lat.toFixed(1)}, ${lon.toFixed(1)})`,
                    isGrid: true
                });
            }
        }
    }
    
    // Hard limit to 64
    return points.slice(0, 64);
};

type MapLayer = 'temp' | 'min_temp' | 'max_temp' | 'feels_like' | 'wind' | 'humidity' | 'pressure' | 'clouds' | 'precip' | 'gusts' | 'dew_point';

const MapBaseLayerSync = ({
    onMap,
    selectedBaseLayer,
    onChangeBaseLayer,
    labels,
}: {
    onMap: (map: L.Map) => void;
    selectedBaseLayer: MapBaseLayer;
    onChangeBaseLayer: (next: MapBaseLayer) => void;
    labels: { light: string; dark: string; satellite: string };
}) => {
    const map = useMap();

    useEffect(() => {
        onMap(map);
    }, [map, onMap]);

    useEffect(() => {
        const handler = (e: any) => {
            const name = String(e?.name || '').toLowerCase();
            const light = labels.light.toLowerCase();
            const dark = labels.dark.toLowerCase();
            const satellite = labels.satellite.toLowerCase();
            const next: MapBaseLayer =
                name === satellite || name.includes('sat') ? 'satellite' :
                name === dark || name.includes('donker') || name.includes('dark') ? 'dark' :
                name === light ? 'light' :
                'light';
            if (next !== selectedBaseLayer) {
                onChangeBaseLayer(next);
            }
        };
        map.on('baselayerchange', handler);
        return () => {
            map.off('baselayerchange', handler);
        };
    }, [map, onChangeBaseLayer, selectedBaseLayer, labels]);

    return null;
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

// Helper to show a country badge without emojis
function getCountryBadgeText(countryCode: string) {
    if (!countryCode || countryCode === '??') return '??';
    return countryCode.toUpperCase().slice(0, 2);
}

type CountryMappingValue = { code: string; nameNl: string; nameEn: string };

const COUNTRY_MAPPING: Record<string, CountryMappingValue> = {
    'NL': { code: 'NL', nameNl: 'Nederland', nameEn: 'Netherlands' },
    'NEDERLAND': { code: 'NL', nameNl: 'Nederland', nameEn: 'Netherlands' },
    'THE NETHERLANDS': { code: 'NL', nameNl: 'Nederland', nameEn: 'Netherlands' },
    'BE': { code: 'BE', nameNl: 'België', nameEn: 'Belgium' },
    'BELGIE': { code: 'BE', nameNl: 'België', nameEn: 'Belgium' },
    'BELGIUM': { code: 'BE', nameNl: 'België', nameEn: 'Belgium' },
    'DE': { code: 'DE', nameNl: 'Duitsland', nameEn: 'Germany' },
    'GERMANY': { code: 'DE', nameNl: 'Duitsland', nameEn: 'Germany' },
    'DEUTSCHLAND': { code: 'DE', nameNl: 'Duitsland', nameEn: 'Germany' },
    'FR': { code: 'FR', nameNl: 'Frankrijk', nameEn: 'France' },
    'FRANCE': { code: 'FR', nameNl: 'Frankrijk', nameEn: 'France' },
    'UK': { code: 'UK', nameNl: 'Verenigd Koninkrijk', nameEn: 'United Kingdom' },
    'UNITED KINGDOM': { code: 'UK', nameNl: 'Verenigd Koninkrijk', nameEn: 'United Kingdom' },
    'GREAT BRITAIN': { code: 'UK', nameNl: 'Verenigd Koninkrijk', nameEn: 'United Kingdom' },
    'US': { code: 'US', nameNl: 'Verenigde Staten', nameEn: 'United States' },
    'USA': { code: 'US', nameNl: 'Verenigde Staten', nameEn: 'United States' },
    'JP': { code: 'JP', nameNl: 'Japan', nameEn: 'Japan' },
    'JAPAN': { code: 'JP', nameNl: 'Japan', nameEn: 'Japan' },
    'ES': { code: 'ES', nameNl: 'Spanje', nameEn: 'Spain' },
    'SPAIN': { code: 'ES', nameNl: 'Spanje', nameEn: 'Spain' },
    'IT': { code: 'IT', nameNl: 'Italië', nameEn: 'Italy' },
    'ITALY': { code: 'IT', nameNl: 'Italië', nameEn: 'Italy' },
    'CH': { code: 'CH', nameNl: 'Zwitserland', nameEn: 'Switzerland' },
    'SWITZERLAND': { code: 'CH', nameNl: 'Zwitserland', nameEn: 'Switzerland' },
    'AT': { code: 'AT', nameNl: 'Oostenrijk', nameEn: 'Austria' },
    'AUSTRIA': { code: 'AT', nameNl: 'Oostenrijk', nameEn: 'Austria' },
    'DK': { code: 'DK', nameNl: 'Denemarken', nameEn: 'Denmark' },
    'DENMARK': { code: 'DK', nameNl: 'Denemarken', nameEn: 'Denmark' },
    'SE': { code: 'SE', nameNl: 'Zweden', nameEn: 'Sweden' },
    'SWEDEN': { code: 'SE', nameNl: 'Zweden', nameEn: 'Sweden' },
    'NO': { code: 'NO', nameNl: 'Noorwegen', nameEn: 'Norway' },
    'NORWAY': { code: 'NO', nameNl: 'Noorwegen', nameEn: 'Norway' }
};

function normalizeCountry(input: string, lang: AppLanguage): { name: string, code: string } {
    if (!input) return { name: getTranslation('country_map.unknown_country', lang), code: '??' };
    const upper = input.trim().toUpperCase();
    const mapped = COUNTRY_MAPPING[upper];
    if (mapped) {
        return {
            code: mapped.code,
            name: lang === 'nl' ? mapped.nameNl : mapped.nameEn
        };
    }
    // Fallback: use input as name if long, assume code if short
    if (upper.length === 2) {
        return { name: upper, code: upper };
    }
    return { name: input, code: input.substring(0, 2).toUpperCase() };
}

export const CountryMapView: React.FC<CountryMapViewProps> = ({ onNavigate, settings, onUpdateSettings }) => {
    const [selectedCountry, setSelectedCountry] = useState<{name: string, code: string} | null>(null);
    const [selectedLocationName, setSelectedLocationName] = useState<string | null>(null);
    const [weatherData, setWeatherData] = useState<WeatherStation[]>([]);
    const [layer, setLayer] = useState<MapLayer>('temp');
    const [viewMode, setViewMode] = useState<'points' | 'surface'>('points');
    const [loading, setLoading] = useState(false);
    const [mapInstance, setMapInstance] = useState<L.Map | null>(null);

    // Map Layers Control
    const [progress, setProgress] = useState<number>(0);
    const [error, setError] = useState<string | null>(null);
    const [selectedDate, setSelectedDate] = useState<Date>(new Date());
    
    // Search state
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<Location[]>([]);
    const [searching, setSearching] = useState(false);
    const [showDropdown, setShowDropdown] = useState(false);

    const t = (key: string) => getTranslation(key, settings.language);

    const selectedBaseLayer: MapBaseLayer = settings.mapBaseLayer ?? (settings.theme === 'dark' ? 'dark' : 'light');

    // Pre-fill country search on mount
    useEffect(() => {
        const loc = loadCurrentLocation();
        if (loc && loc.country) {
            handleSearch(loc.country);
        }
    }, []);

    // Extract unique countries from favorites
    const availableCountries = useMemo(() => {
        const unique = new Map<string, {name: string, code: string}>();
        
        const add = (c: string) => {
             const norm = normalizeCountry(c, settings.language);
             if (!unique.has(norm.code)) {
                 unique.set(norm.code, norm);
             }
        };

        // Add ONLY favorites
        settings.favorites.forEach(f => add(f.country));

        return Array.from(unique.values()).sort((a, b) => a.name.localeCompare(b.name));
    }, [settings.favorites, settings.language]);

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
        setProgress(0);
        
        const config = COUNTRY_CONFIG[country.code];
        
        // Start with defined cities
        let cities = config?.cities ? [...config.cities] : [];
        
        // Add favorites for this country
        const favs = settings.favorites.filter(f => normalizeCountry(f.country, settings.language).code === country.code);
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

        // ALWAYS generate grid points for Raster view, combined with cities
        const grid = generateGridPoints(country.code, t('country_map.view.grid'));
        
        // Combine all points to fetch
        let allPoints = [...cities, ...grid];

        if (allPoints.length === 0) {
             setError(`${t('country_map.error.no_stations')} ${country.name}. ${t('country_map.error.no_stations_hint')}`);
             setLoading(false);
             return;
        }

        // Limit to reasonable amount if somehow exceeds (OpenMeteo handles many, but URL length matters)
        // 150 points is usually fine
        if (allPoints.length > 150) {
            allPoints = allPoints.slice(0, 150);
        }

        // Chunking logic
        const CHUNK_SIZE = 10; // Fetch 10 stations at a time
        const totalPoints = allPoints.length;
        let processedPoints = 0;

        const isToday = date.toDateString() === new Date().toDateString();
        const dateStr = date.toISOString().split('T')[0];
        
        // Decide API endpoint
        const baseUrl = 'https://api.open-meteo.com/v1/forecast';

        try {
            for (let i = 0; i < totalPoints; i += CHUNK_SIZE) {
                const chunk = allPoints.slice(i, i + CHUNK_SIZE);
                
                const lats = chunk.map(c => c.lat).join(',');
                const lons = chunk.map(c => c.lon).join(',');
                
                // Use OpenMeteo API with Expanded Data
                let url = `${baseUrl}?latitude=${lats}&longitude=${lons}&start_date=${dateStr}&end_date=${dateStr}&hourly=temperature_2m,apparent_temperature,wind_speed_10m,wind_direction_10m,relative_humidity_2m,surface_pressure,cloud_cover,precipitation,wind_gusts_10m,dew_point_2m&daily=temperature_2m_max,temperature_2m_min&timezone=auto`;
                
                if (isToday) {
                    url += `&current=temperature_2m,apparent_temperature,wind_speed_10m,wind_direction_10m,relative_humidity_2m,surface_pressure,cloud_cover,precipitation,wind_gusts_10m,dew_point_2m`;
                }

                // Small delay to be "calmer"
                if (i > 0) {
                    await new Promise(resolve => setTimeout(resolve, 250));
                }

                trackCall();
                const res = await fetch(url);
                if (!res.ok) throw new Error('Network response was not ok');
                const data = await res.json();
                
                const results = Array.isArray(data) ? data : [data];
                const newStations: WeatherStation[] = [];
                
                results.forEach((d: any, idx: number) => {
                    // Helper to get value: Current (if today) or Hourly Noon (index 12)
                    const getVal = (field: string) => {
                        if (isToday && d.current && d.current[field] != null) return d.current[field];
                        if (d.hourly && d.hourly[field]) return d.hourly[field][12] ?? d.hourly[field][0];
                        return 0;
                    };

                    newStations.push({
                        lat: chunk[idx].lat,
                        lon: chunk[idx].lon,
                        name: chunk[idx].name,
                        // @ts-ignore
                        isGrid: chunk[idx].isGrid,
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

                setWeatherData(prev => [...prev, ...newStations]);
                processedPoints += chunk.length;
                setProgress(Math.round((processedPoints / totalPoints) * 100));
            }
        } catch (e) {
            console.error(e);
            setError("Kan weerdata niet volledig ophalen. Controleer je internetverbinding.");
        } finally {
            setLoading(false);
            setProgress(0);
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
                    <h1 className="text-lg font-bold">{t('country_map.choose_country')}</h1>
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
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && searchResults.length > 0) {
                                        const norm = normalizeCountry(searchResults[0].country, settings.language);
                                        handleCountrySelect(norm, searchResults[0]);
                                    }
                                }}
                                placeholder={t('country_map.search_country_placeholder')}
                                className="flex-1 bg-transparent outline-none placeholder:text-slate-400"
                            />
                            {searching && <div className="animate-spin w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full" />}
                        </div>

                        {/* Search Dropdown */}
                        {showDropdown && searchResults.length > 0 && (
                            <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-100 dark:border-slate-700 overflow-hidden max-h-60 overflow-y-auto">
                                {searchResults.map((result, idx) => {
                                    const norm = normalizeCountry(result.country, settings.language);
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
                                            <span className="text-xs font-bold px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-white">{getCountryBadgeText(norm.code)}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Favorites List */}
                    <div>
                        <h2 className="text-xs font-bold uppercase text-slate-500 mb-3 tracking-wider">{t('country_map.from_favorites')}</h2>
                        <div className="space-y-3">
                            {availableCountries.length === 0 ? (
                                <p className="text-slate-400 text-sm italic">{t('country_map.no_favorite_countries')}</p>
                            ) : (
                                availableCountries.map(country => (
                                    <button
                                        key={country.code}
                                        onClick={() => handleCountrySelect(country)}
                                        className="w-full p-4 flex items-center justify-between bg-white dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-slate-700 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm transition-all group"
                                    >
                                        <span className="text-lg font-medium flex items-center gap-3">
                                            <span className="text-xs font-bold px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-white shadow-sm">{getCountryBadgeText(country.code)}</span>
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
                .map-safe-controls .leaflet-bottom {
                    bottom: 96px;
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
                                    {loading && (
                                        <span className="text-sm font-normal text-blue-500 ml-2">
                                            {progress}%
                                        </span>
                                    )}
                                    {selectedLocationName && <span className="text-sm font-normal text-slate-500 dark:text-slate-400">({selectedLocationName})</span>}
                                </h2>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                    {(isToday ? t('country_map.status.current') : (isFuture ? t('country_map.status.forecast') : t('country_map.status.history')))} - {selectedDate.toLocaleDateString(settings.language === 'nl' ? 'nl-NL' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'long' })}
                                </p>
                            </div>
                        </div>
                        
                        {/* Date Controls */}
                        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
                             <button onClick={() => handleDateChange(-1)} className="p-2 hover:bg-white dark:hover:bg-slate-700 rounded-md">
                                 <Icon name="chevron_left" className="w-5 h-5" />
                             </button>
                             <button onClick={() => handleDateChange(1)} className="p-2 hover:bg-white dark:hover:bg-slate-700 rounded-md">
                                 <Icon name="chevron_right" className="w-5 h-5" />
                             </button>
                             <button
                                 onClick={() => {
                                     if (!mapInstance) return;
                                     mapInstance.setView([mapConfig.lat, mapConfig.lon], mapConfig.zoom, { animate: true });
                                 }}
                                 className="p-2 hover:bg-white dark:hover:bg-slate-700 rounded-md"
                             >
                                 <Icon name="refresh" className="w-5 h-5" />
                             </button>
                        </div>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                        {/* View Mode Toggles */}
                        <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-1 w-full">
                            <button 
                                onClick={() => setViewMode('points')}
                                className={`flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${viewMode === 'points' ? 'bg-white dark:bg-slate-700 shadow-sm' : 'opacity-60 hover:opacity-100'}`}
                            >
                                {t('country_map.view.cities')}
                            </button>
                            <button 
                                onClick={() => setViewMode('surface')}
                                className={`flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${viewMode === 'surface' ? 'bg-white dark:bg-slate-700 shadow-sm' : 'opacity-60 hover:opacity-100'}`}
                            >
                                {t('country_map.view.grid')}
                            </button>
                        </div>
                    </div>
                    
                    {/* Layer Toggles (Scrollable) */}
                    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-2 px-2">
                        {(isToday ? [
                            { id: 'temp', label: t('country_map.layer.current_temp') },
                            { id: 'max_temp', label: t('max_temp') },
                            { id: 'min_temp', label: t('min_temp') },
                            { id: 'feels_like', label: t('feels_like') },
                        ] : [
                            { id: 'max_temp', label: t('max_temp') },
                            { id: 'min_temp', label: t('min_temp') },
                        ]).concat([
                            { id: 'wind', label: t('wind') },
                            { id: 'gusts', label: t('wind_gusts') },
                            { id: 'precip', label: t('precip') },
                            { id: 'humidity', label: t('humidity') },
                            { id: 'clouds', label: t('cloud_cover') },
                            { id: 'pressure', label: t('pressure') },
                            { id: 'dew_point', label: t('dew_point') },
                        ]).map((item) => (
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
                        <div className="font-bold text-slate-800 dark:text-white">{t('country_map.loading.title')}</div>
                        <div className="text-sm text-slate-500">{t('country_map.loading.subtitle')}</div>
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
                            {t('country_map.error.back_overview')}
                        </button>
                    </div>
                </div>
            )}

            {/* Map */}
            <div className="flex-grow w-full h-full relative z-0">
                <MapLegend layer={layer} isDark={settings.theme === 'dark'} lang={settings.language} tempUnit={settings.tempUnit} />
                <MapContainer 
                    key={selectedCountry.code}
                    center={[mapConfig.lat, mapConfig.lon]} 
                    zoom={mapConfig.zoom} 
                    style={{ height: '100%', width: '100%' }}
                    zoomControl={false}
                    className="map-safe-controls"
                >
                    <LayersControl position="bottomright">
                        <LayersControl.BaseLayer checked={selectedBaseLayer === 'light'} name={t('country_map.base.light')}>
                            <TileLayer
                                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                            />
                        </LayersControl.BaseLayer>
                        <LayersControl.BaseLayer checked={selectedBaseLayer === 'dark'} name={t('country_map.base.dark')}>
                            <TileLayer
                                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                            />
                        </LayersControl.BaseLayer>
                        <LayersControl.BaseLayer checked={selectedBaseLayer === 'satellite'} name={t('country_map.base.satellite')}>
                            <TileLayer
                                attribution='&copy; <a href="https://www.esri.com/">Esri</a>'
                                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                            />
                        </LayersControl.BaseLayer>
                    </LayersControl>
                    <ZoomControl position="bottomright" />

                    <MapBaseLayerSync
                        onMap={(m) => setMapInstance(m)}
                        selectedBaseLayer={selectedBaseLayer}
                        onChangeBaseLayer={(next) => {
                            if (!onUpdateSettings) return;
                            if (next === selectedBaseLayer) return;
                            onUpdateSettings({ ...settings, mapBaseLayer: next });
                        }}
                        labels={{
                            light: t('country_map.base.light'),
                            dark: t('country_map.base.dark'),
                            satellite: t('country_map.base.satellite')
                        }}
                    />
                    <MapUpdater center={[mapConfig.lat, mapConfig.lon]} zoom={mapConfig.zoom} />
                    
                    {/* Markers */}
                    {weatherData
                        .filter(station => viewMode === 'surface' ? station.isGrid : !station.isGrid)
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
                                color = getBftColor(valWind);
                                rotate = station.windDirection;
                                showRotate = true;
                                break;
                            case 'humidity':
                                displayVal = station.humidity.toString();
                                unit = '%';
                                color = getHumidityColor(station.humidity);
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
                                displayVal = station.precip.toString();
                                unit = 'mm';
                                color = station.precip > 0 ? '#3b82f6' : '#cbd5e1';
                                break;
                            case 'dew_point':
                                displayVal = Math.round(station.dewPoint).toString();
                                unit = '°';
                                color = getDewPointColor(station.dewPoint);
                                break;
                            default: // Temp
                                const val = layer === 'feels_like' ? station.feelsLike : (layer === 'min_temp' ? station.minTemp : (layer === 'max_temp' ? station.maxTemp : station.temp));
                                displayVal = Math.round(val ?? 0).toString();
                                unit = '°';
                                color = getTempColor(val ?? 0);
                        }

                        // Grid points are smaller/simpler
                        if (station.isGrid) {
                            return (
                                <Marker 
                                    key={`grid-${idx}`} 
                                    position={[station.lat, station.lon]}
                                    icon={L.divIcon({
                                        className: 'custom-grid-point',
                                        html: `<div style="
                                            background-color: ${color}; 
                                            width: 24px; 
                                            height: 24px; 
                                            border-radius: 50%; 
                                            border: 2px solid white;
                                            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                                            display: flex;
                                            align-items: center;
                                            justify-content: center;
                                            font-size: 10px;
                                            font-weight: bold;
                                            color: ${layer === 'clouds' && station.clouds < 50 ? 'black' : 'white'};
                                            transform: ${showRotate ? `rotate(${rotate}deg)` : 'none'};
                                        ">${showRotate ? '↑' : displayVal}</div>`,
                                        iconSize: [24, 24],
                                        iconAnchor: [12, 12]
                                    })}
                                >
                                    <Popup className="custom-popup">
                                        <div className="p-2 min-w-[150px]">
                                            <h3 className="font-bold text-sm mb-1">{station.name}</h3>
                                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                                                <div className="text-slate-500">{t('temp')}:</div>
                                                <div className="font-medium">{convertTemp(station.temp, settings.tempUnit)}°</div>
                                                <div className="text-slate-500">{t('wind')}:</div>
                                                <div className="font-medium">{convertWind(station.windSpeed, settings.windUnit)} {settings.windUnit}</div>
                                                <div className="text-slate-500">{t('precip')}:</div>
                                                <div className="font-medium">{convertPrecip(station.precip, settings.precipUnit)} {settings.precipUnit}</div>
                                            </div>
                                        </div>
                                    </Popup>
                                </Marker>
                            );
                        }

                        return (
                            <Marker 
                                key={idx} 
                                position={[station.lat, station.lon]}
                                icon={L.divIcon({
                                    className: 'custom-marker',
                                    html: `<div style="
                                        background-color: ${color}; 
                                        padding: 4px 8px; 
                                        border-radius: 12px; 
                                        color: ${layer === 'clouds' && station.clouds < 50 ? 'black' : 'white'}; 
                                        font-weight: bold; 
                                        font-size: 12px;
                                        white-space: nowrap;
                                        border: 2px solid white;
                                        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
                                        display: flex;
                                        align-items: center;
                                        justify-content: center;
                                        gap: 4px;
                                        min-width: 40px;
                                        transform: translate(-50%, -50%);
                                        position: absolute;
                                        left: 0;
                                        top: 0;
                                    ">
                                        ${showRotate ? `<span style="transform: rotate(${rotate}deg); display: inline-block">↑</span>` : ''}
                                        ${displayVal}${unit}
                                    </div>`,
                                    iconSize: [0, 0],
                                    iconAnchor: [0, 0]
                                })}
                            >
                                <Popup className="custom-popup">
                                    <div className="p-2 min-w-[150px]">
                                        <h3 className="font-bold text-base mb-1">{station.name}</h3>
                                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                                            <div className="text-slate-500">{t('temp')}:</div>
                                            <div className="font-medium">{convertTemp(station.temp, settings.tempUnit)}°</div>
                                            <div className="text-slate-500">{t('feels_like')}:</div>
                                            <div className="font-medium">{convertTemp(station.feelsLike, settings.tempUnit)}°</div>
                                            <div className="text-slate-500">{t('wind')}:</div>
                                            <div className="font-medium">{convertWind(station.windSpeed, settings.windUnit)} {settings.windUnit}</div>
                                            <div className="text-slate-500">{t('humidity')}:</div>
                                            <div className="font-medium">{station.humidity}%</div>
                                            <div className="text-slate-500">{t('precip')}:</div>
                                            <div className="font-medium">{convertPrecip(station.precip, settings.precipUnit)} {settings.precipUnit}</div>
                                        </div>
                                    </div>
                                </Popup>
                            </Marker>
                        );
                    })}
                </MapContainer>
            </div>
        </div>
    );
};
