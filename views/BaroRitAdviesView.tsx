import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap, useMapEvents, LayersControl } from 'react-leaflet';
import L from 'leaflet';
import '@geoman-io/leaflet-geoman-free';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';
import * as turf from '@turf/turf';
import { generateGpx } from '../services/gpxService';
import { Icon } from '../components/Icon';
import { getTranslation } from '../services/translations';
import { auth } from '../services/firebase';
import { useAuth } from '../hooks/useAuth';
import { loadSettings } from '../services/storageService';
import { searchCityByName } from '../services/geoService';
import { hasBaroCredits, trackBaroCall, getUsage } from '../services/usageService';
import { Location, ViewState, WindUnit, PrecipUnit } from '../types';
import { convertWind, throttledFetch } from '../services/weatherService';
import { RouteDetailModal } from '../components/RouteDetailModal';
import { CreditFloatingButton } from '../components/CreditFloatingButton';
import { Modal } from '../components/Modal';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, ReferenceLine } from 'recharts';

// Fix Leaflet marker icons
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

const SliderIcon = L.divIcon({
    className: 'slider-marker-icon',
    html: `
      <div style="
        width: 16px;
        height: 16px;
        background: #ef4444;
        border: 2px solid white;
        border-radius: 50%;
        box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.3);
      "></div>
    `,
    iconSize: [16, 16],
    iconAnchor: [8, 8]
});

const MapRecenter = ({ center }: { center: [number, number] }) => {
    const map = useMap();
    useEffect(() => {
        map.setView(center);
    }, [center, map]);
    return null;
};

// Component to handle map clicks for setting location
const LocationSelector = ({ onSelect }: { onSelect: (lat: number, lng: number) => void }) => {
    useMapEvents({
        click(e) {
            onSelect(e.latlng.lat, e.latlng.lng);
        },
    });
    return null;
};

// Wind Markers Component
const WindMarkers = ({ data, wind, unit }: { data: any, wind: { direction: number, speed: number }, unit: WindUnit }) => {
    if (!data || !data.features || !data.features[0]) return null;

    const geometry = data.features[0].geometry;
    const line = turf.lineString(geometry.coordinates); // GeoJSON is [lon, lat]
    const length = turf.length(line, { units: 'kilometers' });
    
    const markers = [];
    // Start at 15km, step 15km
    for (let dist = 15; dist < length; dist += 15) {
        const point = turf.along(line, dist, { units: 'kilometers' });
        const [lon, lat] = point.geometry.coordinates;
        
        // Create a custom icon for wind
        const windIcon = L.divIcon({
    className: 'custom-wind-icon',
    html: `
      <div style="
        transform: rotate(${wind.direction}deg); 
        display: flex; 
        align-items: center; 
        justify-content: center;
        width: 15px;
        height: 15px;
        background: white;
        border-radius: 50%;
        border: 1.5px solid #4f46e5;
        box-shadow: 0 1px 2px rgba(0,0,0,0.2);
      ">
        <span style="font-size: 8px;">⬇️</span>
      </div>
    `,
    iconSize: [15, 15],
    iconAnchor: [7.5, 7.5]
  });

        markers.push(
            <Marker key={`wind-${dist}`} position={[lat, lon]} icon={windIcon}>
                <Popup>
                    <div className="text-center">
                        <div className="font-bold">{dist} km</div>
                        <div>Wind: {convertWind(wind.speed, unit)} {unit}</div>
                        <div>Richting: {wind.direction}°</div>
                    </div>
                </Popup>
            </Marker>
        );
    }

    return <>{markers}</>;
};

const ElevationChart = ({ data, t }: { data: any[], t: (key: string) => string }) => {
    if (!data || data.length === 0) return null;
    
    const minEle = Math.min(...data.map(d => d.ele));
    const maxEle = Math.max(...data.map(d => d.ele));
    const diff = maxEle - minEle;
    
    // Calculate nice ticks
    let interval = 10;
    if (diff > 100) interval = 50;
    if (diff > 500) interval = 100;
    
    // Round min down and max up to nearest interval
    const domainMin = Math.floor(minEle / interval) * interval;
    const domainMax = Math.ceil(maxEle / interval) * interval;
    
    return (
        <div className="h-40 w-full mt-2 bg-bg-page/50 rounded-lg p-2 border border-border-color/50">
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                        <linearGradient id="colorEle" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" opacity={0.5} />
                    <YAxis 
                        domain={[domainMin, domainMax]}
                        tick={{ fontSize: 10, fill: 'var(--text-muted)' }} 
                        width={35}
                        tickFormatter={(val) => `${Math.round(val)}`}
                        allowDecimals={false}
                        interval="preserveStartEnd"
                        tickCount={5}
                    />
                    <Tooltip 
                        contentStyle={{ backgroundColor: 'var(--bg-card)', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '12px' }}
                        itemStyle={{ color: 'var(--text-main)' }}
                        formatter={(value: number) => [`${Math.round(value)}m`, t('chart.elevation')]}
                        labelFormatter={() => ''}
                    />
                    <Area type="monotone" dataKey="ele" stroke="#4f46e5" fillOpacity={1} fill="url(#colorEle)" strokeWidth={2} />
                </AreaChart>
            </ResponsiveContainer>
            <div className="flex justify-between text-[10px] text-text-muted mt-1 px-2">
                <span>{t('chart.lowest')}: {Math.round(minEle)}m</span>
                <span>{t('chart.highest')}: {Math.round(maxEle)}m</span>
            </div>
        </div>
    );
};

const WindChart = ({ data }: { data: any[] }) => {
    if (!data || data.length === 0) return null;

    const maxWind = Math.max(...data.map(d => Math.abs(d.wind)));
    const domainMax = Math.ceil(maxWind / 5) * 5;

    const gradientOffset = () => {
        const dataMax = Math.max(...data.map((i) => i.wind));
        const dataMin = Math.min(...data.map((i) => i.wind));
      
        if (dataMax <= 0) return 0;
        if (dataMin >= 0) return 1;
      
        return dataMax / (dataMax - dataMin);
    };
    
    const off = gradientOffset();

    return (
        <div className="h-40 w-full mt-2 bg-bg-page/50 rounded-lg p-2 border border-border-color/50">
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                        <linearGradient id="splitColor" x1="0" y1="0" x2="0" y2="1">
                            <stop offset={off} stopColor="#22c55e" stopOpacity={1} />
                            <stop offset={off} stopColor="#ef4444" stopOpacity={1} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" opacity={0.5} />
                    <YAxis 
                        domain={[-domainMax, domainMax]}
                        tick={{ fontSize: 10, fill: 'var(--text-muted)' }} 
                        width={35}
                        tickFormatter={(val) => `${Math.round(val)}`}
                        allowDecimals={false}
                    />
                    <Tooltip 
                        contentStyle={{ backgroundColor: 'var(--bg-card)', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '12px' }}
                        itemStyle={{ color: 'var(--text-main)' }}
                        formatter={(value: number) => [
                            `${Math.abs(Math.round(value))} km/u`, 
                            value > 0 ? 'Mewind' : 'Tegenwind'
                        ]}
                        labelFormatter={() => ''}
                    />
                    <ReferenceLine y={0} stroke="var(--text-muted)" strokeDasharray="3 3" />
                    <Area 
                        type="monotone" 
                        dataKey="wind" 
                        stroke="#8884d8" 
                        fill="url(#splitColor)" 
                        strokeWidth={0}
                        fillOpacity={0.6}
                    />
                </AreaChart>
            </ResponsiveContainer>
            <div className="flex justify-between text-[10px] text-text-muted mt-1 px-2">
                <span className="text-red-500">Max Tegen: {Math.round(Math.abs(Math.min(...data.map(d => d.wind), 0)))} km/u</span>
                <span className="text-green-500">Max Mee: {Math.round(Math.max(...data.map(d => d.wind), 0))} km/u</span>
            </div>
        </div>
    );
};

interface Props {
    onNavigate?: (view: ViewState) => void;
}

