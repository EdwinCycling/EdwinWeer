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
        return { hasSeason: false, intensity: '', months: '', percentage: 0, startMonth: 0, endMonth: 0, maxQuarterSum: 0, totalYearlyRain: 0 };
    }

    const totalRain = monthlyData.reduce((acc, curr) => acc + curr.totalRain, 0);
    if (totalRain < 50) {
        return { hasSeason: false, intensity: 'low_rain', months: '', percentage: 0, startMonth: 0, endMonth: 0, maxQuarterSum: 0, totalYearlyRain: totalRain };
    }

    // Find wettest 3 consecutive months
    let maxSum = -1;
    let maxStartIndex = -1;

    // We loop through 12 months, considering wrapping (e.g. Nov-Dec-Jan)
    // monthlyData is usually 0-11 index.
    for (let i = 0; i < 12; i++) {
        let sum = 0;
        for (let j = 0; j < 3; j++) {
            const index = (i + j) % 12;
            const monthData = monthlyData.find(d => d.month === index + 1); // d.month is 1-12
            if (monthData) {
                sum += monthData.totalRain;
            }
        }
        if (sum > maxSum) {
            maxSum = sum;
            maxStartIndex = i;
        }
    }

    const percentage = (maxSum / totalRain) * 100;
    const hasSeason = percentage >= 40; // If 3 months have 40% of rain

    let monthsStr = '';
    if (hasSeason) {
        const m1 = maxStartIndex + 1;
        const m3 = (maxStartIndex + 2) % 12 + 1;
        monthsStr = `${getMonthName(m1)}-${getMonthName(m3)}`;
    }

    return {
        hasSeason,
        intensity: percentage > 60 ? 'strong' : 'moderate',
        months: monthsStr,
        percentage,
        startMonth: maxStartIndex + 1,
        endMonth: (maxStartIndex + 2) % 12 + 1,
        maxQuarterSum: maxSum,
        totalYearlyRain: totalRain
    };
};

const getMonthName = (m: number) => {
    const d = new Date();
    d.setMonth(m - 1);
    return d.toLocaleString('default', { month: 'short' });
};