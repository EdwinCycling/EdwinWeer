
import React, { useState, useRef } from 'react';
import { ViewState, AppSettings, Location } from '../types';
import { Icon } from '../components/Icon';
import { useAuth } from '../hooks/useAuth';
import { getUsage, loadRemoteUsage } from '../services/usageService';
import { getTranslation } from '../services/translations';
import { searchCityByName } from '../services/geoService';
import { jsPDF } from 'jspdf';
import { Toast } from '../components/Toast';

interface BaroStorytellerViewProps {
    onNavigate: (view: ViewState) => void;
    settings: AppSettings;
    onUpdateSettings: (settings: AppSettings) => void;
    isLimitReached?: boolean;
}

type StoryLength = 'short' | 'medium' | 'long';
type StoryTone = 'emotional' | 'humorous' | 'formal' | 'fairytale' | 'adventurous' | 'poetic';

export const BaroStorytellerView: React.FC<BaroStorytellerViewProps> = ({ onNavigate, settings, isLimitReached = false }) => {
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
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<Location[]>([]);
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [tone, setTone] = useState<StoryTone>('emotional');
    const [length, setLength] = useState<StoryLength>('medium');

    // Result State
    const [story, setStory] = useState<{ title: string; story: string; weather_summary?: string } | null>(null);
    const [weatherContext, setWeatherContext] = useState<any>(null);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

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
            setError(t('error.boundary.message')); // Generic error, should be specific
            return;
        }

        const selectedDate = new Date(date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        if (selectedDate >= today) {
             setError(t('storyteller.error.future_date') || 'Kies een datum in het verleden (minimaal gisteren). De historie gaat tot gisteren.');
             return;
        }

        setStep('loading');
        setError(null);

        try {
            const token = await user?.getIdToken();
            const response = await fetch('/.netlify/functions/baro-storyteller', {
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
                    tone,
                    length,
                    language: settings.language
                })
            });

            if (!response.ok) {
                let errorMessage = 'Failed to generate story';
                try {
                    const errData = await response.json();
                    console.error("Server Error Details:", errData.details);
                    errorMessage = errData.error || errorMessage;
                } catch (jsonErr) {
                    console.error("Could not parse error response as JSON", jsonErr);
                    if (response.status === 500) {
                        errorMessage = "Server error (500). Is de Netlify functions server gestart?";
                    } else {
                        errorMessage = `Fout (${response.status}): ${response.statusText}`;
                    }
                }
                throw new Error(errorMessage);
            }

            const data = await response.json();
            setStory(data.story);
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

    const storyRef = useRef<HTMLDivElement>(null);

    const handleDownloadPDF = async () => {
        if (!storyRef.current) return;
        
        try {
            // Dynamically import html2canvas to ensure it loads
            const html2canvas = (await import('html2canvas')).default;

            const canvas = await html2canvas(storyRef.current, {
                scale: 2,
                backgroundColor: '#fdfbf7', // Force standard hex color
                useCORS: true,
                onclone: (clonedDoc) => {
                    // Remove shadows or modern CSS that might cause oklab errors
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
                    }
                }
            });
            
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
            
            pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
            pdf.save(`Baro_Story_${protagonist.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`);
            setToast({ message: 'PDF gedownload!', type: 'success' });
        } catch (e: any) {
            console.error('PDF Error:', e);
            setToast({ message: 'PDF Error: ' + e.message, type: 'error' });
        }
    };

    const handleShare = async () => {
        if (navigator.share && story) {
            try {
                await navigator.share({
                    title: story.title,
                    text: story.story,
                    url: window.location.href
                });
            } catch (e) {
                console.error('Share failed:', e);
            }
        } else {
            // Fallback copy
            handleCopy();
        }
    };

    const handleCopy = () => {
        if (story) {
            navigator.clipboard.writeText(`${story.title}\n\n${story.story}`);
            setToast({ message: 'Verhaal gekopieerd!', type: 'success' });
        }
    };

    if (step === 'loading') {
        return (
            <div className="bg-bg-page min-h-screen pt-24 pb-32 px-4 flex flex-col items-center justify-center text-center">
                <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-indigo-600 mb-6"></div>
                <h2 className="text-2xl font-bold text-text-main mb-2">{t('storyteller.form.generating')}</h2>
                <p className="text-text-muted max-w-md mx-auto">
                    {t('storyteller.subtitle')}
                </p>
            </div>
        );
    }

    if (step === 'view' && story) {
        return (
            <div className="min-h-screen pt-20 pb-32 px-4 md:px-8">
                {/* Back Button */}
                <button 
                    onClick={() => setStep('form')}
                    className="mb-6 flex items-center gap-2 text-text-muted hover:text-text-main transition-colors"
                >
                    <Icon name="arrow_back" />
                    {t('back')}
                </button>

                {/* Story Container - A4 Ratio approx */}
                <div className="max-w-[210mm] mx-auto relative perspective-1000">
                     <div 
                        ref={storyRef}
                        className="bg-[#fdfbf7] text-[#2d3748] shadow-2xl p-8 md:p-16 min-h-[297mm] relative overflow-hidden"
                        style={{ fontFamily: 'Georgia, serif' }}
                     >
                        {/* Paper Texture Overlay (CSS Pattern) */}
                        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" 
                             style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")` }} 
                        />

                        {/* Header */}
                        <div className="text-center mb-12 relative z-10">
                            <div className="inline-block border-b-2 border-indigo-900/20 pb-4 mb-4">
                                <span className="uppercase tracking-[0.2em] text-xs font-bold text-indigo-900/60">
                                    {new Date(date).toLocaleDateString(settings.language, { day: 'numeric', month: 'long', year: 'numeric' })} • {location?.name}
                                </span>
                            </div>
                            <h1 className="text-4xl md:text-5xl font-bold text-[#1a202c] mb-6 leading-tight" style={{ fontFamily: '"Playfair Display", serif' }}>
                                {story.title}
                            </h1>
                            <div className="flex justify-center gap-6 text-sm italic text-slate-500 font-serif">
                                {story.weather_summary ? (
                                    <span>{story.weather_summary}</span>
                                ) : (
                                    <>
                                        <span>{weatherContext?.morning.text_nl} ({weatherContext?.morning.temp}°C)</span>
                                        <span>•</span>
                                        <span>{weatherContext?.afternoon.text_nl} ({weatherContext?.afternoon.temp}°C)</span>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Body */}
                        <div className="prose prose-lg max-w-none text-justify leading-relaxed relative z-10 story-body">
                             {/* First Letter Drop Cap Styling */}
                             <style>{`
                                .story-body p:first-of-type::first-letter {
                                    float: left;
                                    font-family: "Playfair Display", serif;
                                    font-size: 3.5em;
                                    line-height: 0.8;
                                    padding-right: 12px;
                                    padding-top: 4px;
                                    color: #d97706;
                                    font-weight: bold;
                                }
                             `}</style>
                             
                             {story.story.split('\n').map((para, i) => (
                                 para.trim() && <p key={i} className="mb-6">{para}</p>
                             ))}
                        </div>

                        {/* Footer */}
                        <div className="mt-16 pt-8 border-t border-slate-900/10 text-center relative z-10">
                            <p className="text-xs text-slate-400 italic font-serif">
                                {t('storyteller.viewer.footer')}
                            </p>
                        </div>
                     </div>
                </div>

                {/* Sticky Action Bar */}
                <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-white/90 dark:bg-slate-800/90 backdrop-blur-xl border border-slate-200 dark:border-white/10 shadow-2xl rounded-full p-2 flex gap-2 z-50">
                    <button 
                        onClick={handleDownloadPDF}
                        className="p-3 hover:bg-slate-100 dark:hover:bg-white/10 rounded-full transition-colors text-slate-700 dark:text-white flex items-center gap-2 pr-4"
                        title={t('storyteller.action.pdf')}
                    >
                        <Icon name="download" />
                        <span className="text-sm font-bold hidden md:inline">{t('pdf')}</span>
                    </button>
                    <div className="w-px bg-slate-200 dark:bg-white/10 my-2" />
                    <button 
                        onClick={handleShare}
                        className="p-3 hover:bg-slate-100 dark:hover:bg-white/10 rounded-full transition-colors text-slate-700 dark:text-white flex items-center gap-2 pr-4"
                        title={t('storyteller.action.share')}
                    >
                        <Icon name="share" />
                        <span className="text-sm font-bold hidden md:inline">{t('share')}</span>
                    </button>
                    <div className="w-px bg-slate-200 dark:bg-white/10 my-2" />
                    <button 
                        onClick={handleCopy}
                        className="p-3 hover:bg-slate-100 dark:hover:bg-white/10 rounded-full transition-colors text-slate-700 dark:text-white"
                        title={t('storyteller.action.copy')}
                    >
                        <Icon name="content_copy" />
                    </button>
                    <div className="w-px bg-slate-200 dark:bg-white/10 my-2" />
                    <button 
                        onClick={() => setStep('form')}
                        className="p-3 hover:bg-slate-100 dark:hover:bg-white/10 rounded-full transition-colors text-slate-700 dark:text-white"
                        title={t('close')}
                    >
                        <Icon name="close" />
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
        <div className="relative min-h-screen flex flex-col pb-24 overflow-y-auto text-text-main bg-bg-page transition-colors duration-300">
            <div className="relative z-10 max-w-2xl mx-auto p-6 pt-24">
            <div className="mb-8 text-center">
                <div className="inline-flex items-center justify-center p-3 bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 rounded-2xl mb-4">
                    <Icon name="auto_stories" className="text-3xl" />
                </div>
                <h1 className="text-3xl font-bold text-text-main mb-2">{t('storyteller.title')}</h1>
                <p className="text-text-muted">
                    {t('storyteller.subtitle')}
                </p>
            </div>

            {/* Credit Info */}
            <div className="bg-bg-card rounded-2xl p-4 mb-8 flex items-center justify-between border border-border-color">
                <div className="flex items-center gap-3">
                    <div className="bg-amber-100 dark:bg-amber-500/20 p-2 rounded-lg text-amber-600 dark:text-amber-400">
                        <Icon name="monetization_on" />
                    </div>
                    <div>
                        <p className="font-bold text-text-main">Baro Credits</p>
                        <p className="text-xs text-text-muted">Saldo: {baroCredits}</p>
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

            <div className="space-y-6 bg-bg-card p-6 rounded-3xl shadow-sm border border-border-color">
                
                {/* Event */}
                <div>
                    <label className="block text-sm font-bold text-text-main mb-2">
                        {t('storyteller.form.event')}
                    </label>
                    <select 
                        value={event} 
                        onChange={e => setEvent(e.target.value)}
                        className="w-full bg-bg-page border border-border-color rounded-xl px-4 py-3 text-text-main focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                        <option value="birth" className="bg-bg-card text-text-main">{t('storyteller.event.birth')}</option>
                        <option value="wedding" className="bg-bg-card text-text-main">{t('storyteller.event.wedding')}</option>
                        <option value="anniversary" className="bg-bg-card text-text-main">{t('storyteller.event.anniversary')}</option>
                        <option value="first_date" className="bg-bg-card text-text-main">{t('storyteller.event.first_date')}</option>
                        <option value="vacation" className="bg-bg-card text-text-main">{t('storyteller.event.vacation')}</option>
                        <option value="other" className="bg-bg-card text-text-main">{t('storyteller.event.other')}</option>
                    </select>
                </div>

                {/* Protagonist */}
                <div>
                    <label className="block text-sm font-bold text-text-main mb-2">
                        {t('storyteller.form.protagonist')}
                    </label>
                    <input 
                        type="text" 
                        value={protagonist}
                        onChange={e => setProtagonist(e.target.value.slice(0, 40))}
                        placeholder="Bijv. Paul Jansen"
                        maxLength={40}
                        className="w-full bg-bg-page border border-border-color rounded-xl px-4 py-3 text-text-main focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                </div>

                {/* Date */}
                <div>
                    <label className="block text-sm font-bold text-text-main mb-2">
                        {t('storyteller.form.date')}
                    </label>
                    <input 
                        type="date" 
                        value={date}
                        onChange={e => setDate(e.target.value)}
                        max={new Date().toISOString().split('T')[0]}
                        min="1950-01-01"
                        className="w-full bg-bg-page border border-border-color rounded-xl px-4 py-3 text-text-main focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                </div>

                {/* Location Search */}
                <div className="relative">
                    <label className="block text-sm font-bold text-text-main mb-2">
                        {t('storyteller.form.location')}
                    </label>
                    <div className="relative">
                        <Icon name="search" className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => handleSearch(e.target.value)}
                            placeholder={t('storyteller.form.location')}
                            className="w-full bg-bg-page border border-border-color rounded-xl pl-10 pr-4 py-3 text-text-main focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                    </div>
                    {isSearchOpen && searchResults.length > 0 && (
                        <div className="absolute z-50 left-0 right-0 mt-2 bg-bg-card rounded-xl shadow-xl border border-border-color max-h-60 overflow-y-auto">
                            {searchResults.map((res, i) => (
                                <button
                                    key={i}
                                    onClick={() => handleSelectLocation(res)}
                                    className="w-full text-left px-4 py-3 hover:bg-bg-page border-b border-border-color last:border-0 flex items-center gap-2 text-text-main"
                                >
                                    <Icon name="location_on" className="text-text-muted" />
                                    <div>
                                        <p className="font-bold text-sm">{res.name}</p>
                                        <p className="text-xs text-text-muted">{res.country} {res.admin1}</p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                    {/* Tone */}
                    <div>
                        <label className="block text-sm font-bold text-text-main mb-2">
                            {t('storyteller.form.tone')}
                        </label>
                        <select 
                            value={tone} 
                            onChange={e => setTone(e.target.value as StoryTone)}
                            className="w-full bg-bg-page border border-border-color rounded-xl px-4 py-3 text-text-main focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                            <option value="emotional" className="bg-bg-card text-text-main">{t('storyteller.tone.emotional')}</option>
                            <option value="humorous" className="bg-bg-card text-text-main">{t('storyteller.tone.humorous')}</option>
                            <option value="formal" className="bg-bg-card text-text-main">{t('storyteller.tone.formal')}</option>
                            <option value="fairytale" className="bg-bg-card text-text-main">{t('storyteller.tone.fairytale')}</option>
                            <option value="adventurous" className="bg-bg-card text-text-main">{t('storyteller.tone.adventurous')}</option>
                            <option value="poetic" className="bg-bg-card text-text-main">{t('storyteller.tone.poetic')}</option>
                        </select>
                    </div>

                    {/* Length */}
                    <div>
                        <label className="block text-sm font-bold text-text-main mb-2">
                            {t('storyteller.form.length')}
                        </label>
                        <select 
                            value={length} 
                            onChange={e => setLength(e.target.value as StoryLength)}
                            className="w-full bg-bg-page border border-border-color rounded-xl px-4 py-3 text-text-main focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                            <option value="short" className="bg-bg-card text-text-main">{t('storyteller.length.short')}</option>
                            <option value="medium" className="bg-bg-card text-text-main">{t('storyteller.length.medium')}</option>
                            <option value="long" className="bg-bg-card text-text-main">{t('storyteller.length.long')}</option>
                        </select>
                    </div>
                </div>

                {error && (
                    <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl text-sm">
                        {error}
                    </div>
                )}

                <button
                    onClick={handleSubmit}
                    disabled={!canGenerate || !date || !location || !protagonist || isLimitReached}
                    className={`w-full py-4 rounded-xl font-bold text-lg transition-all ${
                        canGenerate && date && location && protagonist && !isLimitReached
                            ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg hover:shadow-indigo-500/25'
                            : 'bg-bg-subtle text-text-muted cursor-not-allowed'
                    }`}
                >
                    {canGenerate ? t('storyteller.form.generate') : t('storyteller.form.insufficient_credits')}
                </button>

            </div>
        </div>
    </div>
    );
};
