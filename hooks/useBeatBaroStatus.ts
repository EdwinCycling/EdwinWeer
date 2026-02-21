
import { useState, useEffect } from 'react';
import { db } from '../services/firebase';
import { collection, query, where, getDocs, doc, onSnapshot } from 'firebase/firestore';
import { useAuth } from './useAuth';
import { GameRound, GameBet } from '../types';

export const useBeatBaroStatus = () => {
    const { user } = useAuth();
    const [hasBet, setHasBet] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user) {
            setHasBet(false);
            setLoading(false);
            return;
        }

        let unsubscribeBet: (() => void) | null = null;

        const checkStatus = async () => {
            try {
                // Find open/running round
                const roundsRef = collection(db, 'game_rounds');
                // We check for 'open' or 'locked' (if they bet before lock, they still "have bet")
                // But typically we care about the "current" game week.
                // Simplified: Check for any round with status 'open' or 'scheduled' that is active.
                // Or just get the latest round.
                // For simplicity, let's find the round that is currently 'open'.
                const q = query(roundsRef, where('status', '==', 'open'));
                const snapshot = await getDocs(q);
                
                if (!snapshot.empty) {
                    const roundDoc = snapshot.docs[0];
                    const roundId = roundDoc.id;

                    // Listen to user's bet on this round
                    const betRef = doc(db, `game_rounds/${roundId}/bets/${user.uid}`);
                    unsubscribeBet = onSnapshot(betRef, (docSnap) => {
                        setHasBet(docSnap.exists());
                        setLoading(false);
                    });
                } else {
                    // No open round, maybe check for 'locked' but not completed?
                    // If no game is active, user cannot "have bet" on the *active* game.
                    setHasBet(false);
                    setLoading(false);
                }
            } catch (error) {
                console.error("Error checking Beat Baro status:", error);
                setHasBet(false);
                setLoading(false);
            }
        };

        checkStatus();

        return () => {
            if (unsubscribeBet) unsubscribeBet();
        };
    }, [user]);

    return { hasBet, loading };
};
