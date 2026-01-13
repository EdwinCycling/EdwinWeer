import { useState, useEffect } from 'react';

export const useThemeColors = () => {
    const [colors, setColors] = useState({
        bgPage: '#f8f9fa',
        bgCard: '#ffffff',
        textMain: '#1a1a1a',
        textMuted: '#6c757d',
        accentPrimary: '#007bff',
        borderColor: '#e9ecef'
    });

    useEffect(() => {
        const updateColors = () => {
            const style = getComputedStyle(document.documentElement);
            setColors({
                bgPage: style.getPropertyValue('--bg-page').trim() || '#f8f9fa',
                bgCard: style.getPropertyValue('--bg-card').trim() || '#ffffff',
                textMain: style.getPropertyValue('--text-main').trim() || '#1a1a1a',
                textMuted: style.getPropertyValue('--text-muted').trim() || '#6c757d',
                accentPrimary: style.getPropertyValue('--accent-primary').trim() || '#007bff',
                borderColor: style.getPropertyValue('--border-color').trim() || '#e9ecef'
            });
        };

        // Initial update
        updateColors();

        // Observer for theme changes
        const observer = new MutationObserver(() => {
            updateColors();
        });

        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['data-theme', 'class']
        });

        return () => observer.disconnect();
    }, []);

    return colors;
};
