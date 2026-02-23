import { Location, HighLowQuestion } from '../types';
import { MAJOR_CITIES } from './cityData';
import { db } from './firebase';
import { doc, setDoc, updateDoc, increment, runTransaction, serverTimestamp } from 'firebase/firestore';

// Helper to get random item
const getRandom = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

// Helper to shuffle array
const shuffle = <T>(arr: T[]): T[] => {
    return arr.sort(() => Math.random() - 0.5);
};

// Helper for random range
const getRandomInRange = (min: number, max: number): number => {
    return (Math.random() * (max - min)) + min;
};

export const generateQuiz = async (): Promise<HighLowQuestion[]> => {
    // 1. Select random cities (need enough for 15 questions, maybe 20-30 to be safe for duels)
    const selectedCities = shuffle([...MAJOR_CITIES]).slice(0, 30);
    
    // 2. Determine "Yesterday" date string (YYYY-MM-DD)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0];
    
    // 3. Fetch data for these cities
    // We can fetch in bulk using Open-Meteo
    const lats = selectedCities.map(c => c.lat).join(',');
    const lons = selectedCities.map(c => c.lon).join(',');
    
    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lats}&longitude=${lons}&start_date=${dateStr}&end_date=${dateStr}&daily=temperature_2m_max,temperature_2m_min&timezone=auto`;
    
    try {
        const response = await fetch(url);
        const data = await response.json();
        
        // Handle array response (multiple locations) or single object
        const results = Array.isArray(data) ? data : [data];
        
        const questions: HighLowQuestion[] = [];
        
        // Map results back to cities
        const cityDataMap = new Map<string, { max: number, min: number }>();
        results.forEach((res: any, index: number) => {
            if (res.daily && res.daily.temperature_2m_max && res.daily.temperature_2m_min) {
                cityDataMap.set(selectedCities[index].name, {
                    max: res.daily.temperature_2m_max[0],
                    min: res.daily.temperature_2m_min[0]
                });
            }
        });

        // 4. Generate 15 Questions
        // Use a loop counter with safety break
        let attempts = 0;
        let soloCount = 0;

        while (questions.length < 15 && attempts < 100) {
            attempts++;
            // Duel only allowed from question 6 onwards (index 5+)
            // Before that (questions 0 to 4), force solo
            const allowDuel = questions.length >= 5;
            const isDuel = allowDuel && Math.random() > 0.5; // 50/50 chance if allowed
            const variable = Math.random() > 0.5 ? 'max' : 'min';
            
            if (isDuel) {
                // Duel
                const cityA = getRandom(selectedCities);
                let cityB = getRandom(selectedCities);
                // Ensure distinct cities
                let retryCity = 0;
                while (cityB.name === cityA.name && retryCity < 10) {
                    cityB = getRandom(selectedCities);
                    retryCity++;
                }
                
                const dataA = cityDataMap.get(cityA.name);
                const dataB = cityDataMap.get(cityB.name);
                
                if (dataA && dataB) {
                    const valA = variable === 'max' ? dataA.max : dataA.min;
                    const valB = variable === 'max' ? dataB.max : dataB.min;
                    
                    // If values are equal, skip and try again
                    if (valA === valB) {
                        continue;
                    }
                    
                    const isHigher = valA > valB;
                    
                    questions.push({
                        id: `q_${questions.length}`,
                        type: 'duel',
                        cityA,
                        cityB,
                        variable,
                        correctAnswer: isHigher ? 'true' : 'false', // True = Yes/Green, False = No/Red
                        questionText: {
                            nl: variable === 'max' 
                                ? `Was het gisteren in ${cityA.name} warmer dan in ${cityB.name}?`
                                : `Was de nacht in ${cityA.name} warmer dan in ${cityB.name}?`,
                            en: variable === 'max'
                                ? `Was it warmer in ${cityA.name} than in ${cityB.name} yesterday?`
                                : `Was the night warmer in ${cityA.name} than in ${cityB.name}?`
                        },
                        actualValueA: Math.round(valA),
                        actualValueB: Math.round(valB)
                    });
                }
            } else {
                // Solo
                soloCount++;
                const city = getRandom(selectedCities);
                const data = cityDataMap.get(city.name);
                
                if (data) {
                    const val = variable === 'max' ? data.max : data.min;
                    
                    // Calculate difficulty based on question index (not just soloCount)
                    // First 5 questions: Large deviation (Easy)
                    // Then gradually smaller
                    const qIndex = questions.length;
                    
                    let minDiff, maxDiff;
                    if (qIndex < 2) { minDiff = 8; maxDiff = 12; }      // Q1-2: Very Easy
                    else if (qIndex < 5) { minDiff = 6; maxDiff = 10; } // Q3-5: Easy
                    else if (qIndex < 8) { minDiff = 5; maxDiff = 8; }  // Q6-8: Medium
                    else if (qIndex < 11) { minDiff = 3; maxDiff = 5; } // Q9-11: Harder
                    else if (qIndex < 13) { minDiff = 2; maxDiff = 3; } // Q12-13: Hard
                    else { minDiff = 1; maxDiff = 2; }                  // Q14-15: Expert

                    const diff = getRandomInRange(minDiff, maxDiff);
                    const sign = Math.random() > 0.5 ? 1 : -1;
                    
                    // Round values to integers for cleaner game
                    const roundedVal = Math.round(val);
                    const roundedTarget = Math.round(roundedVal + (diff * sign));
                    
                    const isHigher = roundedVal > roundedTarget;
                    // If equal (unlikely with diff >= 1), skip
                    if (roundedVal === roundedTarget) {
                        // Revert soloCount increment if we skip
                        soloCount--;
                        continue;
                    }

                    questions.push({
                        id: `q_${questions.length}`,
                        type: 'solo',
                        cityA: city,
                        variable,
                        targetValue: roundedTarget,
                        correctAnswer: isHigher ? 'higher' : 'lower',
                        questionText: {
                            nl: variable === 'max'
                                ? `Was de Maximum Temperatuur gisteren in ${city.name} hoger of lager dan ${roundedTarget}°C?`
                                : `Was de Minimum Temperatuur gisteren in ${city.name} hoger of lager dan ${roundedTarget}°C?`,
                            en: variable === 'max'
                                ? `Was the Max Temp yesterday in ${city.name} higher or lower than ${roundedTarget}°C?`
                                : `Was the Min Temp yesterday in ${city.name} higher or lower than ${roundedTarget}°C?`
                        },
                        actualValueA: roundedVal
                    });
                } else {
                     soloCount--;
                }
            }
        }
        
        return questions;

    } catch (e) {
        console.error("Failed to generate quiz", e);
        return [];
    }
};

export const submitHighLowScore = async (userId: string, username: string, score: number, gameLog: any[]) => {
    try {
        // Simple client-side hash for basic integrity check
        const salt = "baro-secure-salt-v1"; 
        const logString = JSON.stringify(gameLog);
        const data = `${userId}-${score}-${logString}-${salt}`;
        
        // Use SHA-256
        const msgBuffer = new TextEncoder().encode(data);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        const response = await fetch('/.netlify/functions/submit-highlow-score', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                userId,
                username,
                score,
                gameLog,
                verificationHash: hash
            })
        });

        if (!response.ok) {
            const contentType = response.headers.get("content-type");
            let errorMsg = 'Failed to submit score';
            
            try {
                if (contentType && contentType.includes("application/json")) {
                    const errorJson = await response.json();
                    errorMsg = errorJson.message || errorJson.error || errorMsg;
                } else {
                    errorMsg = await response.text();
                }
            } catch (e) {
                // Parsing failed, use default
            }
            throw new Error(errorMsg);
        }

        return await response.json();
    } catch (e) {
        console.error("Error submitting score via function:", e);
        throw e;
    }
};
