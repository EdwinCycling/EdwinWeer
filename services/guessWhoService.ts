
import { db } from './firebase';
import { doc, getDoc } from 'firebase/firestore';

export interface GuessWhoLogEntry {
    question: string;
    result: boolean;
    timestamp: number;
}

export const submitGuessWhoScore = async (
    userId: string, 
    username: string, 
    score: number, 
    timeLeft: number,
    questionsCount: number,
    gameLog: GuessWhoLogEntry[]
) => {
    try {
        // Simple client-side hash for basic integrity check
        const salt = "baro-secure-salt-v1"; 
        // Hash payload: userId-score-timeLeft-questionsCount-salt
        const data = `${userId}-${score}-${timeLeft}-${questionsCount}-${salt}`;
        
        // Use SHA-256
        const msgBuffer = new TextEncoder().encode(data);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        const response = await fetch('/.netlify/functions/submit-guesswho-score', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                userId,
                username,
                score,
                timeLeft,
                questionsCount,
                gameLog,
                verificationHash: hash
            })
        });

        if (!response.ok) {
            const contentType = response.headers.get("content-type") || "";
            let errorObj: any = null;
            try {
                if (contentType.includes("application/json")) {
                    const json = await response.json();
                    errorObj = json;
                } else {
                    const text = await response.text();
                    errorObj = { message: text };
                }
            } catch (e) {
                errorObj = { message: "Unknown error" };
            }
            throw new Error(errorObj.message || 'Failed to submit score');
        }

        return await response.json();
    } catch (error) {
        console.error("Error submitting score:", error);
        throw error;
    }
};

export const getGuessWhoDailyPlays = async (userId: string): Promise<number> => {
    try {
        const userRef = doc(db, 'users', userId);
        const userSnap = await getDoc(userRef);
        
        if (userSnap.exists()) {
            const data = userSnap.data();
            const today = new Date().toISOString().split('T')[0];
            
            if (data.last_played_guesswho === today) {
                return data.guesswho_daily_count || 0;
            }
        }
        return 0;
    } catch (error) {
        console.error("Error checking daily plays:", error);
        return 0;
    }
};
