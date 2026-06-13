// SurvivalWarning.jsx — the night-transition HUD toast (extracted from AdvancedGameFeatures S3-M4 p2).
import React from 'react';
import { motion } from 'framer-motion';
import { Icon, Toast } from './primitives/index.js';

export const SurvivalWarning = React.memo(({ message }) => {
    if (!message) return null;

    // Nightfall warnings read as danger; the dawn "you survived" message reads as a warn.
    const isNight = message.includes('Night');

    return (
        <motion.div
            initial={{ opacity: 0, y: -30, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -30, scale: 0.9 }}
            className="absolute top-32 left-1/2 transform -translate-x-1/2 z-30 pointer-events-none"
        >
            <Toast status={isNight ? 'danger' : 'warn'} className="flex items-center justify-center gap-2 text-center font-bold text-lg px-6 py-3">
                <Icon name={isNight ? 'skull' : 'sun'} size={20} className="flex-none" />
                {message}
            </Toast>
        </motion.div>
    );
});
