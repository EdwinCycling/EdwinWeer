
import React from 'react';
import { Icon } from '../components/Icon';
import { ViewState } from '../types';

interface Props {
  onNavigate: (view: ViewState) => void;
}

export const InfoView: React.FC<Props> = ({ onNavigate }) => {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-background-dark p-6 pb-24 text-slate-800 dark:text-white overflow-y-auto">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
            <button onClick={() => onNavigate(ViewState.CURRENT)} className="size-10 flex items-center justify-center rounded-full hover:bg-slate-200 dark:hover:bg-white/10 transition-colors">
                <Icon name="arrow_back_ios_new" />
            </button>
            <h1 className="text-3xl font-bold">About App</h1>
        </div>

        <div className="space-y-12">
            <section className="text-center">
                <h2 className="text-4xl font-display font-bold mb-4 bg-gradient-to-r from-blue-500 to-indigo-600 bg-clip-text text-transparent">
                    Weather Reimagined
                </h2>
                <p className="text-xl text-slate-600 dark:text-white/80 leading-relaxed">
                    More than just a forecast. A comprehensive meteorological tool designed for clarity, precision, and depth.
                </p>
            </section>

            <div className="grid md:grid-cols-2 gap-6">
                <div className="bg-white dark:bg-card-dark p-6 rounded-3xl border border-slate-100 dark:border-white/5">
                    <div className="size-12 rounded-2xl bg-orange-100 dark:bg-orange-500/20 flex items-center justify-center text-orange-500 mb-4">
                        <Icon name="history" className="text-2xl" />
                    </div>
                    <h3 className="text-xl font-bold mb-2">Historical Comparison</h3>
                    <p className="text-slate-500 dark:text-white/60">
                        Unique to our app, compare today's weather with exactly one year ago, or any date in the past. Understand trends and context like never before.
                    </p>
                </div>

                <div className="bg-white dark:bg-card-dark p-6 rounded-3xl border border-slate-100 dark:border-white/5">
                    <div className="size-12 rounded-2xl bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center text-blue-500 mb-4">
                        <Icon name="model_training" className="text-2xl" />
                    </div>
                    <h3 className="text-xl font-bold mb-2">Multi-Model Ensembles</h3>
                    <p className="text-slate-500 dark:text-white/60">
                        Don't rely on one source. Access 15+ global weather models including GFS, ECMWF, ICON, and GEM to see the full picture of uncertainty and probability.
                    </p>
                </div>

                <div className="bg-white dark:bg-card-dark p-6 rounded-3xl border border-slate-100 dark:border-white/5">
                    <div className="size-12 rounded-2xl bg-green-100 dark:bg-green-500/20 flex items-center justify-center text-green-500 mb-4">
                        <Icon name="grass" className="text-2xl" />
                    </div>
                    <h3 className="text-xl font-bold mb-2">Deep Soil & Agriculture</h3>
                    <p className="text-slate-500 dark:text-white/60">
                        Professional-grade data including soil moisture at different depths, evapotranspiration, and leaf wetness. Essential for gardening and farming.
                    </p>
                </div>

                <div className="bg-white dark:bg-card-dark p-6 rounded-3xl border border-slate-100 dark:border-white/5">
                    <div className="size-12 rounded-2xl bg-purple-100 dark:bg-purple-500/20 flex items-center justify-center text-purple-500 mb-4">
                        <Icon name="analytics" className="text-2xl" />
                    </div>
                    <h3 className="text-xl font-bold mb-2">Privacy First</h3>
                    <p className="text-slate-500 dark:text-white/60">
                        We don't track your location history. Your data stays on your device. We believe in privacy by design.
                    </p>
                </div>
            </div>

            <section className="bg-slate-100 dark:bg-white/5 rounded-3xl p-8">
                <h3 className="text-2xl font-bold mb-4">What makes us unique?</h3>
                <p className="text-slate-600 dark:text-white/80 mb-4">
                    Most weather apps show you a simple icon and a temperature. We believe you deserve more. We visualize the atmosphere, giving you insights into cloud layers, wind shear, and thermodynamic indices that usually only meteorologists see.
                </p>
                <p className="text-slate-600 dark:text-white/80">
                    Whether you are a photographer looking for the golden hour, a sailor checking wind gusts, or just someone who wants to know if they need an umbrella, we have built this for you.
                </p>
            </section>
        </div>
      </div>
    </div>
  );
};