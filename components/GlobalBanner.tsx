import React, { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useScrollLock } from '../hooks/useScrollLock';
import { SystemConfig } from '../types';
import { Icon } from './Icon';
import { useAuth } from '../hooks/useAuth';

export const GlobalBanner: React.FC = () => {
    const { user } = useAuth();
    const [config, setConfig] = useState<SystemConfig | null>(null);
    const [isVisible, setIsVisible] = useState(false);
    const [isClosed, setIsClosed] = useState(false);

    // Lock scroll when app is disabled
    useScrollLock(isVisible && !!config?.disable_app);

    useEffect(() => {
        const unsubscribe = onSnapshot(doc(db, 'system', 'config'), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data() as SystemConfig;
                setConfig(data);
            } else {
                setConfig(null);
            }
        }, (error) => {
            console.error('GlobalBanner: Error fetching config', error);
        });

        return () => unsubscribe();
    }, []);

    useEffect(() => {
        if (!config) {
            setIsVisible(false);
            return;
        }

        // Check if we are on landing page (not logged in) and if we should include it
        if (!user && config.include_landing_page === false) {
            setIsVisible(false);
            return;
        }

        const getCETOffset = (date: Date) => {
            const year = date.getFullYear();
            // DST starts last Sunday of March
            const startDST = new Date(year, 2, 31);
            startDST.setHours(2, 0, 0, 0);
            startDST.setDate(31 - startDST.getDay());
            // DST ends last Sunday of October
            const endDST = new Date(year, 9, 31);
            endDST.setHours(3, 0, 0, 0);
            endDST.setDate(31 - endDST.getDay());
            
            return (date >= startDST && date < endDST) ? "+02:00" : "+01:00";
        };

        const checkTime = () => {
            const now = new Date();
            // Support both boolean and string "true" from Firestore
            const isActive = config.active === true || String(config.active).toLowerCase() === 'true';
            
            // Helper to parse date as CET if no timezone is specified
            const parseDate = (dateStr: string | undefined) => {
                if (!dateStr) return null;
                try {
                    // If it's already an ISO string with TZ or a full date, use it
                    if (dateStr.includes('Z') || dateStr.includes('+')) {
                        return new Date(dateStr);
                    }
                    
                    // Always treat as CET/CEST
                    const tempDate = new Date(dateStr + "+01:00"); // Initial guess
                    const offset = getCETOffset(tempDate);
                    return new Date(dateStr + offset);
                } catch (e) {
                    return null;
                }
            };

            const startDate = parseDate(config.start_time);
            const isStarted = !startDate || isNaN(startDate.getTime()) || now >= startDate;

            const endDate = parseDate(config.end_time);
            const isEnded = endDate && !isNaN(endDate.getTime()) && now > endDate;

            // Show if (active is true OR it's a hard block) AND we are within the time window
            const isHardBlock = config.disable_app === true || String(config.disable_app).toLowerCase() === 'true';
            const shouldShow = (isActive || isHardBlock) && isStarted && !isEnded;
            
            setIsVisible(shouldShow);
        };

        checkTime();
        const interval = setInterval(checkTime, 1000);

        return () => clearInterval(interval);
    }, [config]);

    if (!isVisible) return null;
    
    // Scenario B: Full blocking
    if (config?.disable_app) {
        return (
            <div className="fixed inset-0 z-[10000] bg-black/90 backdrop-blur-md flex items-center justify-center p-6 transition-all duration-500">
                <div className="bg-[#FF9800] text-white p-8 rounded-[2rem] shadow-2xl max-w-lg w-full text-center border-4 border-white/20 transform transition-all duration-300 scale-100 opacity-100">
                     <div className="mb-6 flex justify-center">
                        <div className="bg-white/20 p-4 rounded-full">
                            <Icon name="warning" className="text-6xl" />
                        </div>
                     </div>
                     <h2 className="text-3xl font-black mb-4 uppercase tracking-tight">App Niet Beschikbaar</h2>
                     <div className="h-1 w-20 bg-white/40 mx-auto mb-6 rounded-full" />
                     <p className="text-xl font-bold leading-relaxed whitespace-pre-wrap">
                        {config.maintenance_message || "De applicatie is momenteel niet beschikbaar wegens onderhoud."}
                     </p>
                </div>
            </div>
        );
    }

    // Scenario A: Info Banner (if not dismissed)
    if (isClosed) return null;

    return (
        <div className="fixed top-0 left-0 right-0 z-[9999] bg-[#FF9800] text-white px-4 py-3 shadow-md flex items-center justify-between transition-transform duration-300">
            <div className="flex items-center gap-3 flex-1 justify-center">
                <Icon name="info" className="text-xl shrink-0" />
                <span className="font-medium text-center">{config?.maintenance_message}</span>
            </div>
            <button 
                onClick={() => setIsClosed(true)}
                className="p-1.5 hover:bg-white/20 rounded-full transition-colors ml-4 shrink-0"
                aria-label="Sluiten"
            >
                <Icon name="close" className="text-xl" />
            </button>
        </div>
    );
};
