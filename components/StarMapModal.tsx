import React, { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { Icon } from './Icon';

interface StarMapModalProps {
    isOpen: boolean;
    onClose: () => void;
    lat: number;
    lon: number;
    cloudCover: number; // 0-100
    locationName?: string;
    temp?: number;
    utcOffsetSeconds?: number;
}

interface StarMapConfig {
    showLines: boolean;
    showNames: boolean;
    showBoundaries: boolean;
    showDSOs: boolean;
    showMilkyWay: boolean;
    showRealClouds: boolean;
    constellationMode: 'top10' | 'all' | 'none';
    starMagnitude: number;
    timeOffset: number;
}

declare global {
    interface Window {
        Celestial: any;
        d3: any;
    }
}

export const StarMapModal: React.FC<StarMapModalProps> = ({ 
    isOpen, 
    onClose, 
    lat, 
    lon, 
    cloudCover,
    locationName = "Huidige locatie",
    temp = 0,
    utcOffsetSeconds = 0
}) => {
    const STORAGE_KEY = 'starmap_config_v2';

    const [scriptsLoaded, setScriptsLoaded] = useState({ d3: false, projection: false, celestial: false });
    const [isMapReady, setIsMapReady] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loadingProgress, setLoadingProgress] = useState(0);
    const [loadingStatus, setLoadingStatus] = useState('Voorbereiden...');
    
    // Default Configuration
    const DEFAULT_CONFIG: StarMapConfig = {
        showLines: true,
        showNames: true,
        showBoundaries: false,
        showDSOs: false,
        showMilkyWay: true,
        showRealClouds: true,
        constellationMode: 'top10',
        starMagnitude: 4,
        timeOffset: 0
    };

    // Initialize State
    const [appliedConfig, setAppliedConfig] = useState<StarMapConfig>(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                return { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
            }
        } catch (e) {
            console.error("Error loading config", e);
        }
        return DEFAULT_CONFIG;
    });

    const [pendingConfig, setPendingConfig] = useState<StarMapConfig>(appliedConfig);

    // Sync pending with applied on mount/change (only if we want to reset when applied changes externally, but mainly we drive from pending -> applied)
    // Actually, we don't auto-sync pending from applied unless it's a reset.
    
    const top10Constellations = [ 
        "Ori", "Sco", "Leo", "Tau", "UMa", "Cas", "Cyg", "Peg", "Cru", "Cen", "Gem"
    ];

    // Load Scripts
    useEffect(() => {
        if (!isOpen) return;
        
        console.log('[StarMap] Starting script initialization...');

        const loadScript = (id: string, src: string) => {
            return new Promise<void>((resolve, reject) => {
                if (document.getElementById(id)) {
                    resolve();
                    return;
                }
                const script = document.createElement('script');
                script.id = id;
                script.src = src;
                script.async = false;
                script.onload = () => resolve();
                script.onerror = () => reject(`Kon ${id} niet laden.`);
                document.body.appendChild(script);
            });
        };

        const initScripts = async () => {
            try {
                setLoadingStatus('Bibliotheken laden...');
                setLoadingProgress(10);
                
                await loadScript('d3-v3-script', 'https://cdnjs.cloudflare.com/ajax/libs/d3/3.5.17/d3.min.js');
                setScriptsLoaded(prev => ({ ...prev, d3: true }));
                setLoadingProgress(30);
                
                setLoadingStatus('Projectie-engine laden...');
                await loadScript('d3-projection-script', 'https://cdnjs.cloudflare.com/ajax/libs/d3-geo-projection/0.2.16/d3.geo.projection.min.js');
                setScriptsLoaded(prev => ({ ...prev, projection: true }));
                setLoadingProgress(50);
                
                setLoadingStatus('Astronomische engine laden...');
                await loadScript('celestial-script', 'https://cdn.jsdelivr.net/gh/ofrohn/d3-celestial@master/celestial.min.js');
                setScriptsLoaded(prev => ({ ...prev, celestial: true }));
                setLoadingProgress(75);
                setLoadingStatus('Data-pakketten ophalen...');
                
                const progressInterval = setInterval(() => {
                    setLoadingProgress(prev => {
                        if (prev >= 90) {
                            clearInterval(progressInterval);
                            return prev;
                        }
                        return prev + 1;
                    });
                }, 200);

                setTimeout(() => clearInterval(progressInterval), 5000);
            } catch (err: any) {
                console.error("[StarMap] Script load error:", err);
                setError(err.toString());
            }
        };

        if (!window.d3 || !window.Celestial) {
            initScripts();
        } else {
            setScriptsLoaded({ d3: true, projection: true, celestial: true });
            setLoadingProgress(100);
        }
    }, [isOpen]);

    // Initialize Map
    useEffect(() => {
        if (!isOpen || !scriptsLoaded.celestial) return;

        setIsMapReady(false);
        setLoadingProgress(80);
        setLoadingStatus('Sterrenhemel aanpassen...');

        const initCelestialMap = () => {
            try {
                if (!window.d3 || !window.d3.geo || !window.d3.geo.airy || !window.Celestial) {
                    setTimeout(initCelestialMap, 500);
                    return;
                }

                // Force CSS - pointer-events: none voor geen interactie
                const style = document.createElement('style');
                style.innerHTML = `
                    #celestial-map canvas { cursor: default; pointer-events: none !important; }
                    #celestial-date, #celestial-form, .celestial-settings { display: none !important; } 
                    #celestial-map { pointer-events: none !important; }
                `;
                document.head.appendChild(style);

                const container = document.getElementById('celestial-map');
                if (!container) {
                    setTimeout(initCelestialMap, 100);
                    return;
                }
                
                // Fix for mobile: get actual container width
                const containerWidth = container.clientWidth || (window.innerWidth * 0.95);
                const actualWidth = Math.min(containerWidth, 1000); // Cap at max-w

                const config = { 
                    width: actualWidth,           
                    projection: "airy", 
                    transform: "equatorial", 
                    center: null,       
                    location: false,     
                    stars: { 
                        show: true, 
                        limit: appliedConfig.starMagnitude, 
                        colors: true,     
                        style: { fill: "#ffffff", opacity: 1 },
                        names: true,
                        propername: true,
                        desig: false,
                        namelimit: 2.5
                    }, 
                    dsos: { 
                        show: appliedConfig.showDSOs,
                        data: 'dsos.6.json', 
                        limit: 5, 
                        names: true,
                        desig: true,
                        style: { fill: "#ffcc00", opacity: 0.8 },
                        namestyle: { fill: "#ffcc00", font: "11px Helvetica, Arial, sans-serif", align: "left", baseline: "top" }
                    }, 
                    constellations: { 
                        show: appliedConfig.constellationMode !== 'none',    
                        names: appliedConfig.showNames && appliedConfig.constellationMode !== 'none',   
                        desig: false,  
                        namestyle: { fill: "#cccccc", font: "12px Helvetica, Arial, sans-serif" },
                        line: appliedConfig.showLines && appliedConfig.constellationMode !== 'none',
                        linestyle: { stroke: "#4f46e5", width: 2, opacity: 0.6 },
                        boundaries: appliedConfig.showBoundaries && appliedConfig.constellationMode !== 'none', 
                        boundarystyle: { stroke: "#ff00ff", width: 1, opacity: 0.4, dash:[2, 2] },
                        filter: (d: any) => {
                            if (appliedConfig.constellationMode === 'none') return false;
                            if (appliedConfig.constellationMode === 'all') return true;
                            if (appliedConfig.constellationMode === 'top10') {
                                return top10Constellations.includes(d.id);
                            }
                            return false;
                        }
                    }, 
                    mw: { 
                        show: appliedConfig.showMilkyWay, 
                        style: { fill: "#ffffff", opacity: 0.15 } 
                    }, 
                    lines: {
                        graticule: { show: appliedConfig.constellationMode !== 'none', stroke: "#cccccc", width: 0.6, opacity: 0.2 },    
                        equator: { show: false },
                        ecliptic: { show: false },
                        galactic: { show: false },
                        supergalactic: { show: false },
                        constellation: { show: appliedConfig.showBoundaries && appliedConfig.constellationMode !== 'none', stroke: "#ff00ff", width: 1, opacity: 0.3 }
                    },
                    planets: { 
                        show: true,
                        symbolType: "disk", 
                        symbolStyle: { fill: "#00ccff", opacity: 1, stroke: "#ffffff", "stroke-width": 1 },
                        names: true,
                        nameStyle: { fill: "#00ccff", font: "14px Helvetica, Arial, sans-serif", align: "left", baseline: "top" },
                        namesType: "desig"
                    }, 
                    background: { fill: "transparent", stroke: "transparent", opacity: 0 },
                    horizon: { 
                        show: true,
                        stroke: "#1e293b",
                        width: 1,
                        fill: "#000000",
                        opacity: 0.3
                    },
                    container: "celestial-map",
                    datapath: "https://cdn.jsdelivr.net/gh/ofrohn/d3-celestial@master/data/",
                    form: false,
                    config: false,
                    interactive: false, 
                    controls: false, 
                    header: false,
                    footer: false,
                    callback: (error: any, json: any) => {
                        if (error) {
                            console.error("Celestial callback error:", error);
                            if (error.toString().includes('dsos')) {
                                console.warn("DSO data kon niet worden geladen.");
                            } else {
                                setError('Fout bij laden van astronomische data.');
                            }
                        } else {
                            if (window.Celestial && window.Celestial.skyview) {
                                window.Celestial.skyview({ 
                                    "location": [lat, lon], 
                                    "date": getLocalTime(appliedConfig.timeOffset) 
                                });
                            }
                        }
                    }
                }; 

                // Explicitly disable features if mode is none
                if (appliedConfig.constellationMode === 'none') {
                    config.constellations.show = false;
                    config.constellations.line = false;
                    config.constellations.names = false;
                    config.constellations.boundaries = false;
                    config.lines.graticule.show = false;
                    config.lines.constellation.show = false;
                }                
                
                container.innerHTML = '';
                
                window.Celestial.display(config);

                // Geen interactie listeners meer nodig
                
                setLoadingProgress(95);
                setLoadingStatus('Sterrenkaart renderen...');

                setTimeout(() => {
                    setLoadingProgress(100);
                    setLoadingStatus('Klaar!');
                    setIsMapReady(true);
                }, 1000);
                
            } catch (err) {
                console.error("[StarMap] Celestial init error:", err);
                setError('Fout bij initialiseren van sterrenkaart.');
                setIsMapReady(true);
            }
        };

        const timer = setTimeout(initCelestialMap, 500); 
        return () => clearTimeout(timer);
    }, [isOpen, scriptsLoaded.celestial, appliedConfig]);

    // Reset status on open
    useEffect(() => {
        if (isOpen && !scriptsLoaded.celestial) {
            setIsMapReady(false);
            setLoadingProgress(0);
            setLoadingStatus('Opstarten...');
        }
    }, [isOpen, scriptsLoaded.celestial]);

    // Helpers
    const getLocalTime = (offset: number) => {
        const now = new Date();
        const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
        const destTime = new Date(utc + (utcOffsetSeconds * 1000));
        return new Date(destTime.getTime() + (offset * 60000));
    };

    const overlayOpacity = appliedConfig.showRealClouds ? Math.min(Math.max(cloudCover / 100, 0), 1) : 0;
    const isTooCloudy = appliedConfig.showRealClouds && cloudCover > 80;

    const formatOffset = (offset: number) => {
        if (offset === 0) return "Nu";
        const hours = Math.floor(Math.abs(offset) / 60);
        const mins = Math.abs(offset) % 60;
        const sign = offset > 0 ? "+" : "-";
        return `${sign}${hours}u ${mins}m`;
    };

    const targetTimeStr = getLocalTime(appliedConfig.timeOffset).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });

    const updatePending = (key: keyof StarMapConfig, value: any) => {
        setPendingConfig(prev => ({ ...prev, [key]: value }));
    };

    const handleApply = () => {
        setAppliedConfig(pendingConfig);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(pendingConfig));
        // setIsConfigMobileOpen(false); // Niet meer nodig want config staat nu onderaan
    };

    const hasChanges = JSON.stringify(appliedConfig) !== JSON.stringify(pendingConfig);

    return (
        <Modal isOpen={isOpen} onClose={onClose} fullScreen hideHeader className="bg-[#0b1a26]">
            <div className="flex flex-col h-full w-full overflow-y-auto custom-scrollbar">
                {/* Main Map Area */}
                <div className="relative w-full flex-shrink-0 flex items-center justify-center bg-[#0b1a26] py-4">
                    
                    {/* Header Overlay */}
                    <div className="absolute top-0 left-0 right-0 z-20 p-3 md:p-6 flex justify-between items-start pointer-events-none">
                        <div className="bg-[#0b1a26]/80 backdrop-blur-md border border-white/10 px-4 py-2 md:px-6 md:py-3 rounded-2xl md:rounded-full flex flex-col md:flex-row md:items-center gap-2 md:gap-6 shadow-xl pointer-events-auto max-w-[80%]">
                            <span className="font-black text-white uppercase text-sm md:text-lg tracking-tighter truncate">{locationName}</span>
                            <div className="hidden md:block h-4 w-px bg-white/10"></div>
                            <div className="flex flex-wrap items-center gap-3 md:gap-4 text-[10px] md:text-xs font-bold text-slate-400">
                                <span className="flex items-center gap-1"><Icon name="thermostat" /> {Math.round(temp)}°C</span>
                                <span className="flex items-center gap-1"><Icon name="cloud" /> {Math.round(cloudCover)}%</span>
                                <span className="flex items-center gap-1 text-indigo-400"><Icon name="schedule" /> {targetTimeStr}</span>
                            </div>
                        </div>
                        <button 
                            onClick={onClose} 
                            className="pointer-events-auto p-2 md:p-3 bg-white/5 hover:bg-white/10 rounded-full text-white/60 hover:text-white transition-all border border-white/5 hover:border-white/20"
                        >
                            <Icon name="close" className="text-lg md:text-xl" />
                        </button>
                    </div>

                    {/* Map */}
                    <div className="relative w-[95vw] md:w-[80vw] max-w-[1000px] aspect-square rounded-full overflow-hidden border-4 border-white/5 shadow-2xl bg-[#0b1a26] mt-4 md:mt-20 max-h-[75vh]">
                         <div 
                            key={JSON.stringify(appliedConfig)}
                            id="celestial-map" 
                            className="w-full h-full absolute inset-0 scale-[1.02]"
                        ></div>
                        
                        {/* Clouds Overlay */}
                        <div 
                            className="absolute inset-0 bg-[#0b1a26] pointer-events-none transition-opacity duration-1000 z-10 flex items-center justify-center"
                            style={{ opacity: overlayOpacity }}
                        >
                            {overlayOpacity > 0.9 && (
                                <div className="text-center p-6">
                                    <p className="text-white font-bold text-xl mb-1">☁️ Geen sterren zichtbaar</p>
                                    <p className="text-white/70 text-sm">Het is volledig bewolkt op deze locatie</p>
                                </div>
                            )}
                        </div>

                         {/* Too Cloudy Message */}
                         {isTooCloudy && overlayOpacity <= 0.9 && (
                            <div className="absolute inset-0 flex items-center justify-center z-40 pointer-events-none p-6 text-center">
                                <div className="bg-black/60 px-6 py-4 rounded-3xl backdrop-blur-md border border-white/10">
                                    <p className="text-white font-bold text-lg mb-1">☁️ Veel bewolking</p>
                                    <p className="text-white/70 text-xs">Zet de bewolking uit voor helder zicht</p>
                                </div>
                            </div>
                        )}

                        {/* Loading State */}
                        {!isMapReady && !error && (
                            <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#0b1a26]/90 backdrop-blur-md">
                                <div className="w-12 h-12 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin mb-4"></div>
                                <p className="text-white font-bold">{loadingStatus}</p>
                                <p className="text-indigo-400 text-xs font-mono mt-1">{Math.round(loadingProgress)}%</p>
                            </div>
                        )}
                        {error && (
                             <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#0b1a26]/90 backdrop-blur-md text-red-400 p-6 text-center">
                                <Icon name="error" className="text-4xl mb-2" />
                                <p>{error}</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Configuration Panel - Now Below Map */}
                <div className="w-full bg-[#08121a] border-t border-white/5 p-6 z-40">
                    <div className="max-w-6xl mx-auto">
                        <div className="flex flex-col md:flex-row items-center justify-between mb-6">
                            <div>
                                <h2 className="text-white font-black text-lg flex items-center gap-2">
                                    <Icon name="tune" className="text-indigo-500" />
                                    Kaart Instellingen
                                </h2>
                                <p className="text-slate-500 text-xs mt-1">Pas de weergave van de sterrenkaart aan</p>
                            </div>
                            <button 
                                onClick={handleApply}
                                disabled={!hasChanges}
                                className={`mt-4 md:mt-0 px-8 py-3 rounded-xl font-black text-sm uppercase tracking-wide transition-all shadow-lg flex items-center gap-2 ${
                                    hasChanges 
                                    ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-500/20' 
                                    : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                                }`}
                            >
                                <Icon name="refresh" className={hasChanges ? 'animate-spin-slow' : ''} />
                                {hasChanges ? 'Toepassen' : 'Up-to-date'}
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            {/* Tijd */}
                            <div className="space-y-3">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Tijdreizen</label>
                                <div className="bg-white/5 p-4 rounded-xl border border-white/5">
                                    <div className="flex justify-between items-center mb-4">
                                        <span className="text-white font-bold text-sm">Verschuiving</span>
                                        <span className="text-xs font-mono text-indigo-400 bg-indigo-500/10 px-2 py-1 rounded">
                                            {formatOffset(pendingConfig.timeOffset)}
                                        </span>
                                    </div>
                                    <input 
                                        type="range" min="-720" max="720" step="30"
                                        value={pendingConfig.timeOffset}
                                        onChange={(e) => updatePending('timeOffset', parseInt(e.target.value))}
                                        className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                                    />
                                    <button 
                                        onClick={() => updatePending('timeOffset', 0)}
                                        className="mt-4 w-full py-2 text-xs font-bold text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
                                    >
                                        Reset naar Nu
                                    </button>
                                </div>
                            </div>

                            {/* Weergave Modus & Details */}
                            <div className="space-y-4">
                                <div className="space-y-3">
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Sterrenbeelden</label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {(['none', 'top10', 'all'] as const).map(mode => (
                                            <button
                                                key={mode}
                                                onClick={() => updatePending('constellationMode', mode)}
                                                className={`py-2 px-1 rounded-lg text-[10px] font-bold uppercase transition-all border ${
                                                    pendingConfig.constellationMode === mode 
                                                    ? 'bg-indigo-600 text-white border-indigo-500' 
                                                    : 'bg-white/5 text-slate-400 border-transparent hover:bg-white/10'
                                                }`}
                                            >
                                                {mode === 'none' ? 'Geen' : mode === 'top10' ? 'Top 10' : 'Alles'}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                
                                <div className="space-y-2">
                                     <label className="flex items-center justify-between p-2 bg-white/5 rounded-lg border border-white/5 cursor-pointer hover:bg-white/10 transition-colors">
                                        <span className="text-xs text-slate-300 font-medium">Lijnen</span>
                                        <input 
                                            type="checkbox" 
                                            checked={pendingConfig.showLines}
                                            onChange={(e) => updatePending('showLines', e.target.checked)}
                                            disabled={pendingConfig.constellationMode === 'none'}
                                            className="w-4 h-4 rounded border-white/20 bg-black/20 text-indigo-500 focus:ring-offset-0 focus:ring-indigo-500 disabled:opacity-50"
                                        />
                                    </label>
                                    <label className="flex items-center justify-between p-2 bg-white/5 rounded-lg border border-white/5 cursor-pointer hover:bg-white/10 transition-colors">
                                        <span className="text-xs text-slate-300 font-medium">Namen</span>
                                        <input 
                                            type="checkbox" 
                                            checked={pendingConfig.showNames}
                                            onChange={(e) => updatePending('showNames', e.target.checked)}
                                            disabled={pendingConfig.constellationMode === 'none'}
                                            className="w-4 h-4 rounded border-white/20 bg-black/20 text-indigo-500 focus:ring-offset-0 focus:ring-indigo-500 disabled:opacity-50"
                                        />
                                    </label>
                                </div>
                            </div>

                            {/* Objecten */}
                            <div className="space-y-3">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Objecten</label>
                                <div className="space-y-2">
                                    <label className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5 cursor-pointer hover:bg-white/10 transition-colors">
                                        <span className="text-sm text-slate-300 font-medium">Nevels & Stelsels</span>
                                        <div className={`w-10 h-6 rounded-full p-1 transition-colors ${pendingConfig.showDSOs ? 'bg-indigo-600' : 'bg-slate-700'}`}>
                                            <div className={`w-4 h-4 bg-white rounded-full transition-transform ${pendingConfig.showDSOs ? 'translate-x-4' : ''}`}></div>
                                        </div>
                                        <input type="checkbox" className="hidden" checked={pendingConfig.showDSOs} onChange={(e) => updatePending('showDSOs', e.target.checked)} />
                                    </label>
                                    <label className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5 cursor-pointer hover:bg-white/10 transition-colors">
                                        <span className="text-sm text-slate-300 font-medium">Melkweg</span>
                                        <div className={`w-10 h-6 rounded-full p-1 transition-colors ${pendingConfig.showMilkyWay ? 'bg-indigo-600' : 'bg-slate-700'}`}>
                                            <div className={`w-4 h-4 bg-white rounded-full transition-transform ${pendingConfig.showMilkyWay ? 'translate-x-4' : ''}`}></div>
                                        </div>
                                        <input type="checkbox" className="hidden" checked={pendingConfig.showMilkyWay} onChange={(e) => updatePending('showMilkyWay', e.target.checked)} />
                                    </label>
                                    <label className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5 cursor-pointer hover:bg-white/10 transition-colors">
                                        <span className="text-sm text-slate-300 font-medium">Bewolking</span>
                                        <div className={`w-10 h-6 rounded-full p-1 transition-colors ${pendingConfig.showRealClouds ? 'bg-indigo-600' : 'bg-slate-700'}`}>
                                            <div className={`w-4 h-4 bg-white rounded-full transition-transform ${pendingConfig.showRealClouds ? 'translate-x-4' : ''}`}></div>
                                        </div>
                                        <input type="checkbox" className="hidden" checked={pendingConfig.showRealClouds} onChange={(e) => updatePending('showRealClouds', e.target.checked)} />
                                    </label>
                                </div>
                            </div>

                            {/* Zichtbaarheid Slider */}
                            <div className="space-y-3">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Ster Helderheid</label>
                                <div className="bg-white/5 p-4 rounded-xl border border-white/5">
                                    <input 
                                        type="range" min="2" max="6" step="0.5"
                                        value={pendingConfig.starMagnitude}
                                        onChange={(e) => updatePending('starMagnitude', parseFloat(e.target.value))}
                                        className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500 mb-2"
                                    />
                                    <div className="flex justify-between text-[10px] font-bold text-slate-500 uppercase">
                                        <span>Alleen Fel</span>
                                        <span>Alles</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </Modal>
    );
};
