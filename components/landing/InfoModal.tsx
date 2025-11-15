import React from 'react';
import Modal from '../common/Modal';
import { useTranslation } from '../../hooks/useTranslation';

type InfoKey = 'terms' | 'policy' | 'contact';

interface InfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  contentKey: InfoKey | null;
}

const InfoModalContent: React.FC<{ contentKey: InfoKey }> = ({ contentKey }) => {
    const { t } = useTranslation();
    
    switch (contentKey) {
        case 'terms': {
            const content = t('modals.info.termsContent');
            return (
                <div className="text-sm text-gray-300 space-y-3 custom-scrollbar pr-2 max-h-[60vh] overflow-y-auto">
                    <p className="font-bold text-white">{content.h1}</p>
                    <p>{content.p1}</p>
                    <p>{content.p2}</p>
                    <p className="font-bold text-white mt-4">{content.h2}</p>
                    <ul className="list-disc list-inside pl-4 space-y-2">
                        <li dangerouslySetInnerHTML={{ __html: content.l1 }} />
                        <li dangerouslySetInnerHTML={{ __html: content.l2 }} />
                        <li dangerouslySetInnerHTML={{ __html: content.l3 }} />
                    </ul>
                    <p className="font-bold text-white mt-4">{content.h3}</p>
                    <p>{content.p3}</p>
                    <p className="font-bold text-white mt-4">{content.h4}</p>
                    <p>{content.p4}</p>
                    <p className="font-bold text-white mt-4">{content.h5}</p>
                    <p>{content.p5}</p>
                    <p className="font-bold text-white mt-4">{content.h6}</p>
                    <p>{content.p6}</p>
                </div>
            );
        }
        case 'policy': {
            const content = t('modals.info.policyContent');
            return (
                <div className="text-sm text-gray-300 space-y-3 custom-scrollbar pr-2 max-h-[60vh] overflow-y-auto">
                    <p className="font-bold text-white">{content.h1}</p>
                    <p>{content.p1}</p>
                    <ul className="list-disc list-inside pl-4">
                        <li>{content.l1}</li>
                        <li>{content.l2}</li>
                        <li>{content.l3}</li>
                    </ul>
                    <p>{content.p2}</p>
                    <p className="font-bold text-white">{content.h2}</p>
                    <p>{content.p3}</p>
                     <ul className="list-disc list-inside pl-4">
                        <li>{content.l4}</li>
                        <li>{content.l5}</li>
                        <li>{content.l6}</li>
                    </ul>
                    <p className="font-bold text-white">{content.h3}</p>
                    <p>{content.p4}</p>
                    <p className="font-bold text-white">{content.h4}</p>
                    <p>{content.p5}</p>
                </div>
            );
        }
        case 'contact': {
            const content = t('modals.info.contactContent');
            return (
                <div className="text-sm text-gray-300 space-y-4">
                    <p>{content.intro}</p>
                    <div className="space-y-3">
                        <div className="bg-white/5 p-3 rounded-lg">
                            <p className="text-gray-400">{content.founder}</p>
                            <p className="font-semibold text-white">{content.founderName}</p>
                        </div>
                        <div className="bg-white/5 p-3 rounded-lg">
                            <p className="text-gray-400">{content.phone}</p>
                            <p className="font-semibold text-white">{content.phoneNumber}</p>
                        </div>
                        <div className="bg-white/5 p-3 rounded-lg">
                            <p className="text-gray-400">{content.email}</p>
                            <p className="font-semibold text-white">{content.emailAddress}</p>
                        </div>
                         <div className="bg-white/5 p-3 rounded-lg">
                            <p className="text-gray-400">{content.facebook}</p>
                            <a href={content.facebookLink} target="_blank" rel="noopener noreferrer" className="font-semibold text-pink-400 hover:underline break-all">{content.facebookLink}</a>
                        </div>
                    </div>
                </div>
            );
        }
        default:
            return null;
    }
};

const getTitleKey = (key: InfoKey | null): string => {
    switch (key) {
        case 'terms': return 'modals.info.titleTerms';
        case 'policy': return 'modals.info.titlePolicy';
        case 'contact': return 'modals.info.titleContact';
        default: return '';
    }
}

const InfoModal: React.FC<InfoModalProps> = ({ isOpen, onClose, contentKey }) => {
  const { t } = useTranslation();
  if (!isOpen || !contentKey) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t(getTitleKey(contentKey))}>
        <InfoModalContent contentKey={contentKey} />
    </Modal>
  );
};

export default InfoModal;