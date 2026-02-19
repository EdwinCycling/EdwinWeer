import { MonthlyAverage } from '../services/climateService'; // Self-reference for type, but usually defined here. 
// Actually, interfaces should be exported from here.

export interface MonthlyAverage {
    month: number;
    avgTemp: number;
    totalRain: number;
}

export interface ClimateType {
    label: string;
    description: string;
    color: string;
}

export interface BSIResult {
    score: number;
    label: string;
    description: string;
}

export interface RainSeasonResult {
    hasSeason: boolean;
    intensity: string;
    months: string;
    percentage: number;
    startMonth: number;
    endMonth: number;
    maxQuarterSum: number;
    totalYearlyRain: number;
}

export const determineClimateType = (monthlyData: MonthlyAverage[]): ClimateType => {
    if (!monthlyData || monthlyData.length === 0) {
        return { label: 'climate.type.unknown.label', description: 'climate.type.no_data.desc', color: 'text-gray-500' };
    }

    let minTemp = Infinity;
    let maxTemp = -Infinity;
    let totalRain = 0;

    monthlyData.forEach(d => {
        if (d.avgTemp < minTemp) minTemp = d.avgTemp;
        if (d.avgTemp > maxTemp) maxTemp = d.avgTemp;
        totalRain += d.totalRain;
    });

    // Simplified Köppen Classification
    if (maxTemp < 10) {
        return { label: 'climate.type.polar.label', description: 'climate.type.polar.desc', color: 'text-blue-200' };
    }

    if (totalRain < 250) {
        return { label: 'climate.type.dry.label', description: 'climate.type.dry.desc', color: 'text-yellow-500' };
    }

    if (minTemp >= 18) {
        return { label: 'climate.type.tropical.label', description: 'climate.type.tropical.desc', color: 'text-green-600' };
    }

    if (minTemp > -3 && minTemp < 18) {
        return { label: 'climate.type.temperate.label', description: 'climate.type.temperate.desc', color: 'text-green-400' };
    }

    if (minTemp <= -3) {
        return { label: 'climate.type.continental.label', description: 'climate.type.continental.desc', color: 'text-indigo-400' };
    }

    return { label: 'climate.type.unknown.label', description: 'climate.type.unknown.desc', color: 'text-gray-500' };
};

export const calculateBSI = (monthlyData: MonthlyAverage[]): BSIResult => {
    if (!monthlyData || monthlyData.length === 0) {
        return { score: 0, label: 'bsi.label.unknown', description: 'bsi.desc.unknown' };
    }

    let minTemp = Infinity;
    let maxTemp = -Infinity;

    monthlyData.forEach(d => {
        if (d.avgTemp < minTemp) minTemp = d.avgTemp;
        if (d.avgTemp > maxTemp) maxTemp = d.avgTemp;
    });

    const amplitude = maxTemp - minTemp;
    
    // Scale: 0 amplitude = 0 score. 40 amplitude = 100 score.
    let score = (amplitude / 40) * 100;
    if (score > 100) score = 100;
    if (score < 0) score = 0;

    let label = '';
    let description = '';

    if (score < 25) {
        label = 'bsi.label.stable';
        description = 'bsi.desc.stable';
    } else if (score < 50) {
        label = 'bsi.label.moderate';
        description = 'bsi.desc.moderate';
    } else if (score < 75) {
        label = 'bsi.label.variable';
        description = 'bsi.desc.variable';
    } else {
        label = 'bsi.label.extreme';
        description = 'bsi.desc.extreme';
    }

    return { score, label, description };
};

