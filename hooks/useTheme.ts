import { createContext, useContext } from 'react';
import { AppTheme } from '../types';

export interface ThemeContextType {
    theme: AppTheme;
    setTheme: (theme: AppTheme) => void;
}

export const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = () => {
    const context = useContext(ThemeContext);
    if (context === undefined) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
};
