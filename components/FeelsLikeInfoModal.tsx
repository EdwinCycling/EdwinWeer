import React from 'react';
import { Icon } from './Icon';
import { Modal } from './Modal';

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

export const FeelsLikeInfoModal: React.FC<Props> = ({ isOpen, onClose }) => {
    if (!isOpen) return null;

    return (
        <Modal 
            isOpen={isOpen} 
            onClose={onClose} 
            title="Gevoelstemperatuur"
            className="!w-full !max-w-[80%]"
        >
            <div className="space-y-6 text-slate-600 dark:text-white/80 leading-relaxed">
                <section>
                    <p>
                        Een term die steeds meer ingeburgerd is geraakt is 'gevoelstemperatuur'. Hiermee wil men een indicatie geven van hoe de temperatuur aanvoelt. Dit is iets anders dan een normale temperatuur. Een normale temperatuur is meetbaar met een thermometer en is een vast gegeven. De gevoelstemperatuur steekt iets lastiger in elkaar. Dat komt vooral door de factor 'gevoel'. Omdat dit iets is wat niet met honderd procent nauwkeurigheid vast te stellen is, is het een flinke uitdaging om dit op een wetenschappelijke manier te benaderen. Geheel onmogelijk is het niet.
                    </p>
                </section>

                <section>
                    <h3 className="font-bold text-lg text-slate-800 dark:text-white mb-2 flex items-center gap-2">
                        <Icon name="air" className="text-blue-500" />
                        Windchill & JAG/TI Methode
                    </h3>
                    <p className="mb-3">
                        Iedereen zal weleens ervaren hebben dat het op een koude winterdag met een harde oostenwind beduidend koeler aanvoelt dan wanneer er amper sprake is van wind. De wind is van invloed op hoe wij een bepaalde temperatuur ervaren. Klimatologen hebben daar zelfs een term voor bedacht: de windchill.
                    </p>
                    <p className="mb-3">
                        De <strong>JAG/TI methode</strong>, die onder andere door het KNMI gehanteerd wordt, berekent de gevoelstemperatuur op basis van de werkelijke temperatuur en de windsnelheid. Experts vinden deze berekeningsmethode er eentje die zeer dicht bij de werkelijkheid komt.
                    </p>
                    <div className="bg-slate-100 dark:bg-white/10 p-4 rounded-xl border border-slate-200 dark:border-white/10 mb-3 font-mono text-sm">
                        <p className="font-bold mb-1">De formule:</p>
                        <p>G = 13,12 + 0,6215 × T - 11,37 × (W^0,16) + 0,3965 × T × (W^0,16)</p>
                        <p className="text-xs mt-2 opacity-70">
                            Waarbij:<br/>
                            G = Gevoelstemperatuur (°C)<br/>
                            T = Luchttemperatuur (°C)<br/>
                            W = Gemiddelde windsnelheid (km/u)
                        </p>
                    </div>
                    <p>
                        De JAG/TI methode is gebaseerd op de hoeveelheid warmteverlies. Wind accelereert het warmteverlies via de huid. Hierdoor kan men bepalen in welke mate er beschermende en eventueel isolerende kleding nodig is. Bij lage temperaturen kan de windchill zorgen voor gevaarlijke omstandigheden. Denk aan onderkoeling of bevriezing van lichaamsdelen.
                    </p>
                </section>

                <section>
                    <h3 className="font-bold text-lg text-slate-800 dark:text-white mb-2 flex items-center gap-2">
                        <Icon name="water_drop" className="text-blue-400" />
                        Luchtvochtigheid
                    </h3>
                    <p className="mb-3">
                        De luchtvochtigheid is naast wind een andere bepalende factor voor de gevoelstemperatuur. Een hoge luchtvochtigheid kan ervoor zorgen dat het bij lagere temperaturen kouder aanvoelt (waterkoud).
                    </p>
                    <p className="mb-3">
                        Het effect van de luchtvochtigheid is beter merkbaar bij hoge temperaturen. Hoe meer vocht er in de lucht zit, des te lastiger het voor het menselijk lichaam wordt om lichaamswarmte af te voeren door te zweten. Het weer wordt als benauwd ervaren.
                    </p>
                    <p>
                        De Amerikaanse NOAA heeft een warmte-index (Heat Index) gemaakt voor combinaties van temperatuur en luchtvochtigheid. Zo voelt 30°C met 80% vochtigheid aan als 38°C.
                    </p>
                </section>

                <section>
                    <h3 className="font-bold text-lg text-slate-800 dark:text-white mb-2 flex items-center gap-2">
                        <Icon name="wb_sunny" className="text-orange-500" />
                        Zon
                    </h3>
                    <p>
                        Een factor die zeker invloed heeft op hoe wij mensen warmte of kou ervaren is de zon. De hoeveelheid zonneschijn wordt in standaard berekeningen van gevoelstemperatuur vaak niet meegenomen, maar heeft wel degelijk invloed. In de directe zon voelt het vaak enkele graden warmer aan dan in de schaduw, zelfs als de luchttemperatuur gelijk is.
                    </p>
                </section>
            </div>
        </Modal>
    );
};
