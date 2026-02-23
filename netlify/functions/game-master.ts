
import { Handler, schedule } from '@netlify/functions';
import { initFirebase, getDb, admin } from './config/firebaseAdmin.js';
import { MAJOR_CITIES } from '../../services/cityData';

initFirebase();
const db = getDb();

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper: Fetch Weather Data
async function fetchWeather(lat: number, lon: number, date: string, type: 'forecast' | 'archive') {
    const baseUrl = type === 'archive' 
        ? 'https://archive-api.open-meteo.com/v1/archive'
        : 'https://api.open-meteo.com/v1/forecast';
    
    const url = `${baseUrl}?latitude=${lat}&longitude=${lon}&start_date=${date}&end_date=${date}&daily=temperature_2m_max,temperature_2m_min&timezone=auto`;
    
    try {
        const response = await fetch(url);
        const data = await response.json();
        
        if (!data.daily || !data.daily.temperature_2m_max || !data.daily.temperature_2m_min) {
            throw new Error('Incomplete data from Open-Meteo');
        }

        return {
            max: data.daily.temperature_2m_max[0],
            min: data.daily.temperature_2m_min[0]
        };
    } catch (error) {
        console.error(`Error fetching ${type} weather for ${lat},${lon} on ${date}:`, error);
        return null;
    }
}

// Helper: Get Anonymized Name
const getAnonymizedName = (name: string, email?: string) => {
    if (!email) return name;
    const parts = email.split('@');
    if (parts.length === 0) return name;
    const localPart = parts[0];
    if (localPart.length <= 2) return localPart + '***';
    return localPart.substring(0, 2) + '*'.repeat(localPart.length - 2);
};

// Helper: Get Quarter
const getQuarter = (date: Date) => {
    return Math.floor((date.getMonth() + 3) / 3);
};

