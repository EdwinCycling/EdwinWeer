import React from 'react';
import { Modal } from '../../../components/Modal';
import { AppUpdate } from '../../data/updates';
import { Icon } from '../../../components/Icon';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  updates: AppUpdate[];
  onNavigate: (path: string) => void;
}

export const WhatsNewModal: React.FC<Props> = ({ isOpen, onClose, updates, onNavigate }) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="What's New 🚀">
      <div className="space-y-4">
        {updates.map((update, index) => (
          <div key={index} className="bg-bg-page border border-border-color rounded-xl p-4 shadow-sm">
            <div className="flex justify-between items-start mb-2">
               <h3 className="font-bold text-lg text-text-main">{update.title}</h3>
               <span className="text-xs text-text-muted bg-bg-card px-2 py-1 rounded-full">{update.version}</span>
            </div>
            <div className="text-xs text-text-muted mb-2">{update.date}</div>
            <p className="text-sm text-text-muted mb-3">{update.description}</p>
            {update.link && (
              <button 
                onClick={() => {
                  onNavigate(update.link!);
                  onClose();
                }}
                className="inline-flex items-center text-xs font-bold text-accent-primary hover:underline gap-1 cursor-pointer"
              >
                {update.linkLabel || "View"} <Icon name="arrow_forward" className="text-xs" />
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="mt-6 flex justify-end">
          <button 
            onClick={onClose}
            className="px-4 py-2 bg-bg-page hover:bg-bg-card text-text-main rounded-lg text-sm font-medium transition-colors border border-border-color cursor-pointer"
          >
            Close
          </button>
      </div>
    </Modal>
  );
};
