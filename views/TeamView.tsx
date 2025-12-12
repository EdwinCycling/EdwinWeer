
import React from 'react';
import { Icon } from '../components/Icon';
import { ViewState } from '../types';

interface Props {
  onNavigate: (view: ViewState) => void;
}

export const TeamView: React.FC<Props> = ({ onNavigate }) => {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-background-dark p-6 pb-24 text-slate-800 dark:text-white overflow-y-auto">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
            <button onClick={() => onNavigate(ViewState.CURRENT)} className="size-10 flex items-center justify-center rounded-full hover:bg-slate-200 dark:hover:bg-white/10 transition-colors">
                <Icon name="arrow_back_ios_new" />
            </button>
            <h1 className="text-3xl font-bold">The Team</h1>
        </div>

        <div className="bg-white dark:bg-card-dark rounded-3xl p-8 shadow-sm border border-slate-100 dark:border-white/5 space-y-6">
            <div className="flex justify-center mb-6">
                <div className="size-24 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-full flex items-center justify-center text-white shadow-lg">
                    <Icon name="groups" className="text-5xl" />
                </div>
            </div>

            <h2 className="text-2xl font-bold text-center">Built by Enthusiasts</h2>
            
            <p className="text-lg text-slate-600 dark:text-white/80 leading-relaxed text-center">
                We are a passionate team of weather enthusiasts dedicated to bringing you the most accurate and beautiful weather experience. 
            </p>

            <div className="grid gap-6 md:grid-cols-2 mt-8">
                <div className="p-4 bg-slate-50 dark:bg-white/5 rounded-2xl">
                    <Icon name="public" className="text-3xl text-primary mb-2" />
                    <h3 className="font-bold mb-1">Free Data</h3>
                    <p className="text-sm opacity-70">We believe weather data should be accessible to everyone, everywhere, for free.</p>
                </div>
                <div className="p-4 bg-slate-50 dark:bg-white/5 rounded-2xl">
                    <Icon name="favorite" className="text-3xl text-red-400 mb-2" />
                    <h3 className="font-bold mb-1">Community Driven</h3>
                    <p className="text-sm opacity-70">From weather enthusiasts, for weather enthusiasts. We build what we love to use.</p>
                </div>
            </div>

            <p className="text-slate-600 dark:text-white/80 leading-relaxed mt-4">
                Our mission is to simplify complex meteorological data into an intuitive interface that helps you plan your day, your week, and your adventures. We are constantly improving and adding new features based on your feedback.
            </p>

            <div className="bg-indigo-50 dark:bg-indigo-500/10 p-6 rounded-2xl border border-indigo-100 dark:border-indigo-500/20 mt-8">
                <h3 className="font-bold text-indigo-600 dark:text-indigo-300 mb-2 flex items-center gap-2">
                    <Icon name="volunteer_activism" /> Support Us
                </h3>
                <p className="text-sm text-indigo-800 dark:text-indigo-200/80">
                    Building and maintaining this app takes time and resources. Your support, whether through feedback or sharing the app, means the world to us. Together, we make the weather beautiful.
                </p>
            </div>
        </div>
      </div>
    </div>
  );
};