// Handler
const handler: Handler = async (event, context) => {
    console.log('Starting Game Master...');
    if (!db) {
        console.error('Firebase DB not initialized');
        return { statusCode: 500, body: 'DB Error' };
    }

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    try {
        // --- 1. AFRONDEN (Complete previous round) ---
        // Note: Filtering by date in memory to avoid needing a composite index immediately
        const lockedRoundsSnapshot = await db.collection('game_rounds')
            .where('status', '==', 'locked')
            .get();

        const roundsToProcess = lockedRoundsSnapshot.docs.filter(doc => doc.data().targetDate < todayStr);

        for (const doc of roundsToProcess) {
            const round = doc.data();
            console.log(`Processing locked round: ${doc.id}`);

            // Fetch actual weather
            const actualWeather = await fetchWeather(round.city.lat, round.city.lon, round.targetDate, 'archive');
            
            if (!actualWeather) {
                console.error(`Could not fetch archive weather for round ${doc.id}`);
                continue; 
            }

            // Calculate scores and winners
            const betsSnapshot = await db.collection(`game_rounds/${doc.id}/bets`).get();
            const bets = betsSnapshot.docs.map(b => ({ id: b.id, ...b.data() }));

            let totalPot = 0; // In credits
            
            totalPot = bets.length;
            
            const scoredBets = bets.map((bet: any) => {
                const score = Math.abs(bet.prediction.max - actualWeather.max) + (Math.abs(bet.prediction.min - actualWeather.min) / 10);
                return { ...bet, score };
            });

            // Sort by deviation score ascending (lowest is best)
            scoredBets.sort((a, b) => a.score - b.score);

            // Determine prizes (Credits) - Top 3
            const prizeDistribution = [1.0, 0.5, 0.25];
            const winners = scoredBets.slice(0, 3);
            
            // Determine Leaderboard Points - Top 10
            const top10 = scoredBets.slice(0, 10);

            const batch = db.batch();

            // Update round
            batch.update(doc.ref, {
                status: 'completed',
                actualResult: actualWeather,
                resultsProcessed: true,
                totalPot,
                winnerCount: winners.length
            });

            // Process Top 10 for Points and Leaderboard
            for (let i = 0; i < top10.length; i++) {
                const player = top10[i];
                const rank = i + 1;
                const points = 11 - rank; // 1st=10, 2nd=9, ..., 10th=1

                // Update bet document with rank and points
                const betRef = db.collection(`game_rounds/${doc.id}/bets`).doc(player.id);
                batch.update(betRef, {
                    score: points, // Store POINTS in score field for consistency with "points earned"
                    deviation: player.score, // Store the raw deviation
                    rank: rank
                });

                // Prepare user updates
                const userRef = db.collection('users').doc(player.userId);
                
                // Fetch user data for anonymized name if needed (can be optimized by caching or trusting previous data)
                // For simplicity, we just use the name from the bet if available, or fetch
                let displayName = player.userName || 'Unknown';
                let anonymizedName = player.anonymizedName || displayName;
                
                // If we don't have the name in the bet, we might want to fetch the user.
                // But for batch efficiency, we assume the bet has some info or we update it blindly.
                // Better: fetch the user doc to be sure.
                const userDoc = await userRef.get();
                if (userDoc.exists) {
                    const userData = userDoc.data();
                    // Custom username check (added for feature request)
                    if (userData?.username) {
                        anonymizedName = userData.username;
                    } else {
                        displayName = userData?.displayName || userData?.email?.split('@')[0] || 'Unknown';
                        anonymizedName = getAnonymizedName(displayName, userData?.email);
                    }
                }

                // Update User Stats
                const userUpdates: any = {
                    'gameStats.top10': admin.firestore.FieldValue.increment(1),
                    'gameStats.totalPoints': admin.firestore.FieldValue.increment(points)
                };

                if (i === 0) {
                     userUpdates['gameStats.wins'] = admin.firestore.FieldValue.increment(1);
                }

                // If they are in Top 3, they also get credits
                if (i < 3) {
                    const prize = Math.ceil(totalPot * prizeDistribution[i]);
                    if (prize > 0) {
                        userUpdates['usage.weatherCredits'] = admin.firestore.FieldValue.increment(prize);
                        // Notification for prize
                         userUpdates[`notifications.game_win_${doc.id}`] = {
                            rank: rank,
                            amount: prize,
                            points: points,
                            city: round.city.name,
                            roundId: doc.id,
                            timestamp: admin.firestore.FieldValue.serverTimestamp()
                        };
                    }
                } else {
                     // Notification for just points
                     userUpdates[`notifications.game_points_${doc.id}`] = {
                        rank: rank,
                        points: points,
                        city: round.city.name,
                        roundId: doc.id,
                        timestamp: admin.firestore.FieldValue.serverTimestamp()
                    };
                }

                batch.update(userRef, userUpdates);

                // Update Leaderboards
                const roundDate = new Date(round.targetDate);
                const year = roundDate.getFullYear().toString();
                const quarter = `Q${getQuarter(roundDate)}`;
                
                const leaderboardEntry = {
                    name: anonymizedName, // Use anonymized name for public leaderboard
                    userId: player.userId,
                    lastUpdated: admin.firestore.FieldValue.serverTimestamp()
                };

                // 1. All Time
                const allTimeRef = db.collection('leaderboards').doc('all_time').collection('entries').doc(player.userId);
                batch.set(allTimeRef, {
                    ...leaderboardEntry,
                    score: admin.firestore.FieldValue.increment(points)
                }, { merge: true });

                // 2. Year
                const yearRef = db.collection('leaderboards').doc(year).collection('entries').doc(player.userId);
                batch.set(yearRef, {
                    ...leaderboardEntry,
                    score: admin.firestore.FieldValue.increment(points)
                }, { merge: true });

                // 3. Quarter
                const quarterRef = db.collection('leaderboards').doc(`${year}_${quarter}`).collection('entries').doc(player.userId);
                batch.set(quarterRef, {
                    ...leaderboardEntry,
                    score: admin.firestore.FieldValue.increment(points)
                }, { merge: true });

                // 4. Month
                const month = (roundDate.getMonth() + 1).toString().padStart(2, '0');
                const monthRef = db.collection('leaderboards').doc(`${year}_${month}`).collection('entries').doc(player.userId);
                batch.set(monthRef, {
                    ...leaderboardEntry,
                    score: admin.firestore.FieldValue.increment(points)
                }, { merge: true });
            }

            await batch.commit();
            console.log(`Round ${doc.id} completed. ${top10.length} top players processed.`);
        }

        // --- 2. SLUITEN (Lock next week's round) ---
        // Find open rounds. Since we create rounds 13 days ahead, the "open" round for "next Sunday" (6 days from now) should be locked today.
        
        const openRoundsSnapshot = await db.collection('game_rounds')
            .where('status', '==', 'open')
            .get();

        const lockBatch = db.batch();
        let lockedCount = 0;

        for (const doc of openRoundsSnapshot.docs) {
            // Logic: Lock if targetDate is close (e.g. within 7 days)
            // Or just lock the oldest open round?
            // Existing logic was: lock all open rounds. But that might be too aggressive if we have multiple.
            // Let's stick to locking rounds that are due.
            // Target date is Sunday. Today is Monday. Diff is 6 days.
            // So if targetDate < today + 8 days.
            
            const round = doc.data();
            const target = new Date(round.targetDate);
            const diffDays = (target.getTime() - today.getTime()) / (1000 * 3600 * 24);
            
            if (diffDays < 8) {
                 lockBatch.update(doc.ref, { status: 'locked' });
                 lockedCount++;
            }
        }

        if (lockedCount > 0) {
            await lockBatch.commit();
            console.log(`Locked ${lockedCount} rounds.`);
        }

        // --- 3. OPENEN & PLANNEN (Maintain schedule for next 13 weeks) ---
        // Ensure we have rounds for the next 13 Sundays.
        // Also promote 'scheduled' rounds to 'open' if they are within 13 days.

        const scheduleBatch = db.batch();
        let scheduleChanges = 0;

        // A. Promote scheduled -> open
        const scheduledRoundsSnapshot = await db.collection('game_rounds')
            .where('status', '==', 'scheduled')
            .get();
        
        for (const doc of scheduledRoundsSnapshot.docs) {
             const round = doc.data();
             const target = new Date(round.targetDate);
             const diffDays = (target.getTime() - today.getTime()) / (1000 * 3600 * 24);
             
             // If less than 13 days away (e.g. next week or week after), open it
             if (diffDays <= 14) {
                 const updates: any = { status: 'open' };
                 
                 // ALWAYS fetch fresh prediction when opening a round
                 console.log(`Opening round ${doc.id} - Fetching Baro prediction...`);
                 const prediction = await fetchWeather(round.city.lat, round.city.lon, round.targetDate, 'forecast');
                 
                 if (prediction) {
                     updates.baroPrediction = {
                         ...prediction,
                         timestamp: Date.now()
                     };
                 } else {
                     console.error(`Failed to fetch prediction for round ${doc.id} upon opening.`);
                     // Fallback: If we really can't get data, maybe don't open it? 
                     // Or open it without prediction and let self-healing fix it later?
                     // For now we proceed, self-healing will try again on next run.
                 }

                 scheduleBatch.update(doc.ref, updates);
                 scheduleChanges++;
                 console.log(`Promoted round ${doc.id} to open`);
             }
        }

        // Fix: Check already OPEN rounds for missing predictions (Self-healing)
        const openRoundsCheck = await db.collection('game_rounds').where('status', '==', 'open').get();
        for (const doc of openRoundsCheck.docs) {
            const round = doc.data();
            if (!round.baroPrediction || (round.baroPrediction.max === 0 && round.baroPrediction.min === 0)) {
                console.log(`Self-healing: Fetching missing prediction for OPEN round ${doc.id}`);
                const prediction = await fetchWeather(round.city.lat, round.city.lon, round.targetDate, 'forecast');
                if (prediction) {
                     scheduleBatch.update(doc.ref, {
                         baroPrediction: {
                             ...prediction,
                             timestamp: Date.now()
                         }
                     });
                     scheduleChanges++;
                }
            }
        }

        // B. Create missing rounds
        // Look ahead 13 weeks (Sundays)
        // Get all existing rounds to check duplicates (targetDate)
        const allRoundsSnapshot = await db.collection('game_rounds').get();
        const existingDates = new Set(allRoundsSnapshot.docs.map(d => d.data().targetDate));
        const recentCities = new Set(
             allRoundsSnapshot.docs
                .map(d => d.data())
                .sort((a, b) => b.targetDate.localeCompare(a.targetDate))
                .slice(0, 20) // Check last 20 rounds for city repetition
                .map(r => r.city.name)
        );

        for (let i = 1; i <= 13; i++) {
             const futureDate = new Date(today);
             // Find next Sunday + (i-1) weeks
             // First find next Sunday
             const daysUntilSunday = 7 - futureDate.getDay();
             futureDate.setDate(futureDate.getDate() + daysUntilSunday + ((i - 1) * 7));
             const dateStr = futureDate.toISOString().split('T')[0];

             if (!existingDates.has(dateStr)) {
                 // Create this round!
                 // Pick random city not in recent list
                 let candidates = MAJOR_CITIES.filter(c => !recentCities.has(c.name));
                 if (candidates.length === 0) candidates = MAJOR_CITIES; // Fallback
                 
                 const randomCity = candidates[Math.floor(Math.random() * candidates.length)];
                 
                 const diffDays = (futureDate.getTime() - today.getTime()) / (1000 * 3600 * 24);
                 
                 // IMPORTANT: Do NOT fetch prediction here for far future rounds.
                 // We explicitly set baroPrediction to null for 'scheduled' rounds.
                 // It will be fetched when the round is promoted to 'open' (<= 14 days before target).
                 
                 let baroPrediction = null;
                 if (diffDays <= 14) {
                      // If we are creating a round that opens IMMEDIATELY (rare, but possible if DB is empty), fetch now.
                      baroPrediction = await fetchWeather(randomCity.lat, randomCity.lon, dateStr, 'forecast');
                 }

                 const roundId = `round_${dateStr.replace(/-/g, '')}_${randomCity.name.replace(/\s/g, '')}`;
                 const roundRef = db.collection('game_rounds').doc(roundId);
                 
                 scheduleBatch.set(roundRef, {
                    id: roundId,
                    status: diffDays <= 14 ? 'open' : 'scheduled',
                    city: randomCity,
                    targetDate: dateStr,
                    baroPrediction: baroPrediction ? {
                        ...baroPrediction,
                        timestamp: Date.now()
                    } : null, 
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    resultsProcessed: false
                });
                
                // Add to trackers to avoid duplicates in this loop
                existingDates.add(dateStr);
                recentCities.add(randomCity.name);
                scheduleChanges++;
                console.log(`Scheduled new round ${roundId} for ${randomCity.name} on ${dateStr}`);
             }
        }

        if (scheduleChanges > 0) {
            await scheduleBatch.commit();
            console.log(`Committed ${scheduleChanges} schedule changes.`);
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Game Master finished' })
        };

    } catch (error) {
        console.error('Game Master Error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.toString() })
        };
    }
};

// Netlify Schedule
// export const handler = schedule('0 9 * * 1', handler); // Note: handler name conflict
// Correct way:
// Changed to daily check (was weekly on Monday) to ensure self-healing works faster (within 24h)
const scheduledHandler = schedule('0 9 * * *', handler);
export { scheduledHandler as handler };
