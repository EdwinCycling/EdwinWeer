
import React, { useState, useRef } from 'react';
import { ViewState, AppSettings, Location } from '../types';
import { Icon } from '../components/Icon';
import { useAuth } from '../contexts/AuthContext';
import { getUsage, loadRemoteUsage } from '../services/usageService';
import { getTranslation } from '../services/translations';
import { searchCityByName } from '../services/geoService';
import { jsPDF } from 'jspdf';
import { Toast } from '../components/Toast';

interface SongWriterViewProps {
    onNavigate: (view: ViewState) => void;
    settings: AppSettings;
    onUpdateSettings: (settings: AppSettings) => void;
}

export const SongWriterView: React.FC<SongWriterViewProps> = ({ onNavigate, settings }) => {
    const { user } = useAuth();
    const t = (key: string) => getTranslation(key, settings.language);

    const [step, setStep] = useState<'form' | 'loading' | 'view'>('form');
    const [error, setError] = useState<string | null>(null);
    const [baroCredits, setBaroCredits] = useState<number>(0);
    
    // Form State
    const [event, setEvent] = useState<string>('birth');
    const [protagonist, setProtagonist] = useState<string>('');
    const [date, setDate] = useState<string>('');
    const [location, setLocation] = useState<Location | null>(null);
    const [weatherRole, setWeatherRole] = useState<string>('none');
    const [tone, setTone] = useState<string>('none');
    const [rhymeScheme, setRhymeScheme] = useState<string>('aabb');
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<Location[]>([]);
    const [isSearchOpen, setIsSearchOpen] = useState(false);

    // Result State
    const [song, setSong] = useState<{ title: string; lyrics: string; weather_summary?: string } | null>(null);
    const [weatherContext, setWeatherContext] = useState<any>(null);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
    const [hasCopied, setHasCopied] = useState(false);

    // Load initial credits
    React.useEffect(() => {
        const init = async () => {
            if (user) {
                await loadRemoteUsage(user.uid);
                const usage = getUsage();
                setBaroCredits(usage.baroCredits || 0);
            }
        };
        init();
    }, [user]);

    const canGenerate = baroCredits >= 1;

    // Search Location
    const handleSearch = async (query: string) => {
        setSearchQuery(query);
        if (query.length > 2) {
            const results = await searchCityByName(query);
            setSearchResults(results);
            setIsSearchOpen(true);
        } else {
            setSearchResults([]);
            setIsSearchOpen(false);
        }
    };

    const handleSelectLocation = (loc: Location) => {
        setLocation(loc);
        setSearchQuery(loc.name);
        setIsSearchOpen(false);
    };

    const handleSubmit = async () => {
        if (!canGenerate) return;
        if (!date || !location || !protagonist) {
            setError(t('error.boundary.message'));
            return;
        }

        // Check for future date (Open-Meteo Archive only works for past dates)
        const selectedDate = new Date(date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        if (selectedDate >= today) {
            setError("Kies een datum in het verleden (minimaal gisteren). De historie gaat tot gisteren.");
            return;
        }

        setStep('loading');
        setError(null);

        try {
            const token = await user?.getIdToken();
            const response = await fetch('/.netlify/functions/generate-song', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                    'X-App-Source': 'BaroWeatherApp'
                },
                body: JSON.stringify({
                    date,
                    location,
                    event,
                    protagonist,
                    language: settings.language,
                    weatherRole,
                    tone,
                    rhymeScheme
                })
            });

            if (!response.ok) {
                let errorMessage = 'Failed to generate song';
                try {
                    const errData = await response.json();
                    console.error("Server Error Details:", errData.details);
                    errorMessage = errData.error || errorMessage;
                } catch (jsonErr) {
                    console.error("Could not parse error response as JSON", jsonErr);
                    // If we can't parse JSON, it might be a proxy error or a crash
                    if (response.status === 500) {
                        errorMessage = "Server error (500). Is de Netlify functions server gestart?";
                    } else {
                        errorMessage = `Fout (${response.status}): ${response.statusText}`;
                    }
                }
                throw new Error(errorMessage);
            }

            const data = await response.json();
            setSong(data.song);
            setWeatherContext(data.weather);
            
            // Refresh credits from server
            if (user) {
                await loadRemoteUsage(user.uid);
                const usage = getUsage();
                setBaroCredits(usage.baroCredits || 0);
            }
            
            setStep('view');
        } catch (e: any) {
            console.error(e);
            setError(e.message);
            setStep('form');
        }
    };

    const songRef = useRef<HTMLDivElement>(null);

    const handleDownloadPDF = async () => {
        if (!songRef.current) return;
        
        try {
            const html2canvas = (await import('html2canvas')).default;

            const canvas = await html2canvas(songRef.current, {
                scale: 2,
                backgroundColor: '#ffffff',
                useCORS: true,
                onclone: (clonedDoc) => {
                    const element = clonedDoc.querySelector('.shadow-2xl');
                    if (element) {
                        element.classList.remove('shadow-2xl');
                        (element as HTMLElement).style.boxShadow = 'none';
                    }
                    
                    // Fix for oklch/oklab unsupported colors in html2canvas
                    const allElements = clonedDoc.getElementsByTagName('*');
                    for (let i = 0; i < allElements.length; i++) {
                        const el = allElements[i] as HTMLElement;
                        const style = window.getComputedStyle(el);
                        
                        // If any color property uses oklch/oklab, replace it with a safe fallback
                        if (style.color && (style.color.includes('oklch') || style.color.includes('oklab'))) {
                            el.style.color = '#2d3748'; 
                        }
                        if (style.backgroundColor && (style.backgroundColor.includes('oklch') || style.backgroundColor.includes('oklab'))) {
                            el.style.backgroundColor = 'transparent';
                        }
                        if (style.borderColor && (style.borderColor.includes('oklch') || style.borderColor.includes('oklab'))) {
                            el.style.borderColor = '#e2e8f0';
                        }

                        // Adjust font size for lyrics in PDF to prevent overflow
                        if (el.classList.contains('prose') || el.classList.contains('lyrics-body')) {
                            el.style.fontSize = '12pt';
                            el.style.lineHeight = '1.6';
                        }
                        if (el.tagName === 'H1') {
                            el.style.fontSize = '24pt';
                        }
                    }
                }
            });
            
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
            
            pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
            pdf.save(`Baro_Song_${protagonist.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`);
            setToast({ message: 'PDF gedownload!', type: 'success' });
        } catch (e: any) {
            console.error('PDF Error:', e);
            setToast({ message: 'PDF Error: ' + e.message, type: 'error' });
        }
    };

    const handleShare = async () => {
        if (navigator.share && song) {
            try {
                await navigator.share({
                    title: song.title,
                    text: song.lyrics,
                    url: window.location.href
                });
            } catch (e) {
                console.error('Share failed:', e);
            }
        } else {
            handleCopy();
        }
    };

    const handleCopy = () => {
        if (song) {
            navigator.clipboard.writeText(`${song.title}\n\n${song.lyrics}`);
            setToast({ message: 'Songtekst gekopieerd!', type: 'success' });
            setHasCopied(true);
        }
    };

    if (step === 'loading') {
        return (
            <div className="min-h-screen pt-24 pb-32 px-4 flex flex-col items-center justify-center text-center">
                <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-indigo-600 mb-6"></div>
                <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">{t('songwriter.form.generating')}</h2>
                <p className="text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                    {t('songwriter.subtitle')}
                </p>
            </div>
        );
    }

    if (step === 'view' && song) {
        return (
            <div className="min-h-screen pt-20 pb-32 px-4 md:px-8">
                {/* Back Button */}
                <button 
                    onClick={() => setStep('form')}
                    className="mb-6 flex items-center gap-2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white transition-colors"
                >
                    <Icon name="arrow_back" />
                    {t('back')}
                </button>

                <div className="grid lg:grid-cols-2 gap-8 max-w-7xl mx-auto">
                    {/* Lyrics Sheet */}
                    <div className="relative perspective-1000">
                         <div 
                            ref={songRef}
                            className="bg-[#fffdf5] text-[#2d3748] shadow-2xl p-8 md:p-12 min-h-[297mm] relative overflow-hidden rounded-sm"
                            style={{ fontFamily: '"Courier Prime", "Courier New", monospace' }}
                         >
                            {/* Music Texture Overlay */}
                            <div className="absolute inset-0 opacity-[0.05] pointer-events-none" 
                                 style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='80' height='80' viewBox='0 0 80 80' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='1'%3E%3Cpath d='M50 50c0-5.523 4.477-10 10-10s10 4.477 10 10-4.477 10-10 10c0 0-10 0-10-10zm10 8c-4.418 0-8-3.582-8-8s3.582-8 8-8 8 3.582 8 8-3.582 8-8 8zm-22-8c0-5.523 4.477-10 10-10s10 4.477 10 10-4.477 10-10 10c0 0-10 0-10-10zm10 8c-4.418 0-8-3.582-8-8s3.582-8 8-8 8 3.582 8 8-3.582 8-8 8z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")` }} 
                            />

                            {/* Header */}
                            <div className="text-center mb-12 relative z-10 border-b-2 border-slate-800 pb-8 border-dashed">
                                <h1 className="text-3xl md:text-4xl font-bold text-[#1a202c] mb-4 uppercase tracking-widest">
                                    {song.title}
                                </h1>
                                <div className="text-sm font-bold uppercase tracking-wider text-slate-500">
                                    Song for {protagonist} • {new Date(date).toLocaleDateString(settings.language, { day: 'numeric', month: 'long', year: 'numeric' })}
                                </div>
                                <div className="text-xs text-slate-400 mt-2">
                                    {location?.name}
                                </div>
                            </div>

                            {/* Lyrics Body */}
                            <div className="lyrics-body prose prose-lg max-w-none text-center leading-relaxed relative z-10 whitespace-pre-wrap font-bold text-slate-700">
                                 {song.lyrics}
                            </div>

                            {/* Footer */}
                            <div className="mt-16 pt-8 border-t-2 border-slate-800 border-dashed text-center relative z-10">
                                <p className="text-xs text-slate-400 uppercase tracking-widest">
                                    Original Lyrics by Baro • Weather-Infused Music
                                </p>
                            </div>
                         </div>
                         
                         {/* Desktop Actions (Under Lyrics) */}
                         <div className="hidden lg:flex justify-center gap-4 mt-8 w-full">
                            <button 
                                onClick={handleDownloadPDF}
                                className="flex-1 flex items-center justify-center gap-2 px-6 py-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl font-bold hover:opacity-90 transition-opacity shadow-lg"
                            >
                                <Icon name="download" />
                                {t('pdf')}
                            </button>
                            <button 
                                onClick={handleShare}
                                className="flex-1 flex items-center justify-center gap-2 px-6 py-4 bg-white dark:bg-white/10 text-slate-700 dark:text-white border border-slate-200 dark:border-white/10 rounded-xl font-bold hover:bg-slate-50 dark:hover:bg-white/20 transition-colors"
                            >
                                <Icon name="share" />
                                {t('share')}
                            </button>
                         </div>
                    </div>

                    {/* Instructions Panel */}
                    <div className="space-y-6">
                        <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 md:p-8 shadow-xl border border-slate-100 dark:border-white/5 sticky top-24">
                            <div className="flex items-center gap-4 mb-6">
                                <div className="bg-gradient-to-br from-indigo-500 to-purple-600 w-12 h-12 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-500/30">
                                    <Icon name="music_note" className="text-2xl" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                                        {t('songwriter.instructions.title')}
                                    </h2>
                                    <p className="text-sm text-slate-500 dark:text-slate-400">
                                        {t('songwriter.instructions.subtitle')}
                                    </p>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className={`p-4 rounded-xl transition-all duration-300 ${hasCopied ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' : 'bg-slate-50 dark:bg-white/5 border-slate-100 dark:border-white/5'} border`}>
                                    <div className="flex items-start gap-3">
                                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${hasCopied ? 'bg-green-500 text-white' : 'bg-slate-200 dark:bg-white/20 text-slate-600 dark:text-white'}`}>1</div>
                                        <div className="flex-1">
                                            <p className="font-bold text-slate-800 dark:text-white text-sm mb-2">{t('songwriter.step1.title')}</p>
                                            <button 
                                                onClick={handleCopy}
                                                className={`w-full py-2 px-4 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-colors ${hasCopied ? 'bg-green-500 text-white' : 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90'}`}
                                            >
                                                {hasCopied ? <Icon name="check" /> : <Icon name="content_copy" />}
                                                {hasCopied ? t('songwriter.copied') : t('songwriter.action.copy')}
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div className={`p-4 rounded-xl border border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-white/5 transition-opacity duration-300 ${!hasCopied ? 'opacity-50' : 'opacity-100'}`}>
                                    <div className="flex items-start gap-3">
                                        <div className="w-6 h-6 rounded-full bg-slate-200 dark:bg-white/20 text-slate-600 dark:text-white flex items-center justify-center text-xs font-bold shrink-0">2</div>
                                        <div className="flex-1">
                                            <p className="font-bold text-slate-800 dark:text-white text-sm mb-2">{t('songwriter.step2.title')}</p>
                                            <a 
                                                href="https://suno.com" 
                                                target="_blank" 
                                                rel="noopener noreferrer"
                                                className={`block w-full text-center py-2 px-4 rounded-lg text-sm font-bold transition-colors ${hasCopied ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-500/30' : 'bg-slate-200 dark:bg-white/10 text-slate-400 cursor-not-allowed'}`}
                                                onClick={(e) => !hasCopied && e.preventDefault()}
                                            >
                                                {t('songwriter.action.suno')}
                                            </a>
                                        </div>
                                    </div>
                                </div>

                                <div className="p-4 rounded-xl border border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-white/5">
                                    <div className="flex items-start gap-3">
                                        <div className="w-6 h-6 rounded-full bg-slate-200 dark:bg-white/20 text-slate-600 dark:text-white flex items-center justify-center text-xs font-bold shrink-0">3</div>
                                        <div className="flex-1">
                                            <p className="font-bold text-slate-800 dark:text-white text-sm mb-1">{t('songwriter.step3.title')}</p>
                                            <p className="text-xs text-slate-500 dark:text-slate-400">{t('songwriter.step3.desc')}</p>
                                        </div>
                                    </div>
                                </div>
                                
                                <div className="pt-4 border-t border-slate-100 dark:border-white/5">
                                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">{t('songwriter.suggestions')}</h3>
                                    <div className="space-y-3">
                                        <div className="bg-slate-50 dark:bg-white/5 p-3 rounded-lg border border-slate-100 dark:border-white/5">
                                            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                                                {t('songwriter.style_music')}
                                            </p>
                                        </div>
                                        <div className="bg-slate-50 dark:bg-white/5 p-3 rounded-lg border border-slate-100 dark:border-white/5">
                                            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                                                {t('songwriter.style_voice')}
                                            </p>
                                        </div>
                                        <div className="bg-slate-50 dark:bg-white/5 p-3 rounded-lg border border-slate-100 dark:border-white/5">
                                            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                                                {t('songwriter.style_emotion')}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <p className="mt-6 text-[10px] text-slate-400 text-center leading-relaxed">
                                {t('songwriter.disclaimer')}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Sticky Action Bar (Mobile Only for PDF/Share) */}
                <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-white/90 dark:bg-slate-800/90 backdrop-blur-xl border border-slate-200 dark:border-white/10 shadow-2xl rounded-full p-2 flex gap-2 z-50 lg:hidden">
                    <button 
                        onClick={handleDownloadPDF}
                        className="p-3 hover:bg-slate-100 dark:hover:bg-white/10 rounded-full transition-colors text-slate-700 dark:text-white"
                        title={t('pdf')}
                    >
                        <Icon name="download" />
                    </button>
                    <div className="w-px bg-slate-200 dark:bg-white/10 my-2" />
                    <button 
                        onClick={handleShare}
                        className="p-3 hover:bg-slate-100 dark:hover:bg-white/10 rounded-full transition-colors text-slate-700 dark:text-white"
                        title={t('share')}
                    >
                        <Icon name="share" />
                    </button>
                </div>

                {toast && (
                    <Toast 
                        message={toast.message} 
                        type={toast.type} 
                        onClose={() => setToast(null)} 
                    />
                )}
            </div>
        );
    }

    return (
        <div className="pt-24 pb-32 px-4 max-w-2xl mx-auto">
            <div className="mb-8 text-center">
                <div className="inline-flex items-center justify-center p-3 bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 rounded-2xl mb-4">
                    <Icon name="music_note" className="text-3xl" />
                </div>
                <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">{t('songwriter.title')}</h1>
                <p className="text-slate-500 dark:text-slate-400">
                    {t('songwriter.intro_desc')}
                </p>
            </div>

            {/* Credit Info */}
            <div className="bg-slate-50 dark:bg-white/5 rounded-2xl p-4 mb-8 flex items-center justify-between border border-slate-200 dark:border-white/5">
                <div className="flex items-center gap-3">
                    <div className="bg-amber-100 dark:bg-amber-500/20 p-2 rounded-lg text-amber-600 dark:text-amber-400">
                        <Icon name="monetization_on" />
                    </div>
                    <div>
                        <p className="font-bold text-slate-800 dark:text-white">Baro Credits</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Saldo: {baroCredits}</p>
                    </div>
                </div>
                {!canGenerate && (
                    <button 
                        onClick={() => onNavigate(ViewState.PRICING)}
                        className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                    >
                        Opwaarderen
                    </button>
                )}
            </div>

            <div className="space-y-6 bg-white dark:bg-card-dark p-6 rounded-3xl shadow-sm border border-slate-100 dark:border-white/5">
                
                {/* Event */}
                <div>
                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                        {t('storyteller.form.event')}
                    </label>
                    <select 
                        value={event} 
                        onChange={e => setEvent(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                        <option value="birth" className="bg-white dark:bg-slate-800 text-slate-800 dark:text-white">{t('storyteller.event.birth')}</option>
                        <option value="wedding" className="bg-white dark:bg-slate-800 text-slate-800 dark:text-white">{t('storyteller.event.wedding')}</option>
                        <option value="anniversary" className="bg-white dark:bg-slate-800 text-slate-800 dark:text-white">{t('storyteller.event.anniversary')}</option>
                        <option value="first_date" className="bg-white dark:bg-slate-800 text-slate-800 dark:text-white">{t('storyteller.event.first_date')}</option>
                        <option value="vacation" className="bg-white dark:bg-slate-800 text-slate-800 dark:text-white">{t('storyteller.event.vacation')}</option>
                        <option value="love" className="bg-white dark:bg-slate-800 text-slate-800 dark:text-white">{t('songwriter.event.love')}</option>
                        <option value="meeting" className="bg-white dark:bg-slate-800 text-slate-800 dark:text-white">{t('songwriter.event.meeting')}</option>
                        <option value="other" className="bg-white dark:bg-slate-800 text-slate-800 dark:text-white">{t('storyteller.event.other')}</option>
                    </select>
                </div>

                {/* Protagonist */}
                <div>
                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                        {t('storyteller.form.protagonist')}
                    </label>
                    <input 
                        type="text" 
                        value={protagonist}
                        onChange={e => setProtagonist(e.target.value.slice(0, 40))}
                        placeholder="Bijv. Paul Jansen"
                        maxLength={40}
                        className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                </div>

                {/* Date */}
                <div>
                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                        {t('storyteller.form.date')}
                    </label>
                    <input 
                        type="date" 
                        value={date}
                        onChange={e => setDate(e.target.value)}
                        max={new Date().toISOString().split('T')[0]}
                        min="1950-01-01"
                        className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                </div>

                {/* Weather Role */}
                <div>
                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                        {t('songwriter.form.weather_role')}
                    </label>
                    <select 
                        value={weatherRole} 
                        onChange={e => setWeatherRole(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                        <option value="none" className="bg-white dark:bg-slate-800 text-slate-800 dark:text-white">{t('songwriter.weather_role.none')}</option>
                        <option value="romantic" className="bg-white dark:bg-slate-800 text-slate-800 dark:text-white">{t('songwriter.weather_role.romantic')}</option>
                        <option value="enemy" className="bg-white dark:bg-slate-800 text-slate-800 dark:text-white">{t('songwriter.weather_role.enemy')}</option>
                        <option value="funny" className="bg-white dark:bg-slate-800 text-slate-800 dark:text-white">{t('songwriter.weather_role.funny')}</option>
                        <option value="metaphor" className="bg-white dark:bg-slate-800 text-slate-800 dark:text-white">{t('songwriter.weather_role.metaphor')}</option>
                    </select>
                </div>

                {/* Tone */}
                <div>
                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                        {t('songwriter.form.tone')}
                    </label>
                    <select 
                        value={tone} 
                        onChange={e => setTone(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                        <option value="none" className="bg-white dark:bg-slate-800 text-slate-800 dark:text-white">{t('songwriter.tone.none')}</option>
                        <option value="formal" className="bg-white dark:bg-slate-800 text-slate-800 dark:text-white">{t('songwriter.tone.formal')}</option>
                        <option value="jovial" className="bg-white dark:bg-slate-800 text-slate-800 dark:text-white">{t('songwriter.tone.jovial')}</option>
                        <option value="funny" className="bg-white dark:bg-slate-800 text-slate-800 dark:text-white">{t('songwriter.tone.funny')}</option>
                        <option value="loving" className="bg-white dark:bg-slate-800 text-slate-800 dark:text-white">{t('songwriter.tone.loving')}</option>
                        <option value="rhyme" className="bg-white dark:bg-slate-800 text-slate-800 dark:text-white">{t('songwriter.tone.rhyme')}</option>
                    </select>
                </div>

                {/* Rhyme Scheme */}
                <div>
                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                        {t('songwriter.form.rhyme_scheme')}
                    </label>
                    <select 
                        value={rhymeScheme} 
                        onChange={e => setRhymeScheme(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                        <option value="aabb" className="bg-white dark:bg-slate-800 text-slate-800 dark:text-white">{t('songwriter.rhyme_scheme.aabb')}</option>
                        <option value="abab" className="bg-white dark:bg-slate-800 text-slate-800 dark:text-white">{t('songwriter.rhyme_scheme.abab')}</option>
                        <option value="abcb" className="bg-white dark:bg-slate-800 text-slate-800 dark:text-white">{t('songwriter.rhyme_scheme.abcb')}</option>
                        <option value="freestyle" className="bg-white dark:bg-slate-800 text-slate-800 dark:text-white">{t('songwriter.rhyme_scheme.freestyle')}</option>
                    </select>
                </div>

                {/* Location Search */}
                <div className="relative">
                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                        {t('storyteller.form.location')}
                    </label>
                    <div className="relative">
                        <Icon name="search" className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => handleSearch(e.target.value)}
                            placeholder={t('storyteller.form.location')}
                            className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl pl-10 pr-4 py-3 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                    </div>
                    {isSearchOpen && searchResults.length > 0 && (
                        <div className="absolute z-50 left-0 right-0 mt-2 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-100 dark:border-white/5 max-h-60 overflow-y-auto">
                            {searchResults.map((res, i) => (
                                <button
                                    key={i}
                                    onClick={() => handleSelectLocation(res)}
                                    className="w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-white/5 border-b border-slate-100 dark:border-white/5 last:border-0 flex items-center gap-2 text-slate-800 dark:text-white"
                                >
                                    <Icon name="location_on" className="text-slate-400" />
                                    <div>
                                        <p className="font-bold text-sm">{res.name}</p>
                                        <p className="text-xs text-slate-500">{res.country} {res.admin1}</p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {error && (
                    <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl text-sm">
                        {error}
                    </div>
                )}

                <button
                    onClick={handleSubmit}
                    disabled={!canGenerate || !date || !location || !protagonist}
                    className={`w-full py-4 rounded-xl font-bold text-lg transition-all ${
                        canGenerate && date && location && protagonist
                            ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg hover:shadow-indigo-500/25'
                            : 'bg-slate-200 dark:bg-white/10 text-slate-400 cursor-not-allowed'
                    }`}
                >
                    {canGenerate ? t('songwriter.form.generate') : t('storyteller.form.insufficient_credits')}
                </button>

            </div>
        </div>
    );
};
