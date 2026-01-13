import React from 'react';
import { Icon } from './Icon';
import { Modal } from './Modal';
import { getTranslation } from '../services/translations';
import { AppSettings } from '../types';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    settings?: AppSettings;
    // Props passed by parent views but not used in the modal currently
    currentTemp?: number;
    windSpeed?: number;
    humidity?: number;
    apparentTemp?: number;
}

export const FeelsLikeInfoModal: React.FC<Props> = ({ isOpen, onClose, settings }) => {
    if (!isOpen) return null;

    const t = (key: string) => settings ? getTranslation(key, settings.language) : key;

    return (
        <Modal 
            isOpen={isOpen} 
            onClose={onClose} 
            title={t('feels_like.modal.title')}
            className="!w-full !max-w-[80%]"
        >
            <div className="space-y-6 text-text-muted leading-relaxed">
                <section>
                    <p>
                        {t('feels_like.modal.intro')}
                    </p>
                </section>

                <section>
                    <h3 className="font-bold text-lg text-text-main mb-2 flex items-center gap-2">
                        <Icon name="air" className="text-blue-500" />
                        {t('feels_like.modal.windchill_title')}
                    </h3>
                    <p className="mb-3">
                        {t('feels_like.modal.windchill_text1')}
                    </p>
                    <p className="mb-3" dangerouslySetInnerHTML={{ __html: t('feels_like.modal.windchill_text2') }} />
                    <div className="bg-bg-page p-4 rounded-xl border border-border-color mb-3 font-mono text-sm">
                        <p className="font-bold mb-1">{t('feels_like.modal.formula_title')}</p>
                        <p>G = 13,12 + 0,6215 × T - 11,37 × (W^0,16) + 0,3965 × T × (W^0,16)</p>
                        <p className="text-xs mt-2 opacity-70" dangerouslySetInnerHTML={{ __html: t('feels_like.modal.formula_note') }} />
                    </div>
                    <p>
                        {t('feels_like.modal.windchill_text3')}
                    </p>
                </section>

                <section>
                    <h3 className="font-bold text-lg text-text-main mb-2 flex items-center gap-2">
                        <Icon name="water_drop" className="text-blue-400" />
                        {t('feels_like.modal.humidity_title')}
                    </h3>
                    <p className="mb-3">
                        {t('feels_like.modal.humidity_text1')}
                    </p>
                    <p className="mb-3">
                        {t('feels_like.modal.humidity_text2')}
                    </p>
                    <p>
                        {t('feels_like.modal.humidity_text3')}
                    </p>
                </section>

                <section>
                    <h3 className="font-bold text-lg text-text-main mb-2 flex items-center gap-2">
                        <Icon name="wb_sunny" className="text-orange-500" />
                        {t('feels_like.modal.sun_title')}
                    </h3>
                    <p>
                        {t('feels_like.modal.sun_text')}
                    </p>
                </section>
            </div>
        </Modal>
    );
};
