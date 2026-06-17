import React from 'react';
import { Panel, Button, Icon, Modal } from './primitives/index.js';
import { useT } from '../i18n/i18n.js';

// Bold-flat Credits / Attributions modal (S1C-M3-T5). Mirrors SettingsPanel:
// bg-ink/75 backdrop (click-to-close) · Panel variant="raise" · header with Icon +
// title + ghost close Button · stopPropagation on the card. game-icons.net glyphs
// are baked under CC BY 3.0 (see gameIcons.js) -> attribution is owed; the bundled
// fonts (OFL / free-commercial) are credited here too. Tokens only, no chrome hex,
// no emoji. User-facing copy goes through t().

// One attribution row: label (font/source name) + license tag.
function CreditRow({ label, license }) {
    return (
        <div className="flex items-baseline justify-between gap-3">
            <span className="font-bold text-text">{label}</span>
            <span className="text-xs text-text-muted uppercase tracking-wide whitespace-nowrap">{license}</span>
        </div>
    );
}

export const CreditsScreen = React.memo(({ onClose }) => {
    const t = useT();
    return (
        <Modal className="absolute inset-0 bg-ink/75 grid place-items-center z-50 select-none animate-fade-in" label={t('credits.title')} onClose={onClose}>
            <Panel
                variant="raise"
                className="w-[420px] max-w-[95vw] overflow-hidden shadow-elev-xl p-0"
                onClick={e => e.stopPropagation()}
            >
                {/* Header bar */}
                <div className="flex items-center justify-between px-5 py-4 bg-panel-raise border-b-chrome border-ink">
                    <div className="flex items-center gap-3">
                        <Icon name="heart" size={26} className="text-accent" />
                        <span className="font-display text-xxl tracking-wide">{t('credits.title')}</span>
                    </div>
                    <Button variant="ghost" size="sm" aria-label={t('ui.close')} onClick={onClose} className="w-9 h-9 p-0 text-text-muted">
                        <Icon name="close" size={18} />
                    </Button>
                </div>

                {/* Body */}
                <div className="flex flex-col gap-4 px-5 pt-5 pb-5">
                    {/* Game icons — CC BY 3.0 (attribution owed) */}
                    <Panel variant="inset" className="bg-slot flex flex-col gap-2 px-4 py-3">
                        <span className="text-xs text-text-muted uppercase tracking-widest">{t('credits.icons_heading')}</span>
                        <div className="flex items-baseline justify-between gap-3">
                            <span className="font-bold text-text">
                                <a
                                    href="https://game-icons.net"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-accent underline underline-offset-2 hover:text-accent-raise"
                                >
                                    game-icons.net
                                </a>
                            </span>
                            <span className="text-xs text-text-muted uppercase tracking-wide whitespace-nowrap">CC BY 3.0</span>
                        </div>
                        <span className="text-xs text-text-muted leading-snug">{t('credits.icons_note')}</span>
                    </Panel>

                    {/* Fonts */}
                    <Panel variant="inset" className="bg-slot flex flex-col gap-2 px-4 py-3">
                        <span className="text-xs text-text-muted uppercase tracking-widest">{t('credits.fonts_heading')}</span>
                        <CreditRow label="Lilita One" license="OFL" />
                        <CreditRow label="Space Grotesk" license="OFL" />
                        <CreditRow label={t('credits.font_smiley')} license="OFL" />
                        <CreditRow label="Alibaba PuHuiTi 3.0" license={t('credits.license_free_commercial')} />
                    </Panel>

                    {/* Built with */}
                    <div className="text-xs text-text-muted text-center leading-snug">{t('credits.built_with')}</div>

                    <Button
                        variant="primary"
                        size="md"
                        onClick={onClose}
                        className="w-full"
                    >
                        {t('credits.done')}
                    </Button>
                </div>
            </Panel>
        </Modal>
    );
});
