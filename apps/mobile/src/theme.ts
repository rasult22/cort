import { Platform } from 'react-native';

export const colors = {
    felt1: '#1c7257',
    felt2: '#0f4535',
    felt3: '#072019',
    gold: '#e9c46a',
    goldDeep: '#dba93d',
    goldLight: '#f8e2a0',
    goldSoft: 'rgba(233, 196, 106, 0.35)',
    ink: '#f4efe1',
    inkDim: 'rgba(244, 239, 225, 0.62)',
    panel: 'rgba(6, 26, 20, 0.78)',
    panelSolid: '#0a2a20',
    panelLine: 'rgba(233, 196, 106, 0.22)',
    red: '#c4162f',
    black: '#1b1b24',
    cardFace: '#fffdf5',
    cardBack: '#8d1328',
    danger: '#7d1024',
} as const;

/** A book face for headings: Georgia on iOS, the system serif on Android. */
export const serif = Platform.select({ ios: 'Georgia', default: 'serif' });
