import React, { useState, useMemo } from 'react';
import { Icon } from './Icon';
import { AppSettings, WindUnit } from '../types';
import { convertWind, convertTempPrecise, convertPrecip } from '../services/weatherService';
import { getTranslation } from '../services/translations';

interface YearStats {
    year: number;
    max: number;
    min: number;
    rain: number;
    gust: number;
    windSpeed: number;
}

interface ThisDayHistoryTableProps {
    data: YearStats[];
    onClose: () => void;
    settings: AppSettings;
    title: string;
    subTitle: string;
}

type SortField = 'year' | 'max' | 'min' | 'rain' | 'gust' | 'windSpeed';
type SortDirection = 'asc' | 'desc';

export const ThisDayHistoryTable: React.FC<ThisDayHistoryTableProps> = ({ 
    data, 
    onClose, 
    settings,
    title,
    subTitle
}) => {
    const t = (key: string) => getTranslation(key, settings.language);
    const [sortField, setSortField] = useState<SortField>('year');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

    // Calculate highlights (Top 10 Max and Bottom 10 Min)
    const highlights = useMemo(() => {
        const sortedByMax = [...data].sort((a, b) => b.max - a.max).slice(0, 10);
        const sortedByMin = [...data].sort((a, b) => a.min - b.min).slice(0, 10); // Lowest min temps

        return {
            top10Max: new Set(sortedByMax.map(d => d.year)),
            bottom10Min: new Set(sortedByMin.map(d => d.year))
        };
    }, [data]);

    const sortedData = useMemo(() => {
        return [...data].sort((a, b) => {
            const valA = a[sortField];
            const valB = b[sortField];
            
            if (sortDirection === 'asc') {
                return valA > valB ? 1 : -1;
            } else {
                return valA < valB ? 1 : -1;
            }
        });
    }, [data, sortField, sortDirection]);

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('desc');
        }
    };

    const getSortIcon = (field: SortField) => {
        if (sortField !== field) return <Icon name="unfold_more" className="opacity-30" />;
        return sortDirection === 'asc' ? <Icon name="expand_less" /> : <Icon name="expand_more" />;
    };

    const exportToCSV = () => {
        const headers = [
            t('history.table_date'), 
            `${t('history.table_max_temp')} (°C)`, 
            `${t('history.table_min_temp')} (°C)`, 
            `${t('history.table_precip')} (mm)`, 
            `${t('history.table_wind')} (Bft)`, 
            `${t('history.table_wind')} (km/h)`
        ];
        
        const rows = sortedData.map(row => {
            const bft = convertWind(row.gust, WindUnit.BFT);
            const kmh = Math.round(row.gust); // Raw data from OpenMeteo is km/h
            
            return [
                row.year,
                row.max.toFixed(1),
                row.min.toFixed(1),
                row.rain.toFixed(1),
                bft,
                kmh
            ].join(';');
        });

        if (rows.length === 0) {
             alert(t('history.no_data_export'));
             return;
        }

        const csvContent = [headers.join(';'), ...rows].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `${t('history.export_filename')}_${title.replace(/\s+/g, '_')}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="fixed inset-0 z-[100] bg-white dark:bg-[#101d22] flex flex-col animate-in fade-in duration-200">
            {/* Header */}
            <div className="flex-none p-4 border-b border-slate-200 dark:border-white/10 flex items-center justify-between bg-white dark:bg-[#101d22]">
                <div>
                    <h2 className="text-xl font-bold">{title}</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{subTitle}</p>
                </div>
                <div className="flex items-center gap-2">
                    <button 
                        onClick={exportToCSV}
                        className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 transition-colors"
                    >
                        <Icon name="download" />
                        <span className="hidden sm:inline">{t('history.export_csv')}</span>
                    </button>
                    <button 
                        onClick={onClose}
                        className="bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/20 p-2 rounded-lg transition-colors"
                    >
                        <Icon name="close" />
                    </button>
                </div>
            </div>

            {/* Table Content */}
            <div className="flex-grow overflow-auto p-4">
                <div className="bg-white dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/10 overflow-hidden shadow-sm">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-slate-500 dark:text-slate-400 uppercase bg-slate-50 dark:bg-white/5 sticky top-0 z-10">
                            <tr>
                                <th onClick={() => handleSort('year')} className="px-4 py-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-white/10 select-none">
                                    <div className="flex items-center gap-1">{t('history.table_date')} {getSortIcon('year')}</div>
                                </th>
                                <th onClick={() => handleSort('max')} className="px-4 py-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-white/10 select-none">
                                    <div className="flex items-center gap-1">{t('history.table_max_temp')} {getSortIcon('max')}</div>
                                </th>
                                <th onClick={() => handleSort('min')} className="px-4 py-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-white/10 select-none">
                                    <div className="flex items-center gap-1">{t('history.table_min_temp')} {getSortIcon('min')}</div>
                                </th>
                                <th onClick={() => handleSort('rain')} className="px-4 py-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-white/10 select-none">
                                    <div className="flex items-center gap-1">{t('history.table_precip')} {getSortIcon('rain')}</div>
                                </th>
                                <th onClick={() => handleSort('gust')} className="px-4 py-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-white/10 select-none">
                                    <div className="flex items-center gap-1">{t('history.table_wind')} {getSortIcon('gust')}</div>
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                            {sortedData.map((row) => {
                                const isHighMax = highlights.top10Max.has(row.year);
                                const isLowMin = highlights.bottom10Min.has(row.year);
                                
                                return (
                                    <tr 
                                        key={row.year} 
                                        className={`
                                            hover:bg-slate-50 dark:hover:bg-white/5 transition-colors
                                            ${isHighMax ? 'bg-red-50/50 dark:bg-red-900/10' : ''}
                                            ${isLowMin ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}
                                        `}
                                    >
                                        <td className="px-4 py-3 font-medium">{row.year}</td>
                                        <td className={`px-4 py-3 ${isHighMax ? 'text-red-600 dark:text-red-400 font-bold' : ''}`}>
                                            {convertTempPrecise(row.max, settings.tempUnit).toFixed(1)}°
                                        </td>
                                        <td className={`px-4 py-3 ${isLowMin ? 'text-blue-600 dark:text-blue-400 font-bold' : ''}`}>
                                            {convertTempPrecise(row.min, settings.tempUnit).toFixed(1)}°
                                        </td>
                                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                                            {convertPrecip(row.rain, settings.precipUnit)} {settings.precipUnit}
                                        </td>
                                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                                            {convertWind(row.gust, WindUnit.BFT)} Bft ({Math.round(row.gust)} km/hr)
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
