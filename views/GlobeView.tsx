import React, { useState, useRef, useEffect } from 'react';
import Globe, { GlobeMethods } from 'react-globe.gl';
import { ViewState, Location, AppSettings } from '../types';
import { Icon } from '../components/Icon';
import { getTranslation } from '../services/translations';
import { 
    fetchForecast, 
    convertTemp, 
    mapWmoCodeToText, 
    mapWmoCodeToIcon, 
    fetchMarineData, 
    getWindDirection, 
    convertWind, 
    convertTempPrecise,
    calculateMoonPhase,
    getMoonPhaseText
} from '../services/weatherService';
import { reverseGeocodeFull } from '../services/geoService';
import { CreditFloatingButton } from '../components/CreditFloatingButton';

interface Props {
    settings: AppSettings;
    onNavigate: (view: ViewState) => void;
    onSelectLocation: (loc: Location) => void;
}

export const GlobeView: React.FC<Props> = ({ settings, onNavigate, onSelectLocation }) => {
    const globeEl = useRef<GlobeMethods | undefined>(undefined);
    const [selectedPoint, setSelectedPoint] = useState<{ lat: number; lng: number } | null>(null);
    const [weatherData, setWeatherData] = useState<any>(null);
    const [marineData, setMarineData] = useState<any>(null);
    const [locationType, setLocationType] = useState<'LAND' | 'WATER'>('LAND');
    const [locationInfo, setLocationInfo] = useState<{ name: string; countryCode: string } | null>(null);
    const [loading, setLoading] = useState(false);
    const [isGlobeLoading, setIsGlobeLoading] = useState(true);
    const [showToast, setShowToast] = useState(true);
    
    const t = (key: string) => getTranslation(key, settings.language);

    useEffect(() => {
        if (globeEl.current) {
            globeEl.current.pointOfView({ altitude: 2.5 });
        }
        const timer = setTimeout(() => {
            setIsGlobeLoading(false);
        }, 2000);
        const toastTimer = setTimeout(() => {
            setShowToast(false);
        }, 8000);
        return () => {
            clearTimeout(timer);
            clearTimeout(toastTimer);
        };
    }, []);

    useEffect(() => {
        if (globeEl.current) {
            window.dispatchEvent(new Event('resize'));
            if (!selectedPoint) {
                const currentPos = globeEl.current.pointOfView();
                globeEl.current.pointOfView({ ...currentPos, altitude: Math.max(currentPos.altitude, 2.0) });
            }
        }
    }, [selectedPoint]);

    const handleGlobeClick = (clickData: { lat: number, lng: number }) => {
        const { lat, lng } = clickData;
        setSelectedPoint({ lat, lng });
        setWeatherData(null);
        setMarineData(null);
        setLocationType('LAND');
        setLocationInfo(null);
        if (globeEl.current) {
            globeEl.current.pointOfView({ lat, lng, altitude: 1.8 }, 1000);
        }
        fetchData(lat, lng);
    };

    const handleControl = (direction: 'up' | 'down' | 'left' | 'right' | 'zoomIn' | 'zoomOut') => {
        if (!globeEl.current) return;

        const current = globeEl.current.pointOfView();
        let { lat, lng, altitude } = current;
        const moveStep = 10;
        const zoomStep = 0.5;

        switch (direction) {
            case 'up': lat += moveStep; break;
            case 'down': lat -= moveStep; break;
            case 'left': lng -= moveStep; break;
            case 'right': lng += moveStep; break;
            case 'zoomIn': altitude = Math.max(0.2, altitude - zoomStep); break;
            case 'zoomOut': altitude = Math.min(10, altitude + zoomStep); break;
        }

        globeEl.current.pointOfView({ lat, lng, altitude }, 400);
    };

    const fetchData = async (lat: number, lon: number) => {
        setLoading(true);
        try {
            // Parallel fetch: Weather, Marine, Location Name
            const [weather, marine, locInfo] = await Promise.all([
                fetchForecast(lat, lon),
                fetchMarineData(lat, lon),
                reverseGeocodeFull(lat, lon)
            ]);

            setWeatherData(weather);
            setMarineData(marine);

            // Determine Location Type
            // If marine data has significant waves and no specific city name was found (or if it looks like ocean)
            // User logic: "Als marineData.current.wave_height > 0 (of een geldige waarde heeft): Modus = WATER"
            let isWater = false;
            if (marine && marine.current && typeof marine.current.wave_height === 'number') {
                // Check if valid wave height (sometimes 0 can be a lake, but null is definitely land)
                // Open-Meteo returns null for land usually
                if (marine.current.wave_height !== null) {
                    isWater = true;
                }
            }
            
            // Refine: if reverse geocode found a specific street/city, it might be coastal land.
            // But if user clicks ON the water, we want marine data.
            // Let's stick to the user's rule: "Als marineData.current.wave_height > 0 (of een geldige waarde heeft)"
            
            setLocationType(isWater ? 'WATER' : 'LAND');

            if (locInfo) {
                setLocationInfo(locInfo);
            } else {
                if (isWater) {
                     setLocationInfo({ name: `Oceaan / Zee`, countryCode: '' });
                } else {
                     setLocationInfo({ name: `${lat.toFixed(2)}, ${lon.toFixed(2)}`, countryCode: '' });
                }
            }

        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleSelect = () => {
        if (selectedPoint) {
            const loc: Location = {
                name: locationInfo?.name || `Locatie (${selectedPoint.lat.toFixed(2)}, ${selectedPoint.lng.toFixed(2)})`,
                country: locationInfo?.countryCode || '',
                lat: selectedPoint.lat,
                lon: selectedPoint.lng
            };
            onSelectLocation(loc);
        }
    };

    // Globe image URL
    // Blue Marble or Earth at Night
    const globeImage = settings.theme === 'dark' 
        ? '//unpkg.com/three-globe/example/img/earth-night.jpg' 
        : '//unpkg.com/three-globe/example/img/earth-blue-marble.jpg';

    const backgroundStyle = {
        backgroundColor: 'rgba(0,0,0,0)' // Transparent to fit Baro interface
    };

    return (
        <div className="flex flex-col h-screen w-full relative bg-bg-page/50 overflow-hidden">
            {/* Back Button */}
            <div className="absolute top-6 left-6 z-[100]">
                 <button 
                    onClick={() => onNavigate(ViewState.CURRENT)} 
                    className="p-3 bg-bg-card/40 backdrop-blur-md rounded-full text-text-main hover:bg-bg-card/60 transition-colors border border-white/10 shadow-lg"
                >
                    <Icon name="arrow_back" className="text-2xl" />
                </button>
            </div>

            {/* Controls */}
            <div className="absolute top-6 right-6 z-[100] flex flex-col gap-2">
                <div className="flex flex-col bg-bg-card/40 backdrop-blur-md rounded-xl border border-white/10 overflow-hidden">
                    <button onClick={() => handleControl('zoomIn')} className="p-3 hover:bg-white/10 active:bg-white/20 transition-colors"><Icon name="add" /></button>
                    <button onClick={() => handleControl('zoomOut')} className="p-3 hover:bg-white/10 active:bg-white/20 transition-colors border-t border-white/10"><Icon name="remove" /></button>
                </div>
                <div className="grid grid-cols-3 gap-1 bg-bg-card/40 backdrop-blur-md rounded-xl border border-white/10 p-1">
                     <div />
                     <button onClick={() => handleControl('up')} className="p-2 hover:bg-white/10 rounded"><Icon name="keyboard_arrow_up" /></button>
                     <div />
                     <button onClick={() => handleControl('left')} className="p-2 hover:bg-white/10 rounded"><Icon name="keyboard_arrow_left" /></button>
                     <div className="flex items-center justify-center"><Icon name="public" className="text-xs opacity-50"/></div>
                     <button onClick={() => handleControl('right')} className="p-2 hover:bg-white/10 rounded"><Icon name="keyboard_arrow_right" /></button>
                     <div />
                     <button onClick={() => handleControl('down')} className="p-2 hover:bg-white/10 rounded"><Icon name="keyboard_arrow_down" /></button>
                     <div />
                </div>
            </div>

            {/* Toast Instruction */}
            {showToast && (
                <div className="absolute top-24 left-1/2 -translate-x-1/2 z-[90] pointer-events-none animate-in fade-in slide-in-from-top-4 duration-700">
                    <div className="bg-black/60 backdrop-blur-xl px-6 py-3 rounded-full text-white text-sm font-medium border border-white/10 shadow-xl flex flex-col items-center gap-1 text-center">
                        <span>Draai de wereldbol en klik op een locatie</span>
                        <span className="text-xs text-white/60 font-normal">PC: Sleep met muis | Mobiel: Sleep met vinger</span>
                    </div>
                </div>
            )}

            {/* Globe Container - Dynamic Height */}
            <div className={`relative transition-all duration-700 ease-in-out ${selectedPoint ? 'h-[45vh]' : 'h-full'} w-full cursor-move flex items-center justify-center`}>
                <Globe
                    ref={globeEl}
                    globeImageUrl={globeImage}
                    backgroundImageUrl="//unpkg.com/three-globe/example/img/night-sky.png"
                    atmosphereColor="lightskyblue"
                    atmosphereAltitude={0.15}
                    onGlobeClick={handleGlobeClick}
                    backgroundColor="rgba(0,0,0,0)"
                    htmlElementsData={selectedPoint ? [selectedPoint] : []}
                    htmlElement={(d: any) => {
                        const el = document.createElement('div');
                        el.innerHTML = `<span style="font-size: 32px; filter: drop-shadow(0 0 8px rgba(0,0,0,0.8));">📍</span>`;
                        el.style.transform = `translate(-50%, -100%)`;
                        return el;
                    }}
                />

                {/* Globe Loading Overlay */}
                {isGlobeLoading && (
                    <div className="absolute inset-0 z-[110] bg-bg-page flex flex-col items-center justify-center animate-in fade-in duration-500">
                        <div className="relative">
                            <div className="h-24 w-24 rounded-full border-4 border-accent-primary/20 border-t-accent-primary animate-spin"></div>
                            <div className="absolute inset-0 flex items-center justify-center">
                                <Icon name="public" className="text-3xl text-accent-primary animate-pulse" />
                            </div>
                        </div>
                        <p className="mt-4 text-text-main font-bold animate-pulse">Wereldbol laden...</p>
                    </div>
                )}
            </div>
            
            {/* Floating Credits Button */}
            <div className="absolute bottom-6 right-6 z-[100]">
                 <CreditFloatingButton onNavigate={onNavigate} settings={settings} />
            </div>

            {/* Weather Detail Panel - Full Width as requested */}
            {selectedPoint && (
                <div className="flex-1 bg-bg-card/95 backdrop-blur-2xl border-t border-border-color p-6 overflow-y-auto z-20 animate-in slide-in-from-bottom-full duration-500">
                    <div className="max-w-4xl mx-auto">
                        <div className="flex justify-between items-start mb-6">
                            <div className="flex-1">
                                <div className="flex items-center gap-3 flex-wrap">
                                    <h2 className="text-3xl font-bold text-text-main tracking-tight">
                                        {locationInfo ? locationInfo.name : 'Laden...'}
                                    </h2>
                                    {weatherData && (
                                        <span className="text-lg font-medium text-text-muted bg-bg-page/50 px-3 py-1 rounded-xl border border-border-color">
                                            {new Date().toLocaleTimeString(settings.language === 'nl' ? 'nl-NL' : 'en-US', { 
                                                hour: '2-digit', 
                                                minute: '2-digit',
                                                timeZone: weatherData.timezone 
                                            })}
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2 mt-2">
                                    {locationInfo?.countryCode && (
                                        <span className="text-xs font-bold text-accent-primary bg-accent-primary/10 px-3 py-1 rounded-full border border-accent-primary/20">
                                            {locationInfo.countryCode}
                                        </span>
                                    )}
                                    <span className="text-xs text-text-muted font-mono bg-bg-page px-2 py-1 rounded">
                                        {selectedPoint.lat.toFixed(4)}, {selectedPoint.lng.toFixed(4)}
                                    </span>
                                </div>
                            </div>
                            <button 
                                onClick={() => { setSelectedPoint(null); setWeatherData(null); setMarineData(null); setLocationType('LAND'); }}
                                className="p-2 bg-bg-page hover:bg-bg-input rounded-full text-text-muted transition-colors"
                            >
                                <Icon name="close" className="text-2xl" />
                            </button>
                        </div>

                        {loading ? (
                             <div className="flex flex-col items-center justify-center py-20">
                                <div className="h-16 w-16 border-4 border-accent-primary/20 border-t-accent-primary rounded-full animate-spin"></div>
                                <p className="mt-6 text-text-muted font-medium animate-pulse">Weergegevens ophalen...</p>
                            </div>
                        ) : weatherData ? (
                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-in fade-in slide-in-from-bottom-8 duration-1000">
                                {/* Left Column: Main Weather */}
                                <div className="lg:col-span-4 flex flex-col gap-6">
                                    <div className="bg-gradient-to-br from-accent-primary/20 via-accent-primary/5 to-transparent rounded-[2.5rem] p-8 border border-accent-primary/20 flex flex-col items-center justify-center text-center shadow-2xl shadow-accent-primary/10 relative overflow-hidden group">
                                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                            <Icon name="cloud" className="text-8xl" />
                                        </div>
                                        
                                        <Icon name={mapWmoCodeToIcon(weatherData.current.weather_code, !weatherData.current.is_day)} className="text-8xl text-accent-primary mb-6 drop-shadow-glow animate-float" />
                                        
                                        <div className="text-7xl font-black text-text-main tracking-tighter">
                                            {convertTemp(weatherData.current.temperature_2m, settings.tempUnit)}°
                                        </div>
                                        
                                        <div className="text-2xl font-bold text-text-main mt-4">
                                            {mapWmoCodeToText(weatherData.current.weather_code, settings.language)}
                                        </div>
                                        
                                        <div className="flex items-center gap-2 mt-4 px-4 py-2 bg-bg-page/50 rounded-full border border-border-color">
                                            <span className="text-sm text-text-muted font-medium">Gevoel:</span>
                                            <span className="text-sm font-bold text-text-main">{convertTemp(weatherData.current.apparent_temperature, settings.tempUnit)}°</span>
                                        </div>
                                    </div>

                                    {/* Action Buttons - Stacked under the card */}
                                    <div className="flex flex-col gap-3">
                                        <button 
                                            onClick={handleSelect}
                                            disabled={loading || !weatherData}
                                            className="w-full py-4 bg-accent-primary text-white rounded-2xl font-black hover:opacity-90 transition-all shadow-xl shadow-accent-primary/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 text-lg active:scale-[0.98]"
                                        >
                                            <Icon name="check_circle" className="text-2xl" />
                                            Deze locatie selecteren
                                        </button>
                                        <button 
                                            onClick={() => { setSelectedPoint(null); setWeatherData(null); setMarineData(null); setLocationType('LAND'); }}
                                            className="w-full py-4 bg-bg-page hover:bg-bg-input text-text-muted rounded-2xl font-bold transition-all border border-border-color flex items-center justify-center gap-2 active:scale-[0.98]"
                                        >
                                            <Icon name="close" />
                                            Annuleren
                                        </button>
                                    </div>
                                </div>

                                {/* Right Column: Detailed Grid */}
                                <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                                    {/* Ocean Card (Only for water) */}
                                    {locationType === 'WATER' && marineData && marineData.current && (
                                        <div className="bg-gradient-to-br from-blue-600/30 to-blue-400/10 rounded-3xl p-6 border border-blue-400/30 flex flex-col justify-between group overflow-hidden relative shadow-lg shadow-blue-500/10">
                                            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                                <Icon name="waves" className="text-6xl" />
                                            </div>
                                            <div className="flex items-center gap-3 text-blue-200 mb-4">
                                                <div className="p-2 bg-blue-500/20 rounded-xl">
                                                    <Icon name="waves" />
                                                </div>
                                                <span className="text-xs font-black uppercase tracking-widest">Zeecondities</span>
                                            </div>
                                            <div>
                                                <div className="text-4xl font-black text-white">
                                                    {settings.precipUnit === 'mm' 
                                                        ? `${marineData.current.wave_height} m`
                                                        : `${(marineData.current.wave_height * 1.09361).toFixed(1)} yd`
                                                    }
                                                </div>
                                                <div className="text-xs text-blue-200 mt-2 font-medium">
                                                    Periode: {marineData.current.wave_period}s | Richting: {marineData.current.wave_direction}°
                                                </div>
                                                
                                                {/* Zeeziekte indicator */}
                                                {(marineData.current.wave_height > 1.5 && marineData.current.wave_period < 6) ? (
                                                    <div className="flex items-center gap-2 mt-4 px-4 py-2 bg-red-500/20 rounded-full border border-red-500/30">
                                                        <span className="text-xl">🤢</span>
                                                        <span className="text-sm font-bold text-red-200">Ruwe Zee (Zeeziekte)</span>
                                                    </div>
                                                ) : marineData.current.wave_height < 0.5 ? (
                                                    <div className="flex items-center gap-2 mt-4 px-4 py-2 bg-green-500/20 rounded-full border border-green-500/30">
                                                        <span className="text-xl">😎</span>
                                                        <span className="text-sm font-bold text-green-200">Vlak water</span>
                                                    </div>
                                                ) : (
                                                     <div className="flex items-center gap-2 mt-4 px-4 py-2 bg-blue-500/20 rounded-full border border-blue-500/30">
                                                        <span className="text-sm text-blue-100 font-bold">Normale deining</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    <div className="bg-bg-page/40 hover:bg-bg-page/60 transition-all rounded-3xl p-5 border border-border-color flex flex-col justify-between group">
                                        <div className="flex items-center gap-3 text-text-muted mb-4">
                                            <div className="p-2 bg-blue-500/10 rounded-xl text-blue-500 group-hover:scale-110 transition-transform">
                                                <Icon name="air" />
                                            </div>
                                            <span className="text-xs font-black uppercase tracking-widest">Wind</span>
                                        </div>
                                        <div>
                                            <div className="text-3xl font-black text-text-main">
                                                {convertWind(weatherData.current.wind_speed_10m, locationType === 'WATER' ? (settings.windUnit === 'km/h' ? 'knots' : settings.windUnit) : settings.windUnit)} <span className="text-sm font-normal text-text-muted">{locationType === 'WATER' && settings.windUnit === 'km/h' ? 'knots' : settings.windUnit}</span>
                                            </div>
                                            <div className="text-xs text-text-muted mt-2 flex items-center gap-1">
                                                <Icon name="speed" className="text-[10px]" />
                                                Vlagen: {convertWind(weatherData.current.wind_gusts_10m, locationType === 'WATER' ? (settings.windUnit === 'km/h' ? 'knots' : settings.windUnit) : settings.windUnit)} {locationType === 'WATER' && settings.windUnit === 'km/h' ? 'knots' : settings.windUnit}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-bg-page/40 hover:bg-bg-page/60 transition-all rounded-3xl p-5 border border-border-color flex flex-col justify-between group">
                                        <div className="flex items-center gap-3 text-text-muted mb-4">
                                            <div className="p-2 bg-cyan-500/10 rounded-xl text-cyan-500 group-hover:scale-110 transition-transform">
                                                <Icon name="humidity_percentage" />
                                            </div>
                                            <span className="text-xs font-black uppercase tracking-widest">Vocht</span>
                                        </div>
                                        <div>
                                            <div className="text-3xl font-black text-text-main">
                                                {weatherData.current.relative_humidity_2m}<span className="text-sm font-normal text-text-muted">%</span>
                                            </div>
                                            <div className="text-xs text-text-muted mt-2">
                                                Dauwpunt: {Math.round(weatherData.current.temperature_2m - ((100 - weatherData.current.relative_humidity_2m) / 5))}°
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-bg-page/40 hover:bg-bg-page/60 transition-all rounded-3xl p-5 border border-border-color flex flex-col justify-between group">
                                        <div className="flex items-center gap-3 text-text-muted mb-4">
                                            <div className="p-2 bg-indigo-500/10 rounded-xl text-indigo-500 group-hover:scale-110 transition-transform">
                                                <Icon name="compress" />
                                            </div>
                                            <span className="text-xs font-black uppercase tracking-widest">Druk</span>
                                        </div>
                                        <div>
                                            <div className="text-3xl font-black text-text-main">
                                                {Math.round(weatherData.current.surface_pressure)} <span className="text-sm font-normal text-text-muted">hPa</span>
                                            </div>
                                            <div className="text-xs text-text-muted mt-2">
                                                Zeekwaliteit: {Math.round(weatherData.current.pressure_msl)} hPa
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-bg-page/40 hover:bg-bg-page/60 transition-all rounded-3xl p-5 border border-border-color flex flex-col justify-between group">
                                        <div className="flex items-center gap-3 text-text-muted mb-4">
                                            <div className="p-2 bg-blue-400/10 rounded-xl text-blue-400 group-hover:scale-110 transition-transform">
                                                <Icon name="water_drop" />
                                            </div>
                                            <span className="text-xs font-black uppercase tracking-widest">Neerslag</span>
                                        </div>
                                        <div>
                                            <div className="text-3xl font-black text-text-main">
                                                {weatherData.current.precipitation} <span className="text-sm font-normal text-text-muted">mm</span>
                                            </div>
                                            <div className="text-xs text-text-muted mt-2">
                                                Kans: {weatherData.daily.precipitation_probability_max[0]}%
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-bg-page/40 hover:bg-bg-page/60 transition-all rounded-3xl p-5 border border-border-color flex flex-col justify-between group">
                                        <div className="flex items-center gap-3 text-text-muted mb-4">
                                            <div className="p-2 bg-orange-500/10 rounded-xl text-orange-500 group-hover:scale-110 transition-transform">
                                                <Icon name="wb_sunny" />
                                            </div>
                                            <span className="text-xs font-black uppercase tracking-widest">UV Index</span>
                                        </div>
                                        <div>
                                            <div className="text-3xl font-black text-text-main">
                                                {weatherData.daily.uv_index_max[0]}
                                            </div>
                                            <div className="text-xs text-text-muted mt-2 font-medium">
                                                {weatherData.daily.uv_index_max[0] > 5 ? 'Hoge bescherming nodig' : 'Lage bescherming'}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-bg-page/40 hover:bg-bg-page/60 transition-all rounded-3xl p-5 border border-border-color flex flex-col justify-between group">
                                        <div className="flex items-center gap-3 text-text-muted mb-4">
                                            <div className="p-2 bg-amber-500/10 rounded-xl text-amber-500 group-hover:scale-110 transition-transform">
                                                <Icon name="wb_twilight" />
                                            </div>
                                            <span className="text-xs font-black uppercase tracking-widest">Zon</span>
                                        </div>
                                        <div className="flex flex-col gap-2">
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs text-text-muted">Opkomst</span>
                                                <span className="text-sm font-black text-text-main">{new Date(weatherData.daily.sunrise[0]).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs text-text-muted">Ondergang</span>
                                                <span className="text-sm font-black text-text-main">{new Date(weatherData.daily.sunset[0]).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                            </div>
                                            <div className="mt-2 flex items-center justify-between pt-2 border-t border-border-color/30">
                                                <span className="text-xs text-text-muted">Maan</span>
                                                <span className="text-xs font-bold text-text-main">{getMoonPhaseText(calculateMoonPhase(new Date()), settings.language)}</span>
                                            </div>
                                            <div className="mt-1 text-xs font-medium text-center bg-bg-card/50 rounded py-1 border border-border-color/50">
                                                {weatherData.current.is_day ? '☀️ Dag' : '🌙 Nacht'}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : null}
                    </div>
                </div>
            )}
        </div>
    );
};
