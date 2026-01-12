import React, { useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { Icon } from './Icon';
import { mapWmoCodeToIcon } from '../services/weatherService';
import { getTranslation } from '../services/translations';
import { AppLanguage } from '../types';

interface NewspaperData {
    headline: string;
    weather_report: string | { title: string; content: string };
    last_week_article?: {
        title: string;
        content: string;
    };
    world_news: string[];
    fake_ad_title: string;
    fake_ad_body: string;
    fake_ad_price?: string;
    price: string;
    fun_fact?: {
        title: string;
        content: string;
    };
}

interface Props {
    data: NewspaperData;
    weatherData: {
        maxTemp: number;
        weatherCode: number;
        date: string;
        location: string;
        windSpeed?: number;
        windDirection?: number;
        weatherScore?: number;
    };
    onClose: () => void;
    lang: AppLanguage;
}

export const VintageNewspaper: React.FC<Props> = ({ data, weatherData, onClose, lang }) => {
    const t = (key: string) => getTranslation(key, lang);
    const paperRef = useRef<HTMLDivElement>(null);
    const [showPrintModal, setShowPrintModal] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [showToast, setShowToast] = useState(false);
    const [toastMessage, setToastMessage] = useState('');

    const formatHeaderDate = (dateStr: string) => {
        try {
            const [y, m, d] = dateStr.split('-');
            const monthsNl = [
                'Januari', 'Februari', 'Maart', 'April', 'Mei', 'Juni',
                'Juli', 'Augustus', 'September', 'Oktober', 'November', 'December'
            ];
             const monthsEn = [
                'January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'
            ];
             const monthsFr = [
                'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
                'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
            ];
             const monthsDe = [
                'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
                'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'
            ];
             const monthsEs = [
                'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
            ];

            let months = monthsEn;
            if (lang === 'nl') months = monthsNl;
            if (lang === 'fr') months = monthsFr;
            if (lang === 'de') months = monthsDe;
            if (lang === 'es') months = monthsEs;

            const monthName = months[parseInt(m) - 1];
            return `${d} ${monthName} ${y}`; // Changed format to standard D Month Y
        } catch (e) {
            return dateStr;
        }
    };

    const generateImage = async () => {
        if (!paperRef.current) return null;
        
        // Small delay to ensure styles are applied
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Temporarily remove print-effect during capture to avoid filter issues
        const originalFilter = paperRef.current.style.filter;
        paperRef.current.style.filter = 'none';
        
        try {
            const canvas = await html2canvas(paperRef.current, {
                scale: 2,
                useCORS: true,
                backgroundColor: '#f4ecd8', // Standard hex color
                logging: false,
                onclone: (clonedDoc) => {
                    // Ensure cloned elements don't have problematic filters or modern colors
                    const el = clonedDoc.querySelector('.print-container') as HTMLElement;
                    if (el) {
                        el.style.filter = 'none';
                        el.style.boxShadow = 'none';
                    }
                }
            });
            return canvas;
        } finally {
            if (paperRef.current) {
                paperRef.current.style.filter = originalFilter;
            }
        }
    };

    const handleDownload = async () => {
        setIsExporting(true);
        try {
            const canvas = await generateImage();
            if (canvas) {
                const link = document.createElement('a');
                link.download = `AskBaro-Daily-${weatherData.date}.png`;
                link.href = canvas.toDataURL('image/png');
                link.click();
                setToastMessage(t('newspaper.download_started'));
                setShowToast(true);
                setTimeout(() => setShowToast(false), 3000);
            }
        } catch (err) {
            console.error("Failed to download:", err);
        } finally {
            setIsExporting(false);
        }
    };

    const handlePrint = () => {
        window.print();
    };

    const handleCopy = async () => {
        setIsExporting(true);
        try {
            const canvas = await generateImage();
            if (canvas) {
                canvas.toBlob(async (blob) => {
                    if (blob) {
                        await navigator.clipboard.write([
                            new ClipboardItem({ 'image/png': blob })
                        ]);
                        setToastMessage(t('newspaper.copied'));
                        setShowToast(true);
                        setTimeout(() => setShowToast(false), 3000);
                    }
                });
            }
        } catch (err) {
            console.error("Failed to copy:", err);
            alert(t('newspaper.copy_fail'));
        } finally {
            setIsExporting(false);
        }
    };

    const handleShare = async () => {
        setIsExporting(true);
        try {
            const canvas = await generateImage();
            if (canvas) {
                canvas.toBlob(async (blob) => {
                    if (blob && navigator.share) {
                        const file = new File([blob], `AskBaro-${weatherData.date}.png`, { type: 'image/png' });
                        await navigator.share({
                            title: t('newspaper.share_title'),
                            text: t('newspaper.share_text'),
                            files: [file]
                        });
                        setToastMessage(t('newspaper.shared'));
                        setShowToast(true);
                        setTimeout(() => setShowToast(false), 3000);
                    } else {
                        alert(t('newspaper.share_unsupported'));
                    }
                });
            }
        } catch (err) {
            console.error("Failed to share:", err);
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto pt-16 print:p-0 print:bg-white print:static print:block">
            <style>
                {`
                @import url('https://fonts.googleapis.com/css2?family=Merriweather:ital,wght@0,300;0,400;0,700;1,300;1,400&family=Playfair+Display:ital,wght@0,400;0,700;0,900;1,400&display=swap');
                
                .vintage-font-head { font-family: 'Playfair Display', serif; }
                .vintage-font-body { font-family: 'Merriweather', serif; }
                
                .paper-texture {
                    background-color: #f4ecd8;
                    background-image: 
                        url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.15'/%3E%3C/svg%3E"),
                        linear-gradient(to bottom, transparent, rgba(0,0,0,0.05));
                    position: relative;
                }

                .paper-texture::before {
                    content: "";
                    position: absolute;
                    top: 0; left: 0; right: 0; bottom: 0;
                    background-image: url("data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='inkBleed'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.02' numOctaves='3'/%3E%3CfeDisplacementMap in='SourceGraphic' scale='2'/%3E%3C/filter%3E%3C/svg%3E");
                    pointer-events: none;
                    opacity: 0.1;
                }
                
                .vintage-icon {
                    filter: grayscale(100%) contrast(180%) sepia(100%) brightness(0.8);
                }

                .print-effect {
                    filter: contrast(110%) brightness(95%);
                    position: relative;
                }

                .ad-box {
                    background-color: #e8dfc8;
                    border: 2px solid #2b2b2b;
                    box-shadow: 3px 3px 0px #2b2b2b;
                    transform: rotate(-0.5deg);
                }

                @media print {
                    @page { size: portrait; margin: 0; }
                    body * { visibility: hidden; }
                    .print-container, .print-container * { visibility: visible; }
                    .print-container { 
                        position: absolute; 
                        left: 0; 
                        top: 0; 
                        width: 100%; 
                        height: auto;
                        padding: 0;
                        margin: 0;
                        box-shadow: none;
                        background: #f4ecd8 !important;
                    }
                    .no-print { display: none !important; }
                }
                `}
            </style>

            <div className="relative max-w-5xl w-full my-8 no-print-background">
                {/* Actions */}
                <div className="absolute -top-12 right-0 flex gap-2 no-print">
                    <button 
                        onClick={() => setShowPrintModal(true)}
                        className="bg-white text-slate-900 px-4 py-2 rounded-lg font-bold shadow-lg hover:bg-slate-100 transition-colors flex items-center gap-2"
                    >
                        <span>🖨️</span> {t('newspaper.print_edition')}
                    </button>
                    <button 
                        onClick={onClose}
                        className="bg-white/10 text-white p-2 rounded-lg hover:bg-white/20 transition-colors"
                    >
                        <Icon name="close" />
                    </button>
                </div>

                {/* Newspaper Container */}
                <div 
                    ref={paperRef}
                    className="paper-texture text-[#2b2b2b] p-6 md:p-10 shadow-[5px_5px_15px_rgba(0,0,0,0.3)] w-full print-effect print-container"
                >
                    {/* Masthead */}
                    <header className="border-b-4 border-double border-black pb-4 mb-8 text-center">
                        <h1 className="vintage-font-head text-4xl md:text-6xl font-black tracking-tighter mb-2 uppercase leading-[0.9]">
                            AskBaro.COM Daily
                        </h1>
                        <div className="flex justify-between items-center border-t-2 border-black pt-2 text-[10px] md:text-xs font-bold uppercase tracking-widest vintage-font-body">
                            <span>{t('newspaper.vol')} {weatherData.date.split('-')[0]}</span>
                            <span>{weatherData.location} | {formatHeaderDate(weatherData.date)}</span>
                            <span>{data.price}</span>
                        </div>
                    </header>

                    <div className="flex flex-col md:flex-row gap-10">
                        {/* Main Column */}
                        <div className="w-full md:w-[70%] flex flex-col gap-8">
                            <article>
                                <h2 className="vintage-font-head text-2xl md:text-3xl font-bold leading-[1.2] mb-4 tracking-tight border-b-2 border-black pb-2">
                                    {data.headline}
                                </h2>

                                <div className="vintage-font-body text-justify leading-[1.5] columns-1 md:columns-2 gap-8 text-[12px] md:text-[13px] [column-fill:balance]">
                                    <div className="float-left mr-6 mb-4 flex flex-col gap-2 break-inside-avoid">
                                        {/* Weather Info Box */}
                                        <div className="border-2 border-black p-3 text-center bg-[#fdf6e3] scale-90 origin-top-left">
                                            <div className="vintage-icon text-5xl mb-1">
                                                <Icon name={mapWmoCodeToIcon(weatherData.weatherCode)} />
                                            </div>
                                            <div className="vintage-font-head text-3xl font-bold">
                                                {Math.round(weatherData.maxTemp)}°C
                                            </div>
                                            <div className="text-[10px] uppercase tracking-widest mt-1 font-bold">{t('newspaper.weather')}</div>
                                        </div>

                                        {/* Wind Box */}
                                        {weatherData.windSpeed !== undefined && (
                                            <div className="border-2 border-black p-2 text-center bg-[#fdf6e3] scale-90 origin-top-left flex flex-col items-center">
                                                <div className="relative w-12 h-12 mb-1 flex items-center justify-center border border-black/20 rounded-full">
                                                    <div className="absolute top-0 text-[8px] font-bold">N</div>
                                                    <div 
                                                        className="vintage-icon transition-transform duration-500"
                                                        style={{ transform: `rotate(${weatherData.windDirection || 0}deg)` }}
                                                    >
                                                        <Icon name="navigation" className="text-xl" />
                                                    </div>
                                                </div>
                                                <div className="vintage-font-head text-lg font-bold">
                                                    {Math.round(weatherData.windSpeed)} <span className="text-[10px]">km/u</span>
                                                </div>
                                                <div className="text-[9px] uppercase tracking-widest font-bold">{t('newspaper.wind')}</div>
                                            </div>
                                        )}

                                        {/* Score Box */}
                                        {weatherData.weatherScore !== undefined && (
                                            <div className="border-2 border-black p-2 text-center bg-[#fdf6e3] scale-90 origin-top-left">
                                                <div className="vintage-font-head text-3xl font-bold text-black/80">
                                                    {weatherData.weatherScore}
                                                </div>
                                                <div className="text-[9px] uppercase tracking-widest font-bold">{t('newspaper.weather_score')}</div>
                                            </div>
                                        )}
                                    </div>

                                    {typeof data.weather_report === 'string' ? (
                                        <p className="mb-3 whitespace-pre-line">{data.weather_report}</p>
                                    ) : (
                                        <>
                                            <h3 className="vintage-font-head text-lg font-bold mb-2 break-inside-avoid-column border-b border-[#2b2b2b4d] pb-1 uppercase tracking-tight">
                                                {data.weather_report.title}
                                            </h3>
                                            <div className="break-inside-auto">
                                                {data.weather_report.content}
                                            </div>
                                        </>
                                    )}
                                </div>
                            </article>

                            {/* Extra Article: Last Week */}
                            {data.last_week_article && (
                                <article className="border-t-2 border-black pt-6 bg-[#ede4ce] p-4 -mx-4 md:mx-0 rounded-sm">
                                    <h3 className="vintage-font-head text-2xl font-bold mb-3">
                                        {data.last_week_article.title}
                                    </h3>
                                    <div className="vintage-font-body text-justify leading-relaxed text-sm columns-1 md:columns-2 gap-8">
                                        <p className="whitespace-pre-line">{data.last_week_article.content}</p>
                                    </div>
                                </article>
                            )}
                        </div>

                        {/* Sidebar */}
                        <aside className="w-full md:w-[30%] border-l-2 border-black md:pl-8 flex flex-col gap-8">
                            <div className="border-b-2 border-black pb-6">
                                <h3 className="vintage-font-head text-xl font-bold uppercase border-b border-black pb-2 mb-4">
                                    {t('newspaper.short_news')}
                                </h3>
                                <ul className="vintage-font-body text-xs md:text-sm space-y-3 list-disc pl-4">
                                    {data.world_news.map((news, i) => (
                                        <li key={i}>{news}</li>
                                    ))}
                                </ul>
                            </div>

                            {/* Fun Fact / Extra Article */}
                            {data.fun_fact && (
                                <div className="border-b-2 border-black pb-6">
                                    <h3 className="vintage-font-head text-lg font-bold mb-2 uppercase italic">
                                        {data.fun_fact.title}
                                    </h3>
                                    <p className="vintage-font-body text-xs md:text-sm leading-snug">
                                        {data.fun_fact.content}
                                    </p>
                                </div>
                            )}

                            {/* Easter Egg / Ad */}
                            <div className="ad-box p-3 mt-auto">
                                <h4 className="vintage-font-head text-base font-bold text-center italic mb-1">
                                    {data.fake_ad_title}
                                </h4>
                                <p className="vintage-font-body text-[9px] leading-tight text-center mb-2">
                                    {data.fake_ad_body}
                                </p>
                                <div className="text-center font-bold text-lg vintage-font-head border-t border-[#2b2b2b33] pt-1">
                                    {data.fake_ad_price || data.price}
                                </div>
                            </div>
                        </aside>
                    </div>
                </div>
            </div>

            {/* Print Modal */}
            {showPrintModal && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl scale-100 animate-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-slate-900">{t('newspaper.print_edition')}</h3>
                            <button onClick={() => setShowPrintModal(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500">
                                <Icon name="close" className="w-5 h-5" />
                            </button>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                            <button 
                                onClick={handleDownload}
                                disabled={isExporting}
                                className="flex flex-col items-center justify-center gap-3 p-4 bg-slate-50 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 rounded-xl transition-all group"
                            >
                                <div className="p-3 bg-white rounded-full shadow-sm group-hover:scale-110 transition-transform text-indigo-600">
                                    <Icon name="download" className="w-6 h-6" />
                                </div>
                                <span className="font-medium text-slate-700">{t('newspaper.download_pdf')}</span>
                            </button>

                            <button 
                                onClick={handlePrint}
                                disabled={isExporting}
                                className="hidden flex-col items-center justify-center gap-3 p-4 bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-200 rounded-xl transition-all group"
                            >
                                <div className="p-3 bg-white rounded-full shadow-sm group-hover:scale-110 transition-transform text-emerald-600">
                                    <Icon name="print" className="w-6 h-6" />
                                </div>
                                <span className="font-medium text-slate-700">{t('newspaper.print')}</span>
                            </button>

                            <button 
                                onClick={handleCopy}
                                disabled={isExporting}
                                className="flex flex-col items-center justify-center gap-3 p-4 bg-slate-50 hover:bg-amber-50 border border-slate-200 hover:border-amber-200 rounded-xl transition-all group"
                            >
                                <div className="p-3 bg-white rounded-full shadow-sm group-hover:scale-110 transition-transform text-amber-600">
                                    <Icon name="content_copy" className="w-6 h-6" />
                                </div>
                                <span className="font-medium text-slate-700">{t('newspaper.copy')}</span>
                            </button>

                            <button 
                                onClick={handleShare}
                                disabled={isExporting}
                                className="flex flex-col items-center justify-center gap-3 p-4 bg-slate-50 hover:bg-pink-50 border border-slate-200 hover:border-pink-200 rounded-xl transition-all group"
                            >
                                <div className="p-3 bg-white rounded-full shadow-sm group-hover:scale-110 transition-transform text-pink-600">
                                    <Icon name="share" className="w-6 h-6" />
                                </div>
                                <span className="font-medium text-slate-700">{t('newspaper.share')}</span>
                            </button>
                        </div>

                        <div className="mt-6 pt-4 border-t border-slate-100 flex justify-end">
                            <button 
                                onClick={() => setShowPrintModal(false)}
                                className="px-4 py-2 text-slate-500 hover:text-slate-700 font-medium"
                            >
                                {t('newspaper.close')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Toast Notification */}
            {showToast && (
                <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[999] animate-in fade-in slide-in-from-bottom-4 duration-300 pointer-events-none">
                    <div className="bg-slate-900 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 border border-white/10">
                        <div className="bg-emerald-500 rounded-full p-1 shadow-lg">
                            <Icon name="check" className="w-4 h-4 text-white" />
                        </div>
                        <span className="font-bold text-sm whitespace-nowrap">{toastMessage}</span>
                    </div>
                </div>
            )}
        </div>
    );
};
