import React from 'react';
import { LandingPage } from '../components/landing-v2/LandingPage';
import { ViewState } from '../types';

interface Props {
    onNavigate: (view: ViewState) => void;
}

export const LandingPageV2: React.FC<Props> = ({ onNavigate }) => {
    return <LandingPage onNavigate={onNavigate} />;
};
