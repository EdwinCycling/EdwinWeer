
import React, { useEffect, useState } from 'react';
import Confetti from 'react-confetti';
import { Modal } from './Modal';
import { useAuth } from '../hooks/useAuth';
import { doc, onSnapshot, updateDoc, deleteField } from 'firebase/firestore';
import { db } from '../services/firebase';
import { getTranslation } from '../services/translations';
import { AppSettings } from '../types';

interface Props {
    settings: AppSettings;
}

export const WinnerConfetti: React.FC<Props> = ({ settings }) => {
    const { user } = useAuth();
    const [winData, setWinData] = useState<any>(null);
    const [showConfetti, setShowConfetti] = useState(false);
    const [windowSize, setWindowSize] = useState({ width: window.innerWidth, height: window.innerHeight });

    const t = (key: string, params?: any) => getTranslation(key, settings.language, params);

    useEffect(() => {
        const handleResize = () => {
            setWindowSize({ width: window.innerWidth, height: window.innerHeight });
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        if (!user) return;

        const unsub = onSnapshot(doc(db, 'users', user.uid), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                if (data.notifications && data.notifications.game_win) {
                    setWinData(data.notifications.game_win);
                    setShowConfetti(true);
                }
            }
        });

        return () => unsub();
    }, [user]);

    const handleClose = async () => {
        setShowConfetti(false);
        setWinData(null);
        if (user) {
            const userRef = doc(db, 'users', user.uid);
            await updateDoc(userRef, {
                'notifications.game_win': deleteField()
            });
        }
    };

    if (!showConfetti || !winData) return null;

    return (
        <>
            <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: 9999, pointerEvents: 'none' }}>
                <Confetti
                    width={windowSize.width}
                    height={windowSize.height}
                    recycle={false}
                    numberOfPieces={500}
                />
            </div>
            <Modal
                isOpen={true}
                onClose={handleClose}
                title={t('game.winner_modal.title')}
            >
                <div className="p-4 text-center">
                    <div className="text-6xl mb-4">🏆</div>
                    <p className="text-lg mb-4">
                        {t('game.winner_modal.text', { 
                            rank: winData.rank, 
                            city: winData.city, 
                            amount: winData.amount 
                        })}
                    </p>
                    <button
                        onClick={handleClose}
                        className="bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-2 px-4 rounded-full w-full"
                    >
                        Yay!
                    </button>
                </div>
            </Modal>
        </>
    );
};
