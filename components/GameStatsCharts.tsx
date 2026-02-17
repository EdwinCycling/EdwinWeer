import React, { useMemo } from 'react';
import { GameBet, AppSettings } from '../types';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  PointElement,
  LineElement,
  ArcElement,
} from 'chart.js';
import { Bar, Pie } from 'react-chartjs-2';
import { Icon } from './Icon';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  PointElement,
  LineElement,
  ArcElement
);

interface Props {
  bets: GameBet[];
  baroPrediction?: { max: number; min: number };
  settings: AppSettings;
}

const GameStatsCharts: React.FC<Props> = ({ bets, baroPrediction, settings }) => {
  const stats = useMemo(() => {
    if (!bets.length) return null;

    const maxTemps = bets.map(b => b.prediction.max);
    const minTemps = bets.map(b => b.prediction.min);

    const avgMax = maxTemps.reduce((a, b) => a + b, 0) / maxTemps.length;
    const avgMin = minTemps.reduce((a, b) => a + b, 0) / minTemps.length;

    const highestMax = Math.max(...maxTemps);
    const lowestMax = Math.min(...maxTemps);
    
    // Distribution for Max Temps (buckets of 0.5 or 1)
            const maxDistribution: Record<string, number> = {};
            maxTemps.forEach(temp => {
                const bucket = temp.toFixed(1); // Keep 1 decimal
                maxDistribution[bucket] = (maxDistribution[bucket] || 0) + 1;
            });

            // Distribution for Min Temps
            const minDistribution: Record<string, number> = {};
            minTemps.forEach(temp => {
                const bucket = temp.toFixed(1);
                minDistribution[bucket] = (minDistribution[bucket] || 0) + 1;
            });

            // Sort buckets
            const sortedMaxBuckets = Object.keys(maxDistribution).sort((a, b) => parseFloat(a) - parseFloat(b));
            const sortedMinBuckets = Object.keys(minDistribution).sort((a, b) => parseFloat(a) - parseFloat(b));

            // Find "Crowd Favorite" (Mode)
            const maxMode = sortedMaxBuckets.reduce((a, b) => maxDistribution[a] > maxDistribution[b] ? a : b, sortedMaxBuckets[0]);

            // Baro comparison stats
            let belowBaro = 0;
            let aboveBaro = 0;

            if (baroPrediction) {
                maxTemps.forEach(temp => {
                    if (temp <= baroPrediction.max) belowBaro++;
                    else aboveBaro++;
                });
            }
            
            return {
                avgMax,
                avgMin,
                highestMax,
                lowestMax,
                maxDistribution,
                minDistribution,
                sortedMaxBuckets,
                sortedMinBuckets,
                maxMode,
                belowBaro,
                aboveBaro
            };
          }, [bets, baroPrediction]);

  if (!stats) return null;

  const maxChartData = {
    labels: stats.sortedMaxBuckets.map(b => `${b}°`),
    datasets: [
      {
        label: settings.language === 'nl' ? 'Aantal voorspellingen' : 'Number of predictions',
        data: stats.sortedMaxBuckets.map(b => stats.maxDistribution[b]),
        backgroundColor: 'rgba(239, 68, 68, 0.5)', // Red-500 with opacity
        borderColor: 'rgb(239, 68, 68)',
        borderWidth: 1,
        borderRadius: 4,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: {
        display: false,
      },
      title: {
        display: false,
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
            stepSize: 1,
            color: '#9ca3af' // text-muted
        },
        grid: {
            color: 'rgba(156, 163, 175, 0.1)' // border-color low opacity
        }
      },
      x: {
        ticks: {
            color: '#9ca3af'
        },
        grid: {
            display: false
        }
      }
    },
  };

  const pieChartData = {
      labels: [
          settings.language === 'nl' ? 'Onder Baro' : 'Below Baro',
          settings.language === 'nl' ? 'Boven Baro' : 'Above Baro'
      ],
      datasets: [
          {
              data: [stats.belowBaro, stats.aboveBaro],
              backgroundColor: [
                  'rgba(59, 130, 246, 0.6)', // Blue-500
                  'rgba(239, 68, 68, 0.6)',  // Red-500
              ],
              borderColor: [
                  'rgb(59, 130, 246)',
                  'rgb(239, 68, 68)',
              ],
              borderWidth: 1,
          },
      ],
  };

  const pieChartOptions = {
      responsive: true,
      plugins: {
          legend: {
              position: 'bottom' as const,
              labels: {
                  color: '#9ca3af',
                  usePointStyle: true,
              }
          }
      }
  };

  return (
    <div className="space-y-6 animate-fade-in">
        {/* Crowd Wisdom Cards */}
        <div className="grid grid-cols-2 gap-4">
            <div className="bg-bg-page p-4 rounded-xl border border-border-color">
                <div className="flex items-center gap-2 mb-2">
                    <Icon name="groups" className="text-accent-primary" />
                    <span className="text-xs font-bold uppercase text-text-muted">
                        {settings.language === 'nl' ? 'Meest gekozen' : 'Most Picked'}
                    </span>
                </div>
                <div className="text-2xl font-bold text-text-main">
                    {stats.maxMode}°
                </div>
                <p className="text-xs text-text-muted mt-1">
                    {stats.maxDistribution[stats.maxMode]} {settings.language === 'nl' ? 'deelnemers' : 'participants'}
                </p>
            </div>
            
            <div className="bg-bg-page p-4 rounded-xl border border-border-color">
                <div className="flex items-center gap-2 mb-2">
                    <Icon name="compare_arrows" className="text-accent-primary" />
                    <span className="text-xs font-bold uppercase text-text-muted">
                        {settings.language === 'nl' ? 'Spreiding' : 'Spread'}
                    </span>
                </div>
                <div className="text-2xl font-bold text-text-main">
                    {stats.lowestMax.toFixed(0)}° - {stats.highestMax.toFixed(0)}°
                </div>
                <p className="text-xs text-text-muted mt-1">
                    {settings.language === 'nl' ? 'Max temperatuur range' : 'Max temperature range'}
                </p>
            </div>
        </div>

        {/* Max Temp Distribution Chart */}
        <div className="bg-bg-page p-4 rounded-xl border border-border-color">
            <h4 className="font-bold mb-4 text-text-main flex items-center gap-2">
                <Icon name="bar_chart" className="text-text-muted" />
                {settings.language === 'nl' ? 'Verdeling Max Temperatuur' : 'Max Temp Distribution'}
            </h4>
            <div className="h-48">
                <Bar data={maxChartData} options={chartOptions} />
            </div>
        </div>

        {/* Baro vs Crowd Comparison */}
                {baroPrediction && (
                    <div className="bg-bg-page p-4 rounded-xl border border-border-color">
                         <h4 className="font-bold mb-4 text-text-main flex items-center gap-2">
                            <Icon name="psychology" className="text-text-muted" />
                            {settings.language === 'nl' ? 'Baro vs De Rest' : 'Baro vs The Rest'}
                        </h4>
                        
                        <div className="space-y-6">
                            {/* Linear Comparison */}
                            <div>
                                <div className="flex justify-between text-sm mb-1">
                                    <span className="text-text-muted">Baro Max</span>
                                    <span className="font-bold text-red-500">{baroPrediction.max.toFixed(1)}°</span>
                                </div>
                                <div className="flex justify-between text-sm mb-1">
                                    <span className="text-text-muted">{settings.language === 'nl' ? 'Gemiddelde Max' : 'Average Max'}</span>
                                    <span className="font-bold text-text-main">{stats.avgMax.toFixed(1)}°</span>
                                </div>
                                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mt-2 overflow-hidden">
                                    <div 
                                        className="bg-red-500 h-2 rounded-full relative transition-all duration-500"
                                        style={{ width: `${Math.min(100, (baroPrediction.max / 40) * 100)}%` }}
                                    ></div>
                                     <div 
                                        className="bg-text-main h-2 rounded-full absolute top-0 opacity-30 transition-all duration-500"
                                        style={{ width: `${Math.min(100, (stats.avgMax / 40) * 100)}%` }}
                                    ></div>
                                </div>
                                 <p className="text-[10px] text-text-muted mt-1 text-right">
                                    {Math.abs(baroPrediction.max - stats.avgMax) < 0.5 
                                        ? (settings.language === 'nl' ? 'Baro is het eens met de groep!' : 'Baro agrees with the crowd!')
                                        : (baroPrediction.max > stats.avgMax 
                                            ? (settings.language === 'nl' ? 'Baro is optimistischer' : 'Baro is more optimistic')
                                            : (settings.language === 'nl' ? 'Baro is pessimistischer' : 'Baro is more pessimistic'))
                                    }
                                </p>
                            </div>

                            {/* Pie Chart Distribution */}
                            <div className="pt-4 border-t border-border-color">
                                <h5 className="text-sm font-bold text-text-muted mb-4 text-center">
                                    {settings.language === 'nl' ? 'Voorspellingen t.o.v. Baro' : 'Predictions vs Baro'}
                                </h5>
                                <div className="h-48 w-full flex justify-center">
                                    <Pie data={pieChartData} options={pieChartOptions} />
                                </div>
                            </div>
                        </div>
                    </div>
                )}
    </div>
  );
};

export default GameStatsCharts;
