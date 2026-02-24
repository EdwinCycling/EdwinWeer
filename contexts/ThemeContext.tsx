import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { AppTheme } from '../types';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useAuth } from '../hooks/useAuth';
import { ThemeContext } from '../hooks/useTheme';

// Debounce helper
const debounce = (func: Function, wait: number) => {
    let timeout: NodeJS.Timeout;
    return (...args: any[]) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
};

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [theme, setThemeState] = useState<AppTheme>('light');
    const { user } = useAuth();

    // 1. Startup Logic
    useEffect(() => {
        const storedTheme = localStorage.getItem('theme') as AppTheme;
        
        if (storedTheme) {
            setThemeState(storedTheme);
            applyTheme(storedTheme);
        } else {
            // Migration: Check legacy settings
            let legacyTheme: AppTheme | null = null;
            try {
                const settingsStr = localStorage.getItem('weather_app_settings');
                if (settingsStr) {
                    const parsed = JSON.parse(settingsStr);
                    if (parsed.theme) legacyTheme = parsed.theme;
                }
            } catch (e) {
                console.error("Error parsing legacy settings", e);
            }

            if (legacyTheme) {
                setThemeState(legacyTheme);
                applyTheme(legacyTheme);
                localStorage.setItem('theme', legacyTheme); // Migrate
            } else {
                // Check system preference
                const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                const defaultTheme = systemDark ? 'dark' : 'light';
                setThemeState(defaultTheme);
                applyTheme(defaultTheme);
            }
        }

        // Listen for system changes if no override is set? 
        // User didn't ask for dynamic system updates if not set, but it's good practice.
        // For now, follow instructions: Check at startup.
    }, []);

    // 2. Apply Theme Logic
    const applyTheme = (themeName: AppTheme) => {
        const root = document.documentElement;
        
        // Remove old classes for cleanup (optional, but good for transition)
        root.classList.remove('dark', 'light', 'neuro', 'iceland', 'retro', 'forest');
        
        // Set data-attribute as requested
        root.setAttribute('data-theme', themeName);
        
        // Keep class-based support for Tailwind 'darkMode: class' if needed
        // The user's CSS uses [data-theme='...'] but Tailwind might look for .dark
        if (themeName === 'dark' || themeName === 'neuro' || themeName === 'retro' || themeName === 'forest') {
            root.classList.add('dark');
        } else {
            root.classList.remove('dark');
        }

        // Add specific theme class for other themes if they use specific overrides
        if (themeName !== 'light' && themeName !== 'dark') {
            root.classList.add(themeName);
        }
    };

    // 3. Change Theme Logic
    const setTheme = (newTheme: AppTheme) => {
        setThemeState(newTheme);
        applyTheme(newTheme);
        localStorage.setItem('theme', newTheme);
        debouncedSaveToFirestore(newTheme, user?.uid);
    };

    // Firestore Sync (Debounced)
    const debouncedSaveToFirestore = debounce(async (themeToSave: AppTheme, uid: string | undefined) => {
        if (!uid || !db) return;
        try {
            const userRef = doc(db, 'users', uid);
            // We save it in settings object to maintain compatibility or a new field?
            // User said "Sla op in localStorage (en Firestore debounce)".
            // existing storageService saves settings.theme locally but EXCLUDES it from sync.
            // If user wants it in Firestore now, we should save it.
            // Let's save it under 'settings.theme' or just 'theme'?
            // I'll save it under 'settings.theme' to be consistent with potential future syncs.
            await setDoc(userRef, { settings: { theme: themeToSave } }, { merge: true });
            console.log("Theme saved to Firestore:", themeToSave);
        } catch (e) {
            console.error("Error saving theme to Firestore:", e);
        }
    }, 1000);

    return (
        <ThemeContext.Provider value={{ theme, setTheme }}>
            {children}
        </ThemeContext.Provider>
    );
};