export const BaroRitAdviesView: React.FC<Props> = ({ onNavigate }) => {
    const { user } = useAuth();
    const settings = loadSettings();
    const t = (key: string) => getTranslation(key, settings.language);

    // Helper to load state
    const getSavedState = (key: string, defaultVal: any) => {
        try {
            const saved = localStorage.getItem('baro_rit_settings');
            if (saved) {
                const parsed = JSON.parse(saved);
                return parsed[key] !== undefined ? parsed[key] : defaultVal;
            }
        } catch (e) {
            console.error("Error parsing settings", e);
        }
        return defaultVal;
    };

    // State
    const [startLocation, setStartLocation] = useState<{ lat: number; lng: number } | null>(null);
    const [returnLocation, setReturnLocation] = useState<{ lat: number; lng: number } | null>(null);
    const [selectionMode, setSelectionMode] = useState<'start' | 'return'>('start');
    const [credits, setCredits] = useState<number>(getUsage().baroCredits);

    const [distance, setDistance] = useState<number>(() => getSavedState('distance', 50));
    const [windStrategy, setWindStrategy] = useState<'headwind_first' | 'tailwind_first' | 'crosswind' | 'custom'>(() => getSavedState('windStrategy', 'headwind_first'));
    const [bendingOutbound, setBendingOutbound] = useState<number>(() => getSavedState('bendingOutbound', 0));
    const [bendingInbound, setBendingInbound] = useState<number>(() => getSavedState('bendingInbound', 0));
    const [randomnessOutbound, setRandomnessOutbound] = useState<number>(() => getSavedState('randomnessOutbound', 2));
    const [randomnessInbound, setRandomnessInbound] = useState<number>(() => getSavedState('randomnessInbound', 2));
    const [maximizeElevation, setMaximizeElevation] = useState<boolean>(() => getSavedState('maximizeElevation', false));
    const [avoidFerries, setAvoidFerries] = useState<boolean>(() => getSavedState('avoidFerries', true));
    const [surfacePreference, setSurfacePreference] = useState<'paved' | 'unpaved' | 'any'>(() => {
        // Handle legacy avoidUnpaved
        try {
            const saved = localStorage.getItem('baro_rit_settings');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed.surfacePreference) return parsed.surfacePreference;
                if (parsed.avoidUnpaved !== undefined) return parsed.avoidUnpaved ? 'paved' : 'any';
            }
        } catch (e) {}
        return 'paved';
    });
    const [shape, setShape] = useState<'loop' | 'figure8' | 'square' | 'triangle' | 'star' | 'hexagon' | 'zigzag' | 'boomerang' | 'kerstboom' | 'kerstman' | 'pashaas' | 'dieren'>(() => getSavedState('shape', 'loop'));
    const [isAdvancedOpen, setIsAdvancedOpen] = useState<boolean>(true); // Default open as requested by user implication
    
    const [loading, setLoading] = useState<boolean>(false);
    const [routeData, setRouteData] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);
    const [warning, setWarning] = useState<string | null>(null);
    const [showDetail, setShowDetail] = useState(false);
    const [currentWind, setCurrentWind] = useState<{direction: number, speed: number} | null>(null);

    // Export/Share State
    const [showFilenameModal, setShowFilenameModal] = useState(false);
    const [showAnalyzeConfirmModal, setShowAnalyzeConfirmModal] = useState(false);
    const [isAnalyzeFlow, setIsAnalyzeFlow] = useState(false);
    const [filename, setFilename] = useState("");
    const [pendingAction, setPendingAction] = useState<'download' | 'share' | null>(null);

    // Search State
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<Location[]>([]);
    const [isSearchOpen, setIsSearchOpen] = useState(false);

    // Date/Time Selection State
    const [selectedDate, setSelectedDate] = useState<string>('today'); // 'today' | 'tomorrow'
    const [selectedTime, setSelectedTime] = useState<string>(() => {
        const now = new Date();
        now.setHours(now.getHours() + 1, 0, 0, 0);
        return now.toTimeString().substring(0, 5); // "HH:MM"
    });
    const [averageSpeed, setAverageSpeed] = useState<number>(() => getSavedState('averageSpeed', 25));
    
    // Weather Data State
    const [forecastData, setForecastData] = useState<any>(null);
    const [fullHourlyWeather, setFullHourlyWeather] = useState<any>(null);
    const [isWeatherLoading, setIsWeatherLoading] = useState(false);

    // Edit Mode State
    const [isEditing, setIsEditing] = useState(false);
    const [isSnapping, setIsSnapping] = useState(false);
    const [originalRouteData, setOriginalRouteData] = useState<any>(null);
    const routeLayerRef = useRef<any>(null);

    const [chartMode, setChartMode] = useState<'elevation' | 'wind'>('elevation');
    const [sliderValue, setSliderValue] = useState<number>(0);

    // Reset slider when route changes
    useEffect(() => {
        if (routeData) {
            setSliderValue(0);
        }
    }, [routeData]);

    const getSliderPosition = () => {
        if (!routeData || !routeData.features || !routeData.features[0]) return null;
        
        try {
            const geometry = routeData.features[0].geometry;
            const line = turf.lineString(geometry.coordinates);
            const length = turf.length(line, { units: 'kilometers' });
            
            const dist = (sliderValue / 100) * length;
            const point = turf.along(line, dist, { units: 'kilometers' });
            
            // Calculate time
            const timeInMinutes = (dist / averageSpeed) * 60;
            const hours = Math.floor(timeInMinutes / 60);
            const minutes = Math.round(timeInMinutes % 60);
            
            // Format arrival time
            const [startH, startM] = selectedTime.split(':').map(Number);
            const startDate = new Date();
            startDate.setHours(startH, startM, 0, 0);
            startDate.setMinutes(startDate.getMinutes() + timeInMinutes);
            const arrivalTime = startDate.toTimeString().substring(0, 5);

            return {
                lat: point.geometry.coordinates[1],
                lng: point.geometry.coordinates[0],
                dist: dist.toFixed(1),
                time: `${hours > 0 ? `${hours}u ` : ''}${minutes}m`,
                arrivalTime
            };
        } catch (e) {
            console.warn("Error calculating slider position", e);
            return null;
        }
    };

    // Listen for credit updates
    useEffect(() => {
        const handleUsageUpdate = () => {
            setCredits(getUsage().baroCredits);
        };
        window.addEventListener('usage:updated', handleUsageUpdate);
        return () => window.removeEventListener('usage:updated', handleUsageUpdate);
    }, []);

    // Save settings when they change
    useEffect(() => {
        const settingsToSave = {
            distance,
            windStrategy,
            bendingOutbound,
            bendingInbound,
            randomnessOutbound,
            randomnessInbound,
            avoidFerries,
            surfacePreference,
            shape,
            maximizeElevation,
            averageSpeed
        };
        localStorage.setItem('baro_rit_settings', JSON.stringify(settingsToSave));
    }, [distance, windStrategy, bendingOutbound, bendingInbound, randomnessOutbound, randomnessInbound, avoidFerries, surfacePreference, shape, maximizeElevation, averageSpeed]);

    // Load user location on mount
    useEffect(() => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    setStartLocation({
                        lat: position.coords.latitude,
                        lng: position.coords.longitude
                    });
                },
                (err) => {
                    console.error("Error getting location", err);
                    // Default to Utrecht if blocked
                    setStartLocation({ lat: 52.0907, lng: 5.1214 });
                }
            );
        } else {
             setStartLocation({ lat: 52.0907, lng: 5.1214 });
        }
    }, []);

    // Fetch weather and wind for start location
    useEffect(() => {
        if (!startLocation) return;
        
        const fetchWeather = async () => {
            setIsWeatherLoading(true);
            try {
                // Determine target timestamp
                const targetDate = new Date();
                
                if (selectedDate === 'tomorrow') {
                    targetDate.setDate(targetDate.getDate() + 1);
                }
                
                const [h, m] = selectedTime.split(':').map(Number);
                targetDate.setHours(h, m, 0, 0);

                const isoDate = targetDate.toISOString().split('T')[0];
                const hourIndex = targetDate.getHours();

                // Fetch comprehensive weather data
                const url = `https://api.open-meteo.com/v1/forecast?latitude=${startLocation.lat}&longitude=${startLocation.lng}&hourly=temperature_2m,apparent_temperature,precipitation_probability,relative_humidity_2m,wind_speed_10m,wind_direction_10m,weather_code,cloud_cover&daily=sunrise,sunset&start_date=${isoDate}&end_date=${isoDate}&timezone=auto`;
                
                // Use throttledFetch to track usage (Standard weather credits)
                const data = await throttledFetch(url);
                
                if (data.hourly) {
                    setFullHourlyWeather(data.hourly);
                    
                    // Set current wind for map/markers
                    setCurrentWind({
                        direction: data.hourly.wind_direction_10m[hourIndex],
                        speed: data.hourly.wind_speed_10m[hourIndex]
                    });

                    // Set detailed forecast data
                    setForecastData({
                        temp: data.hourly.temperature_2m[hourIndex],
                        feelsLike: data.hourly.apparent_temperature[hourIndex],
                        precipProb: data.hourly.precipitation_probability[hourIndex],
                        humidity: data.hourly.relative_humidity_2m[hourIndex],
                        windSpeed: data.hourly.wind_speed_10m[hourIndex],
                        windDir: data.hourly.wind_direction_10m[hourIndex],
                        weatherCode: data.hourly.weather_code[hourIndex],
                        cloudCover: data.hourly.cloud_cover[hourIndex],
                        sunrise: data.daily?.sunrise?.[0],
                        sunset: data.daily?.sunset?.[0],
                        utcOffset: data.utc_offset_seconds
                    });
                }
            } catch (e) {
                console.error("Failed to fetch weather data", e);
            } finally {
                setIsWeatherLoading(false);
            }
        };
        fetchWeather();
    }, [startLocation, selectedDate, selectedTime]);

    // Search Logic
    useEffect(() => {
        const delayDebounceFn = setTimeout(async () => {
            if (searchQuery.length > 2) {
                const results = await searchCityByName(searchQuery);
                setSearchResults(results);
                setIsSearchOpen(true);
            } else {
                setSearchResults([]);
                setIsSearchOpen(false);
            }
        }, 500);

        return () => clearTimeout(delayDebounceFn);
    }, [searchQuery]);

    const handleSelectLocation = (loc: Location) => {
        if (windStrategy === 'custom' && selectionMode === 'return') {
            setReturnLocation({ lat: loc.lat, lng: loc.lon });
        } else {
            setStartLocation({ lat: loc.lat, lng: loc.lon });
        }
        setSearchQuery('');
        setIsSearchOpen(false);
    };

    const handleMapClick = (lat: number, lng: number) => {
        if (windStrategy === 'custom' && selectionMode === 'return') {
            setReturnLocation({ lat, lng });
        } else {
            setStartLocation({ lat, lng });
        }
    };

    const handleCalculate = async () => {
        if (!startLocation) return;
        
        // Credit Check Pre-flight (Frontend)
        // If logged in but no credits, show warning immediately to save a call
        // If not logged in, we let it fail at backend or handle it here?
        // User requirement: "Als je geen baro credits hebt..." -> "baro credits nodig"
        
        if (auth.currentUser) {
            // We can check local stats if available, but backend is source of truth
            if (!hasBaroCredits()) {
                setError("Baro credits nodig om routes te berekenen.");
                return;
            }
        } else {
             // Not logged in -> "Niet geautoriseerd" logic via backend or explicit here
             // User said: "Als je niet bent ingelogd: Je krijgt een melding 'Niet geautoriseerd...'"
             // Wait, user said: "Als je geen baro credits hebt... baro credits nodig"
             // Let's assume backend handles the exact messaging for consistency
        }

        setLoading(true);
        setError(null);
        setWarning(null);
        setRouteData(null);

        try {
            const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
            const headers: HeadersInit = { 'Content-Type': 'application/json' };
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }

            const response = await fetch('/.netlify/functions/calculate-route', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    startLocation,
                    returnLocation: windStrategy === 'custom' ? returnLocation : undefined,
                    distance: windStrategy === 'custom' ? undefined : distance,
                    windStrategy,
                    bendingOutbound,
                    bendingInbound,
                    randomnessOutbound,
                    randomnessInbound,
                    maximizeElevation,
                    surfacePreference,
                    shape,
                    dateTime: { date: selectedDate, time: selectedTime },
                    options: {
                        avoidFeatures: [
                            ...(avoidFerries ? ['ferries'] : [])
                        ]
                    }
                })
            });

            if (!response.ok) {
                let errorMessage = 'Failed to calculate route';
                try {
                    const errorData = await response.json();
                    errorMessage = errorData.error || errorData.message || errorMessage;
                } catch (e) {
                    errorMessage = await response.text();
                }
                throw new Error(errorMessage);
            }

            const data = await response.json();
            
            // Check for warnings in the GeoJSON properties
            if (data.features && data.features.length > 0 && data.features[0].properties.warning) {
                setWarning(data.features[0].properties.warning);
            }

            // Simplify to reduce waypoints for better editing performance
            try {
                if (data.features && data.features.length > 0) {
                     turf.simplify(data, {tolerance: 0.0001, highQuality: false, mutate: true});
                }
            } catch(e) {
                console.warn("Simplification failed", e);
            }

            setRouteData(data);
            
            // Deduct credit only on success
            trackBaroCall();
            
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDownloadClick = () => {
        const routeDistance = routeData ? (routeData.features[0].properties.summary.distance / 1000).toFixed(0) : distance;
        
        // Determine date string
        let dateStr = "";
        const now = new Date();
        if (selectedDate === 'tomorrow') {
            now.setDate(now.getDate() + 1);
        }
        // Format: yyyy-MMM-dd (e.g. 2023-Jan-24)
        const year = now.getFullYear();
        const month = now.toLocaleString('default', { month: 'short' });
        const day = String(now.getDate()).padStart(2, '0');
        dateStr = `${year}-${month}-${day}`;

        setFilename(`Baro-Route-${routeDistance}km-${dateStr}`);
        setPendingAction('download');
        setShowFilenameModal(true);
    };

    const handleShareClick = () => {
        const routeDistance = routeData ? (routeData.features[0].properties.summary.distance / 1000).toFixed(0) : distance;
        
        // Determine date string
        let dateStr = "";
        const now = new Date();
        if (selectedDate === 'tomorrow') {
            now.setDate(now.getDate() + 1);
        }
        const year = now.getFullYear();
        const month = now.toLocaleString('default', { month: 'short' });
        const day = String(now.getDate()).padStart(2, '0');
        dateStr = `${year}-${month}-${day}`;

        setFilename(`Baro-Route-${routeDistance}km-${dateStr}`);
        setPendingAction('share');
        setShowFilenameModal(true);
    };

    const handleCopyClick = () => {
         if (!routeData) return;
         try {
            const gpx = generateGpx(routeData, `Baro Route ${distance}km`);
            navigator.clipboard.writeText(gpx).then(() => {
                // Visual feedback is handled in the UI button
                alert("GPX gekopieerd naar klembord!");
            });
         } catch(e) {
             setError("Kopiëren mislukt");
         }
    };

    const handleAnalyzeClick = () => {
        if (!routeData) return;
        setShowAnalyzeConfirmModal(true);
    };

    const simplifyRouteForEdit = (routeFeature: any) => {
        if (!routeFeature?.geometry?.coordinates || !Array.isArray(routeFeature.geometry.coordinates)) return routeFeature;

        const targetMax = 25; // Hard limit for editing as requested
        let current = routeFeature;
        let currentCount = routeFeature.geometry.coordinates.length;
        if (currentCount <= targetMax) return routeFeature;

        let tolerance = 0.0001;
        let attempts = 0;

        while (currentCount > targetMax && attempts < 8) {
            const next = turf.simplify(current, { tolerance, highQuality: true });
            const nextCount = next?.geometry?.coordinates?.length ?? currentCount;

            if (nextCount >= currentCount) {
                tolerance = tolerance * 1.6;
                attempts += 1;
                continue;
            }

            current = next;
            currentCount = nextCount;
            tolerance = tolerance * 1.3;
            attempts += 1;
        }

        return current;
    };

    // Edit Handlers
    const handleStartEdit = () => {
        setOriginalRouteData(JSON.parse(JSON.stringify(routeData))); // Deep copy
        
        if (routeData && routeData.features && routeData.features[0]) {
             try {
                 const simplified = simplifyRouteForEdit(routeData.features[0]);
                 const newRouteData = { ...routeData, features: [simplified] };
                 setRouteData(newRouteData);
             } catch (e) {
                 console.error("Error simplifying route", e);
             }
        }
        
        setIsEditing(true);
    };

    const handleCancelEdit = () => {
        setRouteData(originalRouteData);
        setIsEditing(false);
        setOriginalRouteData(null);
    };

    const handleSaveEdit = () => {
        setIsEditing(false);
        setOriginalRouteData(null);
        // Recalculate stats based on new route is handled by updateRouteData if we snapped,
        // otherwise assume user accepts geometric modifications.
        if (routeLayerRef.current) {
             const latLngs = routeLayerRef.current.getLatLngs();
             const coords = Array.isArray(latLngs[0]) ? latLngs.flat().map((ll:any) => [ll.lng, ll.lat]) : latLngs.map((ll:any) => [ll.lng, ll.lat]);
             
             // Update routeData geometry
             const newData = { ...routeData };
             newData.features[0].geometry.coordinates = coords;
             
             // Simple distance update
             const line = turf.lineString(coords);
             const dist = turf.length(line, { units: 'kilometers' });
             newData.features[0].properties.summary.distance = dist * 1000;
             newData.features[0].properties.summary.duration = (dist / averageSpeed) * 3600;
             
             setRouteData(newData);
        }
    };

    const handleSnapToRoad = async () => {
        if (!routeLayerRef.current) return;
        setIsSnapping(true);
        try {
            const latLngs = routeLayerRef.current.getLatLngs();
            // Handle potentially nested arrays (Leaflet Polyline)
            const flatLatLngs = (Array.isArray(latLngs) && latLngs.length > 0 && Array.isArray(latLngs[0])) 
                ? (latLngs as any).flat(Infinity) 
                : latLngs;
                
            const allCoords = flatLatLngs.map((ll: any) => [ll.lng, ll.lat]);
            
            // Filter to reduce points
            const maxPoints = 25; // Limit to 25 points as requested
            const step = Math.max(1, Math.floor(allCoords.length / maxPoints));
            const filteredCoords = allCoords.filter((_, i) => i === 0 || i === allCoords.length - 1 || i % step === 0);

            const response = await fetch('/.netlify/functions/calculate-route', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    waypoints: filteredCoords,
                    surfacePreference,
                    options: { avoid_features: avoidFerries ? ['ferries'] : [] }
                })
            });
            
            const data = await response.json();
            if (data.error) {
                setError(data.message || "Fout bij snap to road");
            } else if (data.features && data.features.length > 0) {
                 const newFeatures = data.features[0];
                 // Merge wind properties if missing
                 if (!newFeatures.properties.wind && routeData?.features[0]?.properties?.wind) {
                     newFeatures.properties.wind = routeData.features[0].properties.wind;
                 }
                 
                 const newData = {
                     ...data,
                     features: [newFeatures]
                 };
                 
                 // Simplify to reduce waypoints
                 try {
                     turf.simplify(newData, {tolerance: 0.0001, highQuality: false, mutate: true});
                 } catch(e) {
                     console.warn("Simplification failed", e);
                 }

                 setRouteData(newData);
                 setIsEditing(false); // Exit edit mode to show new route
            }
        } catch (e) {
            console.error(e);
            setError("Fout bij verbinden met server");
        } finally {
            setIsSnapping(false);
        }
    };

    const performAnalyze = () => {
         try {
             const gpx = generateGpx(routeData, `Baro Route ${distance}km`);
             sessionStorage.setItem('baro_analyze_gpx', gpx);
             sessionStorage.setItem('baro_analyze_date', selectedDate);
             sessionStorage.setItem('baro_analyze_time', selectedTime);
             
             if (onNavigate) {
                 onNavigate(ViewState.TRIP_PLANNER);
             }
        } catch(e) {
            setError("Fout bij voorbereiden analyse");
        }
    };

    const handleAnalyzeConfirm = (save: boolean) => {
        setShowAnalyzeConfirmModal(false);
        if (save) {
            setIsAnalyzeFlow(true);
            const routeDistance = routeData ? (routeData.features[0].properties.summary.distance / 1000).toFixed(0) : distance;
            
            // Determine date string
            let dateStr = "";
            const now = new Date();
            if (selectedDate === 'tomorrow') {
                now.setDate(now.getDate() + 1);
            }
            const year = now.getFullYear();
            const month = now.toLocaleString('default', { month: 'short' });
            const day = String(now.getDate()).padStart(2, '0');
            dateStr = `${year}-${month}-${day}`;

            setFilename(`Baro-Route-${routeDistance}km-${dateStr}`);
            setPendingAction('download');
            setShowFilenameModal(true);
        } else {
            performAnalyze();
        }
    };

    const handleConfirmAction = async () => {
        if (!routeData) return;
        
        try {
            const safeName = filename.replace(/[^a-z0-9\-_ ]/gi, '_');
            const gpx = generateGpx(routeData, filename);
            const fileNameWithExt = safeName.toLowerCase().endsWith('.gpx') ? safeName : `${safeName}.gpx`;

            const blob = new Blob([gpx], { type: 'application/gpx+xml' });
            const file = new File([blob], fileNameWithExt, { type: 'application/gpx+xml' });

            if (pendingAction === 'download') {
                 const url = URL.createObjectURL(blob);
                 const a = document.createElement('a');
                 a.href = url;
                 a.download = fileNameWithExt;
                 document.body.appendChild(a);
                 a.click();
                 document.body.removeChild(a);
                 URL.revokeObjectURL(url);
            } else if (pendingAction === 'share') {
                if (navigator.canShare && navigator.canShare({ files: [file] })) {
                    try {
                        await navigator.share({
                            title: 'Baro Route',
                            text: `Route van ${distance}km met windvoordeel`,
                            files: [file]
                        });
                    } catch (shareError: any) {
                        if (shareError.name !== 'AbortError') {
                             console.error("Share failed", shareError);
                             // Fallback to download if share fails (except user cancellation)
                             if (confirm("Delen is mislukt. Wil je het bestand downloaden?")) {
                                 const url = URL.createObjectURL(blob);
                                 const a = document.createElement('a');
                                 a.href = url;
                                 a.download = fileNameWithExt;
                                 document.body.appendChild(a);
                                 a.click();
                                 document.body.removeChild(a);
                                 URL.revokeObjectURL(url);
                             }
                        }
                    }
                } else {
                    // Fallback for devices that don't support file sharing
                    if (confirm("Delen van bestanden wordt niet ondersteund. Wil je het bestand downloaden?")) {
                         const url = URL.createObjectURL(blob);
                         const a = document.createElement('a');
                         a.href = url;
                         a.download = fileNameWithExt;
                         document.body.appendChild(a);
                         a.click();
                         document.body.removeChild(a);
                         URL.revokeObjectURL(url);
                    }
                }
            }
            
            // If this was part of the analyze flow, continue to analyze
            if (isAnalyzeFlow) {
                performAnalyze();
            }

        } catch (e) {
            console.error("Error converting/sharing GPX", e);
            setError("Fout bij verwerken GPX");
        } finally {
            setShowFilenameModal(false);
            setPendingAction(null);
            setIsAnalyzeFlow(false);
        }
    };

    // Process Elevation Data
    const elevationData = React.useMemo(() => {
        if (!routeData || !routeData.features[0]) return [];
        const coords = routeData.features[0].geometry.coordinates;
        // Sample to max 100 points for chart
        const step = Math.max(1, Math.ceil(coords.length / 100));
        return coords.filter((_: any, i: number) => i % step === 0).map((c: number[], i: number) => ({
            dist: i, 
            ele: c[2] || 0
        }));
    }, [routeData]);

    // Process Wind Data
    const windGraphData = React.useMemo(() => {
        if (!routeData || !routeData.features[0] || (!currentWind && !routeData.features[0].properties.wind)) return [];
        
        const coords = routeData.features[0].geometry.coordinates;
        // Use wind from route or currentWind
        const windDir = routeData.features[0].properties.wind?.direction || currentWind?.direction || 0;
        const windSpeed = routeData.features[0].properties.wind?.speed || currentWind?.speed || 0;
        
        // Sample to max 100 points
        const step = Math.max(1, Math.ceil(coords.length / 100));
        
        return coords.filter((_: any, i: number) => i % step === 0).map((c: number[], i: number, arr: any[]) => {
            // Calculate bearing
            let bearing = 0;
            // Original index is i * step (roughly, but arr is filtered... wait. map callback i is index in filtered array)
            // But here coords.filter creates a new array.
            // So i is index in filtered array.
            
            if (i < arr.length - 1) {
                const p1 = turf.point([c[0], c[1]]);
                const next = arr[i+1];
                const p2 = turf.point([next[0], next[1]]);
                bearing = turf.bearing(p1, p2);
            } else if (i > 0) {
                const prev = arr[i-1];
                const p1 = turf.point([prev[0], prev[1]]);
                const p2 = turf.point([c[0], c[1]]);
                bearing = turf.bearing(p1, p2);
            }
            
            // Wind Direction (FROM)
            // Blowing towards = WindDir + 180
            const windVectorAngle = (windDir + 180) % 360;
            
            // Bearing (-180 to 180) -> 0-360
            const bearing360 = (bearing + 360) % 360;
            
            // Angle difference
            const diff = windVectorAngle - bearing360;
            const diffRad = (diff * Math.PI) / 180;
            
            // Component: Positive = Tailwind, Negative = Headwind
            const component = windSpeed * Math.cos(diffRad);
            
            return {
                dist: i,
                wind: component
            };
        });
    }, [routeData, currentWind]);

    const getEndTime = (startTime: string, distanceMeters: number, speedKmh: number) => {
        const [h, m] = startTime.split(':').map(Number);
        const date = new Date();
        date.setHours(h, m, 0, 0);
        
        const durationHours = (distanceMeters / 1000) / speedKmh;
        const durationMs = durationHours * 60 * 60 * 1000;
        
        const endDate = new Date(date.getTime() + durationMs);
        return endDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    };

    // Process Surface Info
            const surfaceInfo = React.useMemo(() => {
        if (!routeData?.features?.[0]?.properties?.extras?.surface?.summary) return null;
        
        const summary = routeData.features[0].properties.extras.surface.summary;
        let paved = 0;
        let unpaved = 0;
        let unknown = 0;
        
        const pavedCodes = [1, 3, 4, 5, 6, 7];
        const unpavedCodes = [2, 8, 9, 10, 11, 12, 13, 14, 15, 16];
        
        summary.forEach((item: any) => {
            if (pavedCodes.includes(item.value)) {
                paved += item.distance;
            } else if (unpavedCodes.includes(item.value)) {
                unpaved += item.distance;
            } else {
                unknown += item.distance;
            }
        });
        
        const total = paved + unpaved + unknown;
        if (total === 0) return null;

        const toPct = (v: number) => Math.round((v / total) * 100);
        let pavedPct = toPct(paved);
        let unpavedPct = toPct(unpaved);
        let unknownPct = toPct(unknown);
        const diff = 100 - (pavedPct + unpavedPct + unknownPct);
        if (diff !== 0) {
            if (pavedPct >= unpavedPct && pavedPct >= unknownPct) pavedPct += diff;
            else if (unpavedPct >= unknownPct) unpavedPct += diff;
            else unknownPct += diff;
        }

        return {
            pavedPct,
            unpavedPct,
            unknownPct
        };
            }, [routeData]);

            const formatWaytypeLabel = (value: number) => {
                switch(value) {
                    case 0: return 'Onbekend';
                    case 1: return 'Snelweg'; // State Road
                    case 2: return 'Provinciale weg'; // Road
                    case 3: return 'Straat'; // Street
                    case 4: return 'Fietspad'; // Path
                    case 5: return 'Pad'; // Track
                    case 6: return 'Fietspad'; // Cycleway
                    case 7: return 'Voetpad'; // Footway
                    case 8: return 'Trap'; // Steps
                    case 9: return 'Veerpont'; // Ferry
                    case 10: return 'In aanbouw'; // Construction
                    default: return `Categorie ${value}`;
                }
            };

            const waytypeInfo = React.useMemo(() => {
                const summary = routeData?.features?.[0]?.properties?.extras?.waytype?.summary
                    || routeData?.features?.[0]?.properties?.extras?.waytypes?.summary;

                if (!summary || !Array.isArray(summary) || summary.length === 0) return null;

                const total = summary.reduce((sum: number, item: any) => sum + (item.distance || 0), 0);
                if (!total) return null;

                return summary
                    .map((item: any) => ({
                        value: item.value,
                        label: formatWaytypeLabel(item.value),
                        pct: Math.round((item.distance / total) * 100)
                    }))
                    .filter((item: any) => item.pct > 0)
                    .sort((a: any, b: any) => b.pct - a.pct);
            }, [routeData]);

            const steepnessInfo = React.useMemo(() => {
                const summary = routeData?.features?.[0]?.properties?.extras?.steepness?.summary;
                if (!summary || !Array.isArray(summary) || summary.length === 0) return null;

                const total = summary.reduce((sum: number, item: any) => sum + (item.distance || 0), 0);
                if (!total) return null;

                return summary
                    .map((item: any) => ({
                        value: item.value,
                        pct: Math.round((item.distance / total) * 100)
                    }))
                    .filter((item: any) => item.pct > 0)
                    .sort((a: any, b: any) => b.pct - a.pct);
            }, [routeData]);

            const formatSteepnessLabel = (value: number) => {
                if (value === 0) return 'Vlak';
                const abs = Math.abs(value);
                let intensity = 'Licht';
                if (abs >= 4) intensity = 'Zeer steil';
                else if (abs >= 3) intensity = 'Steil';
                else if (abs >= 2) intensity = 'Matig';
                const direction = value > 0 ? 'stijgend' : 'dalend';
                return `${intensity} ${direction}`;
            };

    // Check for daylight
    const daylightInfo = React.useMemo(() => {
        if (!forecastData || !forecastData.sunrise || !forecastData.sunset || !routeData) return null;

        const [h, m] = selectedTime.split(':').map(Number);
        const start = new Date();
        start.setHours(h, m, 0, 0);
        
        const durationHours = (routeData.features[0].properties.summary.distance / 1000) / averageSpeed;
        const end = new Date(start.getTime() + durationHours * 60 * 60 * 1000);

        // Convert browser local times to "shifted UTC" for comparison with API local times
        const browserOffset = start.getTimezoneOffset() * -60;
        const startShifted = new Date(start.getTime() - browserOffset * 1000 + (forecastData.utcOffset || 0) * 1000);
        const endShifted = new Date(end.getTime() - browserOffset * 1000 + (forecastData.utcOffset || 0) * 1000);

        const sunrise = new Date(forecastData.sunrise + 'Z');
        const sunset = new Date(forecastData.sunset + 'Z');

        // Define Twilight Duration (e.g. 30 mins before sunrise / after sunset)
        const TWILIGHT_MS = 30 * 60 * 1000;

        let warning = null;
        let scorePenalty = 0;
        let isCritical = false;

        // 1. Start Check (Compare shifted times using UTC methods)
        if (startShifted.getTime() < sunrise.getTime() - TWILIGHT_MS) {
            // Started way before sunrise (Dark)
            warning = "Let op: Je start in het donker (voor zonsopkomst).";
            scorePenalty += 2;
            isCritical = true;
        } else if (startShifted.getTime() < sunrise.getTime()) {
            // Started in twilight (between twilight start and sunrise)
            warning = "Tip: Je start tijdens de schemering (vlak voor zonsopkomst).";
            scorePenalty += 1;
        }

        // 2. End Check
        if (endShifted.getTime() > sunset.getTime() + TWILIGHT_MS) {
             // Finished way after sunset (Dark)
            const msg = "Let op: Je finisht in het donker (na zonsondergang).";
            warning = warning ? `${warning} En je finisht in het donker.` : msg;
            scorePenalty += 2;
            isCritical = true;
        } else if (endShifted.getTime() > sunset.getTime()) {
             // Finished in twilight
             const msg = "Tip: Je finisht tijdens de schemering (vlak na zonsondergang).";
             warning = warning ? `${warning} En je finisht in de schemering.` : msg;
             scorePenalty += 1;
        }

        return warning ? { warning, scorePenalty, isCritical } : null;

    }, [forecastData, selectedTime, routeData, averageSpeed]);

    return (
        <div className="flex flex-col h-full bg-bg-page overflow-y-auto text-text-main">
            {/* 1. Header (Similar to CyclingView) */}
            <div className="flex-none p-4 md:p-6 bg-bg-card border-b border-border-color flex items-center gap-4 sticky top-0 z-20 shadow-sm">
                <button 
                    onClick={() => onNavigate && onNavigate(ViewState.CURRENT)}
                    className="p-2 -ml-2 rounded-full hover:bg-bg-page transition-colors text-text-muted"
                >
                    <Icon name="arrow_back" />
                </button>
                <div className="flex-1">
                    <h1 className="text-xl font-bold text-text-main flex items-center gap-2">
                        <Icon name="alt_route" className="text-indigo-500" />
                        {t('baro_rit_advies.title')}
                        <span className="text-xs font-normal bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded-full border border-indigo-200 dark:border-indigo-800">
                            1 Baro
                        </span>
                    </h1>
                    <p className="text-xs text-text-muted">{t('baro_rit_advies.subtitle')}</p>
                </div>
                
                {/* Credits Display */}
                <div className="hidden sm:flex items-center gap-2">
                    <div className={`px-3 py-1.5 rounded-full text-xs font-bold border flex items-center gap-1.5 ${credits > 0 ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800' : 'bg-red-50 dark:bg-red-900/20 text-red-600 border-red-200 dark:border-red-800'}`}>
                        <Icon name="token" className="text-sm" />
                        <span>{credits} Credits</span>
                    </div>
                </div>
            </div>
            
            {/* Intro text removed */}

            {/* 2. Map & Search Area (Full Width) */}
            <div className="w-full h-[40vh] md:h-[50vh] relative z-10">
                 {!isEditing && (
                    <div className="absolute top-4 left-14 right-4 md:left-auto md:right-4 md:w-80 z-[1000]">
                        <div className="relative">
                            <input
                                type="text"
                                placeholder={t('baro_rit_advies.search_placeholder')}
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-10 pr-4 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                            />
                            <Icon name="search" className="absolute left-3 top-3.5 text-gray-400" />
                            
                            {isSearchOpen && searchResults.length > 0 && (
                                <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 max-h-60 overflow-y-auto">
                                    {searchResults.map((result, idx) => (
                                        <button
                                            key={`${result.lat}-${result.lon}-${idx}`}
                                            onClick={() => handleSelectLocation(result)}
                                            className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 border-b last:border-0 border-gray-100 dark:border-gray-700 transition-colors"
                                        >
                                            <div className="font-medium text-sm">{result.name}</div>
                                            <div className="text-xs text-gray-500">{result.country}</div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                 )}

                 {/* Edit Button */}
                 {routeData && !isEditing && (
                    <div className="absolute top-20 right-4 z-[1000]">
                         <button
                            onClick={handleStartEdit}
                            className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 text-text-main rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors font-medium text-sm"
                        >
                            <span className="text-lg">✏️</span> {t('baro_rit_advies.edit_route')}
                        </button>
                    </div>
                 )}

                 {/* Edit Controls Overlay */}
                 {isEditing && (
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[2000] flex flex-col items-center gap-2 animate-in fade-in slide-in-from-top-4">
                        <div className="flex items-center gap-2 bg-white dark:bg-gray-800 p-2 rounded-2xl shadow-xl border border-indigo-500">
                            <button
                                onClick={handleSnapToRoad}
                                disabled={isSnapping}
                                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold transition-colors ${isSnapping ? 'bg-gray-100 text-gray-400' : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'}`}
                            >
                                {isSnapping ? <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full"/> : <span>🧲</span>}
                                {t('baro_rit_advies.snap_to_road')}
                            </button>
                            <div className="w-px h-6 bg-gray-200 dark:bg-gray-700 mx-1" />
                            <button
                                onClick={handleCancelEdit}
                                className="px-3 py-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl text-sm font-medium transition-colors"
                            >
                                {t('baro_rit_advies.cancel')}
                            </button>
                            <button
                                onClick={handleSaveEdit}
                                className="px-4 py-2 bg-indigo-600 text-white hover:bg-indigo-700 rounded-xl text-sm font-bold shadow-md transition-colors"
                            >
                                {t('baro_rit_advies.done')}
                            </button>
                        </div>
                        <div className="bg-bg-card/90 px-3 py-1 rounded-full text-xs font-bold text-text-main shadow-sm backdrop-blur-sm border border-border-color/20">
                            {t('baro_rit_advies.edit_tip')}
                        </div>
                    </div>
                 )}

                {startLocation ? (
                    <MapContainer 
                        center={[startLocation.lat, startLocation.lng]} 
                        zoom={11} 
                        style={{ height: '100%', width: '100%' }}
                    >
                        <LayersControl position="bottomright">
                            <LayersControl.BaseLayer checked name="Standaard">
                                <TileLayer
                                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                />
                            </LayersControl.BaseLayer>
                            <LayersControl.BaseLayer name="Donker">
                                <TileLayer
                                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                                    url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                                />
                            </LayersControl.BaseLayer>
                            <LayersControl.BaseLayer name="Satelliet">
                                <TileLayer
                                    attribution='Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
                                    url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                                />
                            </LayersControl.BaseLayer>
                        </LayersControl>
                        
                        <Marker position={[startLocation.lat, startLocation.lng]}>
                            <Popup>{t('baro_rit_advies.start_point')}</Popup>
                        </Marker>

                        {returnLocation && (
                            <Marker position={[returnLocation.lat, returnLocation.lng]}>
                                <Popup>{t('baro_rit_advies.return_point')}</Popup>
                            </Marker>
                        )}
                        
                        <LocationSelector onSelect={handleMapClick} />

                        {routeData && (
                            <>
                                <GeoJSONRoute data={routeData} layerRef={routeLayerRef} />
                                <RouteEditor isEditing={isEditing} layerRef={routeLayerRef} />
                                {currentWind && !isEditing && (
                                    <WindMarkers 
                                        data={routeData} 
                                        wind={{
                                            direction: routeData.features[0].properties.wind?.direction || currentWind.direction,
                                            speed: routeData.features[0].properties.wind?.speed || currentWind.speed
                                        }} 
                                        unit={settings.windUnit || WindUnit.KMH}
                                    />
                                )}
                                
                                {/* Slider Marker */}
                                {(() => {
                                    const pos = getSliderPosition();
                                    if (pos) {
                                        return (
                                            <Marker position={[pos.lat, pos.lng]} icon={SliderIcon} zIndexOffset={1000}>
                                                <Popup autoClose={false} closeOnClick={false}>
                                                    <div className="text-center min-w-[100px]">
                                                        <div className="font-bold text-sm">{pos.dist} km</div>
                                                        <div className="text-xs">{pos.time} onderweg</div>
                                                        <div className="text-[10px] text-gray-500 mt-1">🕒 {pos.arrivalTime}</div>
                                                    </div>
                                                </Popup>
                                            </Marker>
                                        );
                                    }
                                    return null;
                                })()}
                            </>
                        )}
                        
                        <MapRecenter center={[startLocation.lat, startLocation.lng]} />
                    </MapContainer>
                ) : (
                    <div className="flex items-center justify-center h-full bg-gray-100 dark:bg-gray-900">
                        <div className="text-center text-text-muted">
                            <div className="animate-spin rounded-full h-8 w-8 border-4 border-indigo-600 border-t-transparent mx-auto mb-2"></div>
                            <p>{t('baro_rit_advies.locating')}</p>
                        </div>
                    </div>
                )}
                
                {!isEditing && (
                    <div className="absolute bottom-2 left-4 z-[900] bg-bg-card/80 px-3 py-1 rounded-full text-xs text-text-muted pointer-events-none backdrop-blur-sm border border-border-color/10">
                        {t('baro_rit_advies.map_click_hint')}
                    </div>
                )}
            </div>

            {/* Slider Control */}
            {routeData && (
                <div className="bg-bg-card border-b border-border-color p-4 shadow-sm z-20 relative">
                     <div className="max-w-4xl mx-auto">
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-sm font-bold text-text-main flex items-center gap-2">
                                ⏱️ {t('baro_rit_advies.route_timeline')}
                            </span>
                            <span className="text-xs font-mono bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 px-2 py-1 rounded">
                                {getSliderPosition()?.arrivalTime || '--:--'}
                            </span>
                        </div>
                        <input
                            type="range"
                            min="0"
                            max="100"
                            step="0.1"
                            value={sliderValue}
                            onChange={(e) => setSliderValue(Number(e.target.value))}
                            className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                        />
                        <div className="flex justify-between text-[10px] text-text-muted mt-1">
                            <span>{t('baro_rit_advies.start_label')} {selectedTime}</span>
                            <span>{getSliderPosition()?.dist || '0'} km</span>
                        </div>
                        <div className="text-[10px] text-center text-text-muted -mt-4 pointer-events-none">
                             {t('baro_rit_advies.en_route')}
                        </div>
                     </div>
                </div>
            )}

            {/* 3. Settings & Results (Below Map) */}
            <div className="flex-1 bg-bg-page p-4 md:p-8">
                <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8">
                    
                    {/* Left Column: Settings */}
                    <div className="space-y-6">
                        <h3 className="font-bold text-lg text-text-main flex items-center gap-2">
                            <Icon name="tune" /> {t('baro_rit_advies.settings')}
                        </h3>
                        
                         {/* Distance */}
                        <div className={`bg-bg-card p-4 rounded-xl border border-border-color ${windStrategy === 'custom' ? 'opacity-50 pointer-events-none' : ''} ${!forecastData ? 'opacity-50 pointer-events-none' : ''}`}>
                            <div className="flex justify-between mb-2">
                                <label className="text-sm font-medium text-text-main">{t('baro_rit_advies.distance_approx')}</label>
                                <span className="text-sm font-bold text-indigo-600">{distance} km</span>
                            </div>
                            <input 
                                type="range" 
                                min="25" 
                                max="200" 
                                step="5" 
                                value={distance} 
                                onChange={(e) => setDistance(Number(e.target.value))}
                                disabled={windStrategy === 'custom'}
                                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                            />
                        </div>

                        {/* Average Speed */}
                        <div className={`bg-bg-card p-4 rounded-xl border border-border-color ${windStrategy === 'custom' ? 'opacity-50 pointer-events-none' : ''}`}>
                            <div className="flex justify-between mb-2">
                                <label className="text-sm font-medium text-text-main">{t('baro_rit_advies.avg_speed')}</label>
                                <span className="text-sm font-bold text-indigo-600">{averageSpeed} km/u</span>
                            </div>
                            <input 
                                type="range" 
                                min="15" 
                                max="45" 
                                step="1" 
                                value={averageSpeed} 
                                onChange={(e) => setAverageSpeed(Number(e.target.value))}
                                disabled={windStrategy === 'custom'}
                                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                            />
                        </div>

                        {/* Date & Time Selection */}
                        <div className="bg-bg-card p-4 rounded-xl border border-border-color">
                            <div className="flex justify-between items-center mb-3">
                                <label className="text-sm font-medium text-text-main flex items-center gap-2">
                                    <Icon name="schedule" /> {t('baro_rit_advies.departure')}
                                </label>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="flex bg-bg-page rounded-lg p-1 border border-border-color">
                                    <button 
                                        onClick={() => setSelectedDate('today')}
                                        className={`flex-1 py-1.5 rounded-md text-xs font-bold transition-colors ${selectedDate === 'today' ? 'bg-indigo-600 text-white shadow-sm' : 'text-text-muted hover:text-text-main'}`}
                                    >
                                        {t('baro_rit_advies.today')}
                                    </button>
                                    <button 
                                        onClick={() => setSelectedDate('tomorrow')}
                                        className={`flex-1 py-1.5 rounded-md text-xs font-bold transition-colors ${selectedDate === 'tomorrow' ? 'bg-indigo-600 text-white shadow-sm' : 'text-text-muted hover:text-text-main'}`}
                                    >
                                        {t('baro_rit_advies.tomorrow')}
                                    </button>
                                </div>
                                <select 
                                    value={selectedTime}
                                    onChange={(e) => setSelectedTime(e.target.value)}
                                    className="bg-bg-page text-text-main text-sm rounded-lg px-3 py-1.5 border border-border-color focus:ring-1 focus:ring-indigo-500 outline-none cursor-pointer"
                                >
                                    {Array.from({ length: 24 }).map((_, i) => {
                                        const h = i.toString().padStart(2, '0');
                                        return <option key={i} value={`${h}:00`}>{h}:00</option>
                                    })}
                                </select>
                            </div>
                        </div>

                        {/* Weather Details Card - Removed (Moved to Right Column) */}

                        {/* Wind Strategy */}
                        <div className={`bg-bg-card p-4 rounded-xl border border-border-color ${!forecastData ? 'opacity-50 pointer-events-none' : ''}`}>
                            <div className="flex justify-between items-center mb-3">
                                <label className="text-sm font-medium text-text-main">{t('baro_rit_advies.wind_strategy')}</label>
                                {currentWind && (
                                    <div className="flex items-center gap-1 text-xs text-text-muted bg-bg-page px-2 py-1 rounded-lg">
                                        <Icon name="air" className="text-sm" />
                                        <span>{convertWind(currentWind.speed, settings.windUnit || WindUnit.KMH)} {settings.windUnit || 'km/u'}</span>
                                        <div style={{transform: `rotate(${currentWind.direction}deg)`}} className="flex items-center justify-center">
                                            <Icon name="arrow_downward" className="text-sm" />
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="grid grid-cols-1 gap-2">
                                <button 
                                    onClick={() => setWindStrategy('headwind_first')}
                                    className={`flex items-center gap-3 p-3 rounded-xl border text-sm transition-all ${windStrategy === 'headwind_first' ? 'bg-indigo-50 border-indigo-500 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300' : 'bg-bg-page border-border-color text-text-muted hover:border-indigo-300'}`}
                                >
                                    <span className="text-2xl">🌬️</span>
                                    <div className="text-left">
                                        <div className="font-bold">{t('baro_rit_advies.strategy_headwind')}</div>
                                        <div className="text-[10px] opacity-70">{t('baro_rit_advies.strategy_headwind_desc')}</div>
                                    </div>
                                </button>
                                <button 
                                    onClick={() => setWindStrategy('tailwind_first')}
                                    className={`flex items-center gap-3 p-3 rounded-xl border text-sm transition-all ${windStrategy === 'tailwind_first' ? 'bg-indigo-50 border-indigo-500 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300' : 'bg-bg-page border-border-color text-text-muted hover:border-indigo-300'}`}
                                >
                                    <span className="text-2xl">🚀</span>
                                    <div className="text-left">
                                        <div className="font-bold">{t('baro_rit_advies.strategy_tailwind')}</div>
                                        <div className="text-[10px] opacity-70">{t('baro_rit_advies.strategy_tailwind_desc')}</div>
                                    </div>
                                </button>
                                <button 
                                    onClick={() => setWindStrategy('crosswind')}
                                    className={`flex items-center gap-3 p-3 rounded-xl border text-sm transition-all ${windStrategy === 'crosswind' ? 'bg-indigo-50 border-indigo-500 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300' : 'bg-bg-page border-border-color text-text-muted hover:border-indigo-300'}`}
                                >
                                    <span className="text-2xl">⚖️</span>
                                    <div className="text-left">
                                        <div className="font-bold">{t('baro_rit_advies.strategy_crosswind')}</div>
                                        <div className="text-[10px] opacity-70">{t('baro_rit_advies.strategy_crosswind_desc')}</div>
                                    </div>
                                </button>
                                <button 
                                    onClick={() => {
                                        setWindStrategy('custom');
                                        setSelectionMode('return');
                                    }}
                                    className={`flex items-center gap-3 p-3 rounded-xl border text-sm transition-all ${windStrategy === 'custom' ? 'bg-indigo-50 border-indigo-500 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300' : 'bg-bg-page border-border-color text-text-muted hover:border-indigo-300'}`}
                                >
                                    <span className="text-2xl">📍</span>
                                    <div className="text-left">
                                        <div className="font-bold">{t('baro_rit_advies.strategy_custom')}</div>
                                        <div className="text-[10px] opacity-70">{t('baro_rit_advies.strategy_custom_desc')}</div>
                                    </div>
                                </button>
                            </div>

                            {windStrategy === 'custom' && (
                                <div className="mt-3 p-3 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-800 dark:text-indigo-200 text-xs rounded-lg border border-indigo-100 dark:border-indigo-800">
                                    <p className="font-bold mb-1">Instructie:</p>
                                    <div className="flex gap-2 mb-2">
                                        <button 
                                            onClick={() => setSelectionMode('start')}
                                            className={`px-2 py-1 rounded ${selectionMode === 'start' ? 'bg-indigo-600 text-white' : 'bg-white text-indigo-600 border'}`}
                                        >
                                            Zet Start
                                        </button>
                                        <button 
                                            onClick={() => setSelectionMode('return')}
                                            className={`px-2 py-1 rounded ${selectionMode === 'return' ? 'bg-indigo-600 text-white' : 'bg-white text-indigo-600 border'}`}
                                        >
                                            Zet Keerpunt
                                        </button>
                                    </div>
                                    <p>{selectionMode === 'start' ? t('baro_rit_advies.start_point_hint') : t('baro_rit_advies.return_point_hint')}</p>
                                    {returnLocation ? (
                                        <p className="text-green-600 mt-1">Keerpunt ingesteld!</p>
                                    ) : (
                                        <p className="text-amber-600 mt-1">Nog geen keerpunt gekozen.</p>
                                    )}
                                </div>
                            )}
                        </div>

                         {/* Vorm & Variatie */}
                        <div className={`bg-bg-card p-4 rounded-xl border border-border-color ${!forecastData ? 'opacity-50 pointer-events-none' : ''}`}>
                             <div className="space-y-4">
                                {/* Shape Selector */}
                                <div>
                                    <label className="text-xs font-medium text-text-main mb-2 block">{t('baro_rit_advies.shape_label')}</label>
                                    <div className="grid grid-cols-4 gap-1 bg-bg-page rounded-lg p-1 border border-border-color">
                                        {[
                                            { id: 'loop', label: t('baro_rit_advies.shape.loop') },
                                            { id: 'figure8', label: t('baro_rit_advies.shape.figure8') },
                                            { id: 'square', label: t('baro_rit_advies.shape.square') },
                                            { id: 'triangle', label: t('baro_rit_advies.shape.triangle') },
                                            { id: 'star', label: t('baro_rit_advies.shape.star') },
                                            { id: 'hexagon', label: t('baro_rit_advies.shape.hexagon') },
                                            { id: 'zigzag', label: t('baro_rit_advies.shape.zigzag') },
                                            { id: 'boomerang', label: t('baro_rit_advies.shape.boomerang') }
                                        ].map(s => (
                                            <button 
                                                key={s.id}
                                                onClick={() => setShape(s.id as any)}
                                                className={`py-1.5 text-xs rounded-md transition-colors ${shape === s.id ? 'bg-indigo-600 text-white shadow-sm' : 'text-text-muted hover:text-text-main'}`}
                                            >
                                                {s.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Figures Dropdown */}
                                <div>
                                    <label className="text-xs font-medium text-text-main mb-2 block">{t('baro_rit_advies.special_figures')}</label>
                                    <select 
                                        value={['kerstboom', 'kerstman', 'pashaas', 'dieren'].includes(shape) ? shape : ''}
                                        onChange={(e) => e.target.value && setShape(e.target.value as any)}
                                        className="w-full bg-bg-page text-text-main text-xs rounded-lg px-3 py-2 border border-border-color focus:ring-1 focus:ring-indigo-500 outline-none cursor-pointer"
                                    >
                                        <option value="">{t('baro_rit_advies.select_figure')}</option>
                                        <option value="kerstboom">🎄 Kerstboom</option>
                                        <option value="kerstman">🎅 Kerstman</option>
                                        <option value="pashaas">🐰 Pashaas</option>
                                        <option value="dieren">🐟 Vis (Dier)</option>
                                    </select>
                                </div>

                                {/* Bending Outbound */}
                                <div>
                                    <div className="flex justify-between mb-1">
                                        <label className="text-xs font-medium text-text-main">{t('baro_rit_advies.bending_outbound')}</label>
                                        <span className="text-xs font-bold text-indigo-600">{bendingOutbound}%</span>
                                    </div>
                                    <input  
                                        type="range" 
                                        min="0" 
                                        max="45" 
                                        value={bendingOutbound} 
                                        onChange={(e) => setBendingOutbound(Number(e.target.value))}
                                        className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                                    />
                                </div>

                                {/* Bending Inbound */}
                                <div>
                                    <div className="flex justify-between mb-1">
                                        <label className="text-xs font-medium text-text-main">{t('baro_rit_advies.bending_inbound')}</label>
                                        <span className="text-xs font-bold text-indigo-600">{bendingInbound}%</span>
                                    </div>
                                    <input 
                                        type="range" 
                                        min="0" 
                                        max="45" 
                                        value={bendingInbound} 
                                        onChange={(e) => setBendingInbound(Number(e.target.value))}
                                        className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                                    />
                                    <div className="flex justify-between text-[10px] text-text-muted mt-1">
                                        <span>{t('baro_rit_advies.straight')}</span>
                                        <span>{t('baro_rit_advies.circle')}</span>
                                    </div>
                                </div>

                                {/* Randomness Outbound */}
                                <div>
                                    <div className="flex justify-between mb-1">
                                        <label className="text-xs font-medium text-text-main">Avontuur Heen</label>
                                        <span className="text-xs font-bold text-indigo-600">{randomnessOutbound}/10</span>
                                    </div>
                                    <input 
                                        type="range" 
                                        min="0" 
                                        max="10" 
                                        value={randomnessOutbound} 
                                        onChange={(e) => setRandomnessOutbound(Number(e.target.value))}
                                        className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                                    />
                                </div>

                                {/* Randomness Inbound */}
                                <div>
                                    <div className="flex justify-between mb-1">
                                        <label className="text-xs font-medium text-text-main">{t('baro_rit_advies.adventure_inbound')}</label>
                                        <span className="text-xs font-bold text-indigo-600">{randomnessInbound}/10</span>
                                    </div>
                                    <input 
                                        type="range" 
                                        min="0" 
                                        max="10" 
                                        value={randomnessInbound} 
                                        onChange={(e) => setRandomnessInbound(Number(e.target.value))}
                                        className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                                    />
                                </div>

                                {/* Toggles */}
                                <div className="flex flex-col gap-2 pt-2">
                                    <label className="flex items-center gap-2 cursor-pointer hover:bg-bg-page p-2 rounded-lg transition-colors -ml-2">
                                        <input type="checkbox" checked={avoidFerries} onChange={e => setAvoidFerries(e.target.checked)} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4" />
                                        <span className="text-sm text-text-main">Vermijd Pontjes</span>
                                    </label>

                                    <label className="flex items-center gap-2 cursor-pointer hover:bg-bg-page p-2 rounded-lg transition-colors -ml-2">
                                        <input type="checkbox" checked={maximizeElevation} onChange={e => setMaximizeElevation(e.target.checked)} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4" />
                                        <span className="text-sm text-text-main">Zoveel mogelijk hoogtemeters</span>
                                    </label>
                                    
                                    <div className="flex flex-col gap-1 mt-2">
                                        <label className="text-xs font-medium text-text-main ml-1">Wegdek Voorkeur</label>
                                        <div className="flex bg-bg-page rounded-lg p-1 border border-border-color">
                                            <button 
                                                onClick={() => setSurfacePreference('paved')}
                                                className={`flex-1 py-1.5 text-xs rounded-md transition-colors ${surfacePreference === 'paved' ? 'bg-indigo-600 text-white shadow-sm' : 'text-text-muted hover:text-text-main'}`}
                                            >
                                                Verhard
                                            </button>
                                            <button 
                                                onClick={() => setSurfacePreference('any')}
                                                className={`flex-1 py-1.5 text-xs rounded-md transition-colors ${surfacePreference === 'any' ? 'bg-indigo-600 text-white shadow-sm' : 'text-text-muted hover:text-text-main'}`}
                                            >
                                                Mix
                                            </button>
                                            <button 
                                                onClick={() => setSurfacePreference('unpaved')}
                                                className={`flex-1 py-1.5 text-xs rounded-md transition-colors ${surfacePreference === 'unpaved' ? 'bg-indigo-600 text-white shadow-sm' : 'text-text-muted hover:text-text-main'}`}
                                            >
                                                Onverhard
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Action Button */}
                        <button 
                            onClick={handleCalculate}
                            disabled={loading || !startLocation || !forecastData || credits <= 0}
                            className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-lg shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all transform hover:scale-[1.02] flex items-center justify-center gap-2"
                        >
                            {loading ? (
                                <>
                                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                                    <span>{t('baro_rit_advies.calculating')}</span>
                                </>
                            ) : credits <= 0 ? (
                                <>
                                    <Icon name="lock" />
                                    <span>Geen Credits</span>
                                </>
                            ) : !forecastData ? (
                                <>
                                    <Icon name="schedule" />
                                    <span>Kies eerst tijdstip...</span>
                                </>
                            ) : (
                                <>
                                    <Icon name="directions_bike" />
                                    <span>{t('baro_rit_advies.calculate_route')}</span>
                                </>
                            )}
                        </button>

                         {error && (
                            <div className="p-4 bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm rounded-xl border border-red-200 dark:border-red-800 flex items-start gap-3">
                                <Icon name="error" className="text-xl mt-0.5" />
                                <div>
                                    <p className="font-bold">{t('baro_rit_advies.error_title')}</p>
                                    <p>{error}</p>
                                </div>
                            </div>
                        )}

                        {daylightInfo && (
                            <div className={`p-4 ${daylightInfo.isCritical ? 'bg-purple-100 dark:bg-purple-900/20 text-purple-800 dark:text-purple-200 border-purple-200 dark:border-purple-800' : 'bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200 border-blue-200 dark:border-blue-800'} text-sm rounded-xl border flex items-start gap-3 mt-4 animate-in fade-in slide-in-from-bottom-2`}>
                                <Icon name="nights_stay" className="text-xl mt-0.5" />
                                <div>
                                    <p className="font-bold">{daylightInfo.isCritical ? t('baro_rit_advies.daylight_warning') : t('baro_rit_advies.twilight_info')}</p>
                                    <p>{daylightInfo.warning}</p>
                                </div>
                            </div>
                        )}
                        
                        {warning && (
                             <div className="p-4 bg-amber-100 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200 text-sm rounded-xl border border-amber-200 dark:border-amber-800 flex items-start gap-3">
                                <Icon name="warning" className="text-xl mt-0.5" />
                                <div>
                                    <p className="font-bold">{t('baro_rit_advies.attention')}</p>
                                    <p>{warning}</p>
                                </div>
                            </div>
                        )}

                    </div>

                    {/* Right Column: Results */}
                    <div className="space-y-6">
                         {routeData ? (
                            <div className="bg-bg-card border border-border-color rounded-xl p-6 shadow-sm animate-in fade-in slide-in-from-bottom-4 sticky top-24">
                                <h3 className="font-bold text-lg mb-4 text-text-main flex items-center gap-2">
                                    <Icon name="check_circle" className="text-green-500" />
                                    {t('baro_rit_advies.results_title')}
                                </h3>
                                
                                <div className="grid grid-cols-2 gap-4 mb-6">
                                    <div className="bg-bg-page p-4 rounded-xl text-center border border-border-color col-span-2">
                                        <div className="flex justify-between items-center mb-2">
                                            <div className="text-xs text-text-muted uppercase font-bold">{t('baro_rit_advies.distance')}</div>
                                            <div className="text-xs text-text-muted uppercase font-bold">{t('baro_rit_advies.estimated_duration')}</div>
                                        </div>
                                        <div className="flex justify-between items-end">
                                            <div className="text-2xl font-bold text-text-main">
                                                {(routeData.features[0].properties.summary.distance / 1000).toFixed(1)} 
                                                <span className="text-sm font-normal text-text-muted ml-1">km</span>
                                            </div>
                                            <div className="text-xl font-bold text-text-main">
                                                {(() => {
                                                    const hours = (routeData.features[0].properties.summary.distance / 1000) / averageSpeed;
                                                    const h = Math.floor(hours);
                                                    const m = Math.round((hours % 1) * 60);
                                                    return `${h}u ${m}m`;
                                                })()}
                                                <span className="text-xs font-normal text-text-muted ml-1 block text-right">
                                                    @ {settings.precipUnit === PrecipUnit.INCH ? 
                                                        `${(averageSpeed / 1.60934).toFixed(1)} mph` : 
                                                        `${averageSpeed} km/u`
                                                    }
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="bg-bg-page p-4 rounded-xl text-center border border-border-color col-span-2 flex items-center justify-center gap-4">
                                        <div>
                                            <div className="text-xs text-text-muted uppercase font-bold mb-1">{t('baro_rit_advies.wind')}</div>
                                            <div className="text-xl font-bold text-text-main">{convertWind(routeData.features[0].properties.wind?.speed, settings.windUnit || WindUnit.KMH)} {settings.windUnit || 'km/u'}</div>
                                        </div>
                                        <div className="h-10 w-px bg-border-color"></div>
                                        <div className="flex flex-col items-center">
                                            <div className="text-xs text-text-muted uppercase font-bold mb-1">{t('baro_rit_advies.direction')}</div>
                                            <div className="flex items-center gap-1">
                                                <div 
                                                    className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400"
                                                    style={{ transform: `rotate(${routeData.features[0].properties.wind?.direction}deg)` }}
                                                >
                                                    <Icon name="arrow_downward" />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                
                                {/* Elevation/Wind Profile */}
                                {(elevationData.length > 0 || windGraphData.length > 0) && (
                                    <div className="mb-6 bg-bg-page p-4 rounded-xl border border-border-color">
                                        <div className="flex justify-between items-center mb-1">
                                            <div className="text-xs text-text-muted uppercase font-bold">
                                                {chartMode === 'elevation' ? t('baro_rit_advies.elevation_profile') : t('baro_rit_advies.wind_profile')}
                                            </div>
                                            <div className="flex bg-bg-subtle rounded-lg p-0.5 border border-border-color">
                                                <button
                                                    onClick={() => setChartMode('elevation')}
                                                    className={`px-2 py-1 text-[10px] font-bold rounded-md transition-colors ${chartMode === 'elevation' ? 'bg-white shadow-sm text-indigo-600' : 'text-text-muted hover:text-text-main'}`}
                                                >
                                                    {t('baro_rit_advies.elevation_profile').split(' ')[0]}
                                                </button>
                                                <button
                                                    onClick={() => setChartMode('wind')}
                                                    className={`px-2 py-1 text-[10px] font-bold rounded-md transition-colors ${chartMode === 'wind' ? 'bg-white shadow-sm text-indigo-600' : 'text-text-muted hover:text-text-main'}`}
                                                >
                                                    {t('baro_rit_advies.wind')}
                                                </button>
                                            </div>
                                        </div>
                                        
                                        {chartMode === 'elevation' ? (
                                            <ElevationChart data={elevationData} t={t} />
                                        ) : (
                                            <WindChart data={windGraphData} />
                                        )}
                                    </div>
                                )}

                                {/* Surface Info */}
                                {surfaceInfo && (
                                    <div className="mb-6 bg-bg-page p-4 rounded-xl border border-border-color">
                                        <div className="text-xs text-text-muted uppercase font-bold mb-2">{t('baro_rit_advies.surface')}</div>
                                        <div className="flex h-4 w-full rounded-full overflow-hidden">
                                            <div style={{ width: `${surfaceInfo.pavedPct}%` }} className="bg-indigo-600 h-full" title={t('baro_rit_advies.surface.paved')} />
                                            <div style={{ width: `${surfaceInfo.unpavedPct}%` }} className="bg-amber-500 h-full" title={t('baro_rit_advies.surface.unpaved')} />
                                            <div style={{ width: `${surfaceInfo.unknownPct}%` }} className="bg-slate-400 h-full" title={t('baro_rit_advies.surface.unknown')} />
                                        </div>
                                        <div className="flex justify-between text-xs mt-1 font-medium">
                                            <span className="flex items-center gap-1 text-indigo-700 dark:text-indigo-400">
                                                <div className="w-2 h-2 rounded-full bg-indigo-600" />
                                                {t('baro_rit_advies.surface.paved')}: {surfaceInfo.pavedPct}%
                                            </span>
                                            <span className="flex items-center gap-1 text-amber-700 dark:text-amber-400">
                                                <div className="w-2 h-2 rounded-full bg-amber-500" />
                                                {t('baro_rit_advies.surface.unpaved')}: {surfaceInfo.unpavedPct}%
                                            </span>
                                            <span className="flex items-center gap-1 text-slate-600 dark:text-slate-300">
                                                <div className="w-2 h-2 rounded-full bg-slate-400" />
                                                {t('baro_rit_advies.surface.unknown')}: {surfaceInfo.unknownPct}%
                                            </span>
                                        </div>
                                    </div>
                                )}

                                {steepnessInfo && (
                                    <div className="mb-6 bg-bg-page p-4 rounded-xl border border-border-color">
                                        <div className="text-xs text-text-muted uppercase font-bold mb-2">{t('baro_rit_advies.steepness')}</div>
                                        <div className="flex flex-col gap-2">
                                            {steepnessInfo.slice(0, 3).map((item: any) => (
                                                <div key={`steep-${item.value}`} className="flex items-center justify-between text-xs">
                                                    <span className="text-text-main">{formatSteepnessLabel(item.value)}</span>
                                                    <span className="text-text-muted">{item.pct}%</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {waytypeInfo && (
                                    <div className="mb-6 bg-bg-page p-4 rounded-xl border border-border-color">
                                        <div className="text-xs text-text-muted uppercase font-bold mb-2">{t('baro_rit_advies.waytype')}</div>
                                        <div className="flex flex-col gap-2">
                                            {waytypeInfo.slice(0, 3).map((item: any) => (
                                                <div key={`waytype-${item.value}`} className="flex items-center justify-between text-xs">
                                                    <span className="text-text-main">{item.label}</span>
                                                    <span className="text-text-muted">{item.pct}%</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div className="flex flex-col gap-3">
                                    <button 
                                        onClick={() => setShowDetail(true)}
                                        className="w-full py-3 bg-bg-page hover:bg-bg-subtle border border-border-color text-text-main rounded-xl font-bold shadow-sm transition-colors flex items-center justify-center gap-2"
                                    >
                                        <Icon name="visibility" className="text-xl" />
                                        {t('baro_rit_advies.detail_view')}
                                    </button>

                                    <button 
                                        onClick={handleAnalyzeClick}
                                        className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-md transition-colors flex items-center justify-center gap-2"
                                    >
                                        <Icon name="timeline" className="text-xl" />
                                        {t('baro_rit_advies.analyze_in_planner')}
                                    </button>

                                    <div className="grid grid-cols-2 gap-3">
                                        <button 
                                            onClick={handleDownloadClick}
                                            className="col-span-2 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold shadow-md transition-colors flex items-center justify-center gap-2"
                                        >
                                            <Icon name="download" className="text-xl" />
                                            {t('baro_rit_advies.download_gpx')}
                                        </button>
                                        <button 
                                            onClick={handleCopyClick}
                                            className="py-3 bg-bg-page hover:bg-bg-subtle border border-border-color text-text-main rounded-xl font-bold shadow-sm transition-colors flex items-center justify-center gap-2"
                                        >
                                            <Icon name="content_copy" className="text-xl" />
                                            {t('baro_rit_advies.copy')}
                                        </button>
                                        <button 
                                            onClick={handleShareClick}
                                            className="py-3 bg-bg-page hover:bg-bg-subtle border border-border-color text-text-main rounded-xl font-bold shadow-sm transition-colors flex items-center justify-center gap-2"
                                        >
                                            <Icon name="share" className="text-xl" />
                                            {t('baro_rit_advies.share')}
                                        </button>
                                    </div>
                                </div>

                                <p className="text-xs text-text-muted text-center mt-4">
                                    {t('baro_rit_advies.disclaimer')}
                                </p>
                            </div>
                        ) : (
                            <div className="bg-bg-card border border-border-color border-dashed rounded-xl p-8 text-center h-64 flex flex-col items-center justify-center text-text-muted">
                                <Icon name="map" className="text-4xl mb-2 opacity-20" />
                                <p>{t('baro_rit_advies.start_instruction')} "{t('baro_rit_advies.calculate_button')}" {t('baro_rit_advies.to_start')}</p>
                            </div>
                        )}

                        {/* Weather Details Card - Split View */}
                        {forecastData && routeData && (
                            <div className="bg-bg-card p-4 rounded-xl border border-border-color animate-in fade-in slide-in-from-bottom-2">
                                <div className="flex justify-between items-center mb-3">
                                    <label className="text-sm font-medium text-text-main flex items-center gap-2">
                                        <Icon name="partly_cloudy_day" /> {t('baro_rit_advies.weather_report')}
                                    </label>
                                    <span className="text-xs text-text-muted">
                                        {selectedDate === 'today' ? t('baro_rit_advies.today') : t('baro_rit_advies.tomorrow')}
                                    </span>
                                </div>
                                
                                <div className="grid grid-cols-2 gap-4">
                                    {/* Departure */}
                                    <div className="space-y-2">
                                        <div className="text-xs font-bold text-text-muted uppercase text-center border-b border-border-color pb-1 mb-2">
                                            {t('baro_rit_advies.departure')} {selectedTime}
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div className="flex flex-col p-2 bg-bg-page rounded-lg text-center">
                                                <span className="text-[10px] text-text-muted uppercase">{t('baro_rit_advies.temp')}</span>
                                                <span className="font-bold">{Math.round(forecastData.temp)}°</span>
                                            </div>
                                            <div className="flex flex-col p-2 bg-bg-page rounded-lg text-center">
                                                <span className="text-[10px] text-text-muted uppercase">{t('baro_rit_advies.wind')}</span>
                                                <span className="font-bold">{convertWind(forecastData.windSpeed, settings.windUnit || WindUnit.KMH)}</span>
                                            </div>
                                            <div className="flex flex-col p-2 bg-bg-page rounded-lg text-center">
                                                <span className="text-[10px] text-text-muted uppercase">{t('baro_rit_advies.rain')}</span>
                                                <span className="font-bold">{forecastData.precipProb}%</span>
                                            </div>
                                            <div className="flex flex-col p-2 bg-bg-page rounded-lg text-center">
                                                <span className="text-[10px] text-text-muted uppercase">{t('baro_rit_advies.sun')}</span>
                                                <span className="font-bold">{100 - forecastData.cloudCover}%</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Arrival */}
                                    <div className="space-y-2">
                                        <div className="text-xs font-bold text-text-muted uppercase text-center border-b border-border-color pb-1 mb-2">
                                            Aankomst {getEndTime(selectedTime, routeData.features[0].properties.summary.distance, averageSpeed)}
                                        </div>
                                        {(() => {
                                            // Calculate arrival weather
                                            let arrivalWeather = forecastData;
                                            if (fullHourlyWeather) {
                                                const [h, m] = selectedTime.split(':').map(Number);
                                                const durationHours = (routeData.features[0].properties.summary.distance / 1000) / averageSpeed;
                                                // Add minutes to make it more precise? Hourly data is just hourly.
                                                // Round to nearest hour or floor? OpenMeteo hourly is 00:00, 01:00...
                                                // If I arrive at 14:50, 15:00 weather is probably better than 14:00?
                                                // Let's just use floor + duration.
                                                const arrivalHourIndex = Math.min(
                                                    Math.floor(h + durationHours),
                                                    fullHourlyWeather.temperature_2m.length - 1
                                                );
                                                
                                                if (fullHourlyWeather.temperature_2m[arrivalHourIndex] !== undefined) {
                                                    arrivalWeather = {
                                                        temp: fullHourlyWeather.temperature_2m[arrivalHourIndex],
                                                        windSpeed: fullHourlyWeather.wind_speed_10m[arrivalHourIndex],
                                                        precipProb: fullHourlyWeather.precipitation_probability[arrivalHourIndex],
                                                        cloudCover: fullHourlyWeather.cloud_cover[arrivalHourIndex]
                                                    };
                                                }
                                            }

                                            return (
                                                <div className="grid grid-cols-2 gap-2">
                                                    <div className="flex flex-col p-2 bg-bg-page rounded-lg text-center">
                                                        <span className="text-[10px] text-text-muted uppercase">Temp</span>
                                                        <span className="font-bold">{Math.round(arrivalWeather.temp)}°</span>
                                                    </div>
                                                    <div className="flex flex-col p-2 bg-bg-page rounded-lg text-center">
                                                        <span className="text-[10px] text-text-muted uppercase">Wind</span>
                                                        <span className="font-bold">{convertWind(arrivalWeather.windSpeed, settings.windUnit || WindUnit.KMH)}</span>
                                                    </div>
                                                    <div className="flex flex-col p-2 bg-bg-page rounded-lg text-center">
                                                        <span className="text-[10px] text-text-muted uppercase">Regen</span>
                                                        <span className="font-bold">{arrivalWeather.precipProb}%</span>
                                                    </div>
                                                    <div className="flex flex-col p-2 bg-bg-page rounded-lg text-center">
                                                        <span className="text-[10px] text-text-muted uppercase">Zon</span>
                                                        <span className="font-bold">{100 - arrivalWeather.cloudCover}%</span>
                                                    </div>
                                                </div>
                                            );
                                        })()}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Floating Credit Counter */}
            {onNavigate && <CreditFloatingButton onNavigate={onNavigate} settings={settings} />}

            {showFilenameModal && (
                <Modal
                    isOpen={showFilenameModal}
                    onClose={() => {
                        setShowFilenameModal(false);
                        setIsAnalyzeFlow(false);
                    }}
                    title={pendingAction === 'download' ? 'Download GPX' : 'Deel GPX'}
                >
                    <div className="flex flex-col gap-4">
                        <div>
                            <label className="block text-sm font-medium text-text-muted mb-1">
                                Bestandsnaam
                            </label>
                            <input
                                type="text"
                                value={filename}
                                onChange={(e) => setFilename(e.target.value)}
                                className="w-full p-3 bg-bg-page border border-border-color rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                                placeholder="Mijn Route"
                                autoFocus
                            />
                            <p className="text-xs text-text-muted mt-1">.gpx wordt automatisch toegevoegd</p>
                        </div>
                        <div className="flex gap-3 mt-2">
                            <button
                                onClick={() => {
                                    setShowFilenameModal(false);
                                    setIsAnalyzeFlow(false);
                                }}
                                className="flex-1 py-3 bg-bg-page hover:bg-bg-subtle border border-border-color rounded-xl font-bold"
                            >
                                Annuleren
                            </button>
                            <button
                                onClick={handleConfirmAction}
                                className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-lg"
                            >
                                {pendingAction === 'download' ? 'Downloaden' : 'Delen'}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}

            {showAnalyzeConfirmModal && (
                <Modal
                    isOpen={showAnalyzeConfirmModal}
                    onClose={() => setShowAnalyzeConfirmModal(false)}
                    title="Analyse Voorbereiden"
                >
                    <div className="flex flex-col gap-4">
                        <div className="flex items-start gap-4 p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl">
                            <div className="p-2 bg-indigo-100 dark:bg-indigo-800 rounded-full text-indigo-600 dark:text-indigo-200">
                                <Icon name="save" className="text-xl" />
                            </div>
                            <div>
                                <h4 className="font-bold text-text-main mb-1">Route bewaren?</h4>
                                <p className="text-sm text-text-muted">
                                    Wil je de gemaakte route eerst lokaal opslaan als GPX bestand voordat je naar de analyse gaat?
                                </p>
                            </div>
                        </div>
                        
                        <div className="flex flex-col gap-2 mt-2">
                            <button
                                onClick={() => handleAnalyzeConfirm(true)}
                                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-lg flex items-center justify-center gap-2"
                            >
                                <Icon name="download" />
                                Ja, opslaan & analyseren
                            </button>
                            <button
                                onClick={() => handleAnalyzeConfirm(false)}
                                className="w-full py-3 bg-bg-page hover:bg-bg-subtle border border-border-color text-text-main rounded-xl font-bold shadow-sm transition-colors"
                            >
                                Nee, direct analyseren
                            </button>
                        </div>
                    </div>
                </Modal>
            )}

            {showDetail && routeData && currentWind && (
                <RouteDetailModal 
                    isOpen={showDetail}
                    onClose={() => setShowDetail(false)}
                    routeData={routeData}
                    wind={{
                        direction: routeData.features[0].properties.wind?.direction || currentWind.direction,
                        speed: routeData.features[0].properties.wind?.speed || currentWind.speed,
                        strategy: windStrategy
                    }}
                    settings={settings}
                />
            )}
        </div>
    );
};

// Helper component to render GeoJSON properly
const GeoJSONRoute = ({ data, layerRef }: { data: any, layerRef: any }) => {
    // Extract coordinates from GeoJSON FeatureCollection
    // ORS returns [lon, lat], Leaflet needs [lat, lon]
    const coordinates = data.features[0].geometry.coordinates.map((coord: number[]) => [coord[1], coord[0]]);
    
    return <Polyline ref={layerRef} positions={coordinates} color="#4f46e5" weight={5} opacity={0.8} />;
};

const RouteEditor = ({ isEditing, layerRef }: { isEditing: boolean, layerRef: any }) => {
    const map = useMap();

    useEffect(() => {
        if (!map || !(map as any).pm) return;

        if (isEditing) {
            (map as any).pm.addControls({
                position: 'topleft',
                drawCircle: false,
                drawMarker: false,
                drawCircleMarker: false,
                drawRectangle: false,
                drawPolygon: false,
                drawPolyline: true, // Allow drawing new segments
                editMode: true,
                dragMode: false,
                cutPolygon: false,
                removalMode: true,
                rotateMode: false,
            });

            if (layerRef.current && layerRef.current.pm) {
                layerRef.current.pm.enable({
                    allowSelfIntersection: true,
                });
            }
        } else {
            try {
                (map as any).pm.removeControls();
                if ((map as any).pm.globalEditModeEnabled && (map as any).pm.globalEditModeEnabled()) {
                    (map as any).pm.disableGlobalEditMode();
                }
                if (layerRef.current && layerRef.current.pm) {
                    layerRef.current.pm.disable();
                }
            } catch (e) {
                console.warn("Error cleaning up route editor", e);
            }
        }
    }, [map, isEditing, layerRef]);

    return null;
};

export default BaroRitAdviesView;
