
import { Handler } from '@netlify/functions';
import * as crypto from 'crypto';
import { initFirebase, getDb, admin } from './config/firebaseAdmin.js';

export const handler: Handler = async (event, _context) => {
    // Only allow POST
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'METHOD_NOT_ALLOWED', message: 'Method Not Allowed' }) };
    }

    // Initialize Firebase
    initFirebase();
    const db = getDb();
    if (!db) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'CONFIG_ERROR', message: 'Server configuration error: Firebase not initialized' })
        };
    }

    // Parse body
    let body;
    try {
        body = JSON.parse(event.body || '{}');
    } catch (_e) {
        return { statusCode: 400, body: 'Invalid JSON' };
    }

    const { userId, username, score, gameLog, verificationHash, timeLeft, questionsCount } = body;

    if (!userId || !username || score === undefined) {
        return { statusCode: 400, body: 'Missing required fields' };
    }

    // 0. Verify Hash (Integrity Check)
    const salt = "baro-secure-salt-v1";
    if (!verificationHash) {
        return { statusCode: 400, body: JSON.stringify({ error: 'INTEGRITY_CHECK_FAILED', message: 'Missing verification hash.' }) };
    }
    
    const expectedHashData = `${userId}-${score}-${timeLeft}-${questionsCount}-${salt}`;
    const expectedHash = crypto.createHash('sha256').update(expectedHashData).digest('hex');

    if (verificationHash !== expectedHash) {
        console.warn(`Hash mismatch for user ${userId}.`);
        return { statusCode: 400, body: JSON.stringify({ error: 'INTEGRITY_CHECK_FAILED', message: 'Data integrity check failed.' }) };
    }

    // 1. Check Daily Limit (3x per day)
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    
    try {
        // Use a transaction to safely read and update everything (MAX score logic)
        await db.runTransaction(async (transaction) => {
            const userRef = db.collection('users').doc(userId);
            const userSnap = await transaction.get(userRef);

            if (!userSnap.exists) {
                throw new Error('USER_NOT_FOUND');
            }

            const userData = userSnap.data();
            let dailyCount = 0;
            
            if (userData?.last_played_guesswho === today) {
                dailyCount = userData.guesswho_daily_count || 0;
            }

            if (dailyCount >= 3) {
                throw new Error('DAILY_LIMIT_REACHED');
            }

            // 2. Validate Score
            // Score = (25 - questionsCount) * 10
            // + (questionsCount < 10 ? (10 - questionsCount) * 10 : 0)
            // + timeLeft
            
            const qPoints = Math.max(0, (25 - questionsCount) * 10);
            const bonusPoints = questionsCount < 10 ? (10 - questionsCount) * 10 : 0;
            const timePoints = timeLeft;
            const calculatedScore = qPoints + bonusPoints + timePoints;
            
            // Allow small tolerance? No, exact match expected.
            if (Math.abs(calculatedScore - score) > 5) {
                 console.warn(`Score mismatch: Client ${score}, Server ${calculatedScore}`);
            }
            
            const finalScore = calculatedScore;

            // Update User Stats
            const currentHigh = userData?.guesswho_highscore || 0;
            const updateData: any = {
                last_played_guesswho: today,
                guesswho_daily_count: dailyCount + 1
            };
            
            // Only update highscore if new score is better
            if (finalScore > currentHigh) {
                updateData.guesswho_highscore = finalScore;
                updateData.guesswho_highscore_date = today;
            }
            
            transaction.update(userRef, updateData);

            // Update Leaderboards (MAX Score Logic)
            const year = now.getFullYear().toString();
            const month = (now.getMonth() + 1).toString().padStart(2, '0');
            const quarter = Math.floor((now.getMonth() + 3) / 3);
            
            const docIds = [
                'all_time',
                year,
                `${year}_Q${quarter}`,
                `${year}_${month}`,
                today
            ];

            // For each leaderboard, we need to read the current entry to decide if we should update.
            // Firestore transactions require all reads to come before all writes.
            
            // Phase 1: Reads
            const leaderboardReads = [];
            for (const id of docIds) {
                const entryRef = db.collection('guesswho_leaderboards').doc(id).collection('entries').doc(userId);
                leaderboardReads.push({ id, ref: entryRef });
            }
            
            const leaderboardSnaps = await Promise.all(leaderboardReads.map(item => transaction.get(item.ref)));
            
            // Phase 2: Writes
            leaderboardReads.forEach((item, index) => {
                const entrySnap = leaderboardSnaps[index];
                let shouldUpdate = false;
                
                if (!entrySnap.exists) {
                    shouldUpdate = true;
                } else {
                    const currentEntry = entrySnap.data();
                    if (finalScore > (currentEntry?.score || 0)) {
                        shouldUpdate = true;
                    }
                }
                
                if (shouldUpdate) {
                    transaction.set(item.ref, {
                        userId,
                        name: username,
                        score: finalScore,
                        timestamp: admin.firestore.FieldValue.serverTimestamp()
                    }); // We overwrite completely with the new high score
                }
            });

            // Save Game History
            const historyRef = db.collection('users').doc(userId).collection('guesswho_results').doc();
            transaction.set(historyRef, {
                score: finalScore,
                timeLeft,
                questionsCount,
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });
            
            // Last Game
            const lastGameRef = db.collection('users').doc(userId).collection('guesswho').doc('last_game');
            transaction.set(lastGameRef, {
                score: finalScore,
                timeLeft,
                questionsCount,
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                 log: gameLog 
            });
        });

        // If successful
        // We need to re-fetch dailyCount because it's inside transaction, 
        // but we know it incremented.
        // Wait, if transaction failed, we jump to catch.
        
        // We can't easily return the updated count from inside transaction to outside directly 
        // without re-reading or passing it out. But we know logic.
        
        // However, we need the initial dailyCount to calculate remaining.
        // We can't access variable from inside transaction easily if we don't capture it.
        // But we can just guess. 
        // Actually, let's just return success. Client will refresh.
        
        return {
            statusCode: 200,
            body: JSON.stringify({ success: true, score: score })
        };

    } catch (error: any) {
        console.error('Submit Score Error:', error);
        
        if (error.message === 'DAILY_LIMIT_REACHED') {
            return { 
                statusCode: 403, 
                body: JSON.stringify({ error: 'DAILY_LIMIT_REACHED', message: 'You have already played 3 times today.' }) 
            };
        }
        
        if (error.message === 'USER_NOT_FOUND') {
             return { statusCode: 404, body: 'User not found' };
        }

        return { 
            statusCode: 500, 
            body: JSON.stringify({ error: 'INTERNAL_ERROR', message: error.message || 'Internal Server Error' }) 
        };
    }
};