export const detectRainSeason = (monthlyData: MonthlyAverage[]): RainSeasonResult => {
    if (!monthlyData || monthlyData.length === 0) {
        return { 
            hasSeason: false, intensity: 'rain_season.intensity.flat', months: '', percentage: 0, 
            startMonth: 0, endMonth: 0, maxQuarterSum: 0, totalYearlyRain: 0 
        };
    }

    // Sort data by month to be sure
    const sortedData = [...monthlyData].sort((a, b) => a.month - b.month);
    const totalYearlyRain = sortedData.reduce((sum, d) => sum + d.totalRain, 0);

    // Edge case: Zeer weinig regen (Woestijn) - maar we willen nog steeds detecteren
    if (totalYearlyRain === 0) {
        return {
            hasSeason: false,
            intensity: 'rain_season.intensity.flat',
            months: '',
            percentage: 0,
            startMonth: 0,
            endMonth: 0,
            maxQuarterSum: 0,
            totalYearlyRain
        };
    }

    // Stap B: Het "Glijdende Kwartaal"
    let maxQuarterSum = -1;
    let bestStartMonth = -1;

    // Maak een map voor snelle lookup van regen per maand
    const rainMap = new Map<number, number>();
    sortedData.forEach(d => rainMap.set(d.month, d.totalRain));
    
    const monthlyAvg = totalYearlyRain / 12;

    // 1. Vind de beste 3 aaneengesloten maanden
    for (let i = 0; i < 12; i++) {
        const m1 = i;
        const m2 = (i + 1) % 12;
        const m3 = (i + 2) % 12;

        const rain1 = rainMap.get(m1) || 0;
        const rain2 = rainMap.get(m2) || 0;
        const rain3 = rainMap.get(m3) || 0;

        const sum = rain1 + rain2 + rain3;
        
        if (sum > maxQuarterSum) {
            maxQuarterSum = sum;
            bestStartMonth = m1;
        }
    }

    // 2. Probeer uit te breiden naar links en rechts (max 1 stap elk)
    let currentStart = bestStartMonth;
    let currentEnd = (bestStartMonth + 2) % 12;
    let currentSum = maxQuarterSum;
    let length = 3;

    // Check vorige maand
    const prevMonth = (currentStart - 1 + 12) % 12;
    const prevRain = rainMap.get(prevMonth) || 0;
    
    // Check volgende maand
    const nextMonth = (currentEnd + 1) % 12;
    const nextRain = rainMap.get(nextMonth) || 0;

    // Uitbreidingslogica: Drempel 0.8 * monthlyAvg
    const threshold = monthlyAvg * 0.8;

    if (prevRain > threshold) {
        currentStart = prevMonth;
        currentSum += prevRain;
        length++;
    }

    if (nextRain > threshold) {
        currentEnd = nextMonth;
        currentSum += nextRain;
        length++;
    }

    // 3. Probeer in te krimpen (Shrink) - voor korte seizoenen (1 of 2 maanden)
    let shrunk = true;
    while (shrunk && length > 1) {
        shrunk = false;
        
        const firstMonthRain = rainMap.get(currentStart) || 0;
        const lastMonthRain = rainMap.get(currentEnd) || 0;
        
        if (firstMonthRain < (currentSum * 0.15)) {
            currentSum -= firstMonthRain;
            currentStart = (currentStart + 1) % 12;
            length--;
            shrunk = true;
            continue;
        }
        
        if (lastMonthRain < (currentSum * 0.15)) {
            currentSum -= lastMonthRain;
            currentEnd = (currentEnd - 1 + 12) % 12;
            length--;
            shrunk = true;
        }
    }

    // Stap C: De Concentratie Score
    const score = (currentSum / totalYearlyRain) * 100;
    
    // Dynamische drempelwaarde voor detectie
    const minPercentage = (length / 12 * 100) + 8;
    const hasSeason = score > minPercentage;

    let intensity = 'rain_season.intensity.flat';
    if (hasSeason) {
        const uniform = length / 12 * 100;
        if (score > uniform * 1.8) {
            intensity = 'rain_season.intensity.monsoon';
        } else {
            intensity = 'rain_season.intensity.seasonal';
        }
    }

    const monthNames = [
        'Januari', 'Februari', 'Maart', 'April', 'Mei', 'Juni', 
        'Juli', 'Augustus', 'September', 'Oktober', 'November', 'December'
    ];
    
    let monthsStr = '';
    if (length === 1) {
        monthsStr = monthNames[currentStart];
    } else {
        monthsStr = `${monthNames[currentStart]} - ${monthNames[currentEnd]}`;
    }

    return {
        hasSeason,
        intensity,
        months: monthsStr,
        percentage: score,
        startMonth: currentStart,
        endMonth: currentEnd,
        maxQuarterSum: currentSum,
        totalYearlyRain
    };
};
