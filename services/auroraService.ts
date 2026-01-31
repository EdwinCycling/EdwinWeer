
import { Location } from '../types';

export interface KpData {
    time_tag: string;
    kp_index: number;
    estimated_kp: number;
    noaa_scale: string | null;
}

export interface AuroraResult {
    chance: number; // 0-100
    label: string; // 'Nihil', 'Fotografisch', 'Goed', 'Storm'
    kp: number;
    reason: string;
    color: 'green' | 'yellow' | 'red' | 'purple';
    isDay: boolean;
    cloudCover: number;
}

const KP_URL = 'https://services.swpc.noaa.gov/json/planetary_k_index_1m.json';

export const fetchKpIndex = async (): Promise<KpData | null> => {
    try {
        const response = await fetch(KP_URL);
        if (!response.ok) throw new Error('Failed to fetch Kp index');
        const data: KpData[] = await response.json();
        return data[data.length - 1] || null;
    } catch (e) {
        console.error('Error fetching Kp index:', e);
        return null;
    }
};

export const calculateAuroraChance = (
    kp: number,
    lat: number,
    cloudCover: number, // 0-100
    isDay: boolean,
    t: (key: string) => string
): AuroraResult => {
    let chance = 0;
    let label = t('aurora_nihil'); // 'Nihil'
    let color: AuroraResult['color'] = 'green';
    let reason = '';

    // Step A: Latitude Check (Optimized for NL/BE ~52)
    const threshold = 5; // Kp needed for NL
    
    if (kp < threshold) {
        chance = (kp / threshold) * 30; // Max 30% chance if below threshold
        reason = t('aurora_kp_low'); // "Kp-index is te laag voor deze breedtegraad."
    } else {
        // Kp >= 5
        if (kp >= 9) chance = 100;
        else if (kp >= 7) chance = 90;
        else if (kp >= 6) chance = 70;
        else chance = 50; // Kp 5
        
        reason = t('aurora_kp_high'); // "Kp-index is gunstig!"
    }

    // Step B: Cloud Cover Check
    if (cloudCover > 80) {
        chance = 0;
        reason = t('aurora_clouds_heavy'); // "Te bewolkt (80%+)."
    } else if (cloudCover > 40) {
        chance = chance * 0.5;
        reason += ' ' + t('aurora_clouds_moderate'); // "Bewolking vermindert de kans."
    } else {
        reason += ' ' + t('aurora_clear_sky'); // "Heldere hemel."
    }

    // Step C: Light Check
    if (isDay) {
        chance = 0;
        reason = t('aurora_too_light'); // "Het is te licht."
    }

    // Determine Label & Color based on final chance & Kp (not just chance, to keep context)
    if (isDay) {
        label = t('aurora_too_light_label'); // "Te Licht"
        color = 'green';
    } else if (cloudCover > 80) {
        label = t('aurora_cloudy_label'); // "Bewolkt"
        color = 'green';
    } else {
        if (kp >= 7) {
            label = t('aurora_storm'); // "Storm!"
            color = 'purple';
        } else if (kp >= 5) {
            label = t('aurora_active'); // "Actief"
            color = 'red';
        } else if (kp >= 4) {
             label = t('aurora_photographic'); // "Fotografisch"
             color = 'yellow';
        } else {
            label = t('aurora_quiet'); // "Rustig"
            color = 'green';
        }
    }
    
    // Override label if chance is effectively 0 due to clouds but Kp is high
    if (kp >= 5 && cloudCover > 80) {
        label = t('aurora_invisible_storm'); // "Onzichtbare Storm"
        color = 'red'; // Keep it red to indicate activity exists
    }

    return {
        chance,
        label,
        kp,
        reason,
        color,
        isDay,
        cloudCover
    };
};
