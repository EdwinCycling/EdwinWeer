import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AppSettings, ViewState } from '../types';
import { getTranslation } from '../services/translations';
import { Icon } from './Icon';

interface Props {
  children: ReactNode;
  settings: AppSettings;
  onNavigate?: (view: ViewState) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      const t = (key: string) => getTranslation(key, this.props.settings.language);
      
      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-white">
          <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-xl max-w-md w-full text-center border border-slate-200 dark:border-white/10">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
              <Icon name="error_outline" className="text-3xl text-red-600 dark:text-red-400" />
            </div>
            
            <h2 className="text-xl font-bold mb-2">{t('error.boundary.title') || 'Oeps, er ging iets mis'}</h2>
            <p className="text-slate-600 dark:text-slate-300 mb-6 text-sm">
              {this.state.error?.message || t('error.boundary.message') || 'Er is een onverwachte fout opgetreden. Probeer de pagina te verversen.'}
            </p>

            <div className="flex flex-col gap-3">
              <button
                onClick={() => window.location.reload()}
                className="w-full py-3 bg-primary text-white rounded-xl font-bold hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
              >
                <Icon name="refresh" />
                {t('error.boundary.refresh') || 'Ververs Pagina'}
              </button>
              
              {this.props.onNavigate && (
                <button
                  onClick={() => {
                      this.setState({ hasError: false, error: null });
                      this.props.onNavigate!(ViewState.CURRENT);
                  }}
                  className="w-full py-3 bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-white rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
                >
                  {t('error.boundary.home') || 'Terug naar Home'}
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
