import { useEffect, useRef, useState } from 'react';

const SCRIPT = 'https://accounts.google.com/gsi/client';

interface GoogleIdentity {
    initialize(options: { client_id: string; callback: (response: { credential?: string }) => void; ux_mode?: 'popup'; auto_select?: boolean }): void;
    renderButton(
        parent: HTMLElement,
        options: { type: 'standard'; theme: 'outline' | 'filled_blue'; size: 'large'; shape: 'pill'; text: 'continue_with'; logo_alignment: 'center'; locale: string; width: number },
    ): void;
}

declare global {
    interface Window {
        google?: { accounts: { id: GoogleIdentity } };
    }
}

let loading: Promise<GoogleIdentity> | null = null;

/** Loads Google's sign-in script once, the first time a button needs it. */
function loadGoogle(): Promise<GoogleIdentity> {
    loading ??= new Promise<GoogleIdentity>((resolve, reject) => {
        const script = document.createElement('script');
        script.src = SCRIPT;
        script.async = true;
        script.onload = () => (window.google ? resolve(window.google.accounts.id) : reject(new Error('Google Identity did not load')));
        script.onerror = () => reject(new Error('Google Identity did not load'));
        document.head.append(script);
    }).catch((error) => {
        loading = null; // Let the next button try again.
        throw error;
    });
    return loading;
}

interface GoogleButtonProps {
    clientId: string;
    /** Called with the ID token Google issued; the server checks it and opens a session. */
    onCredential: (credential: string) => void;
}

/**
 * "Continue with Google". The button itself is drawn by Google inside its own
 * frame, as its rules require; we only give it a place and take the result.
 */
export function GoogleButton({ clientId, onCredential }: GoogleButtonProps) {
    const holder = useRef<HTMLDivElement>(null);
    const callback = useRef(onCredential);
    callback.current = onCredential;
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let cancelled = false;
        loadGoogle()
            .then((google) => {
                const element = holder.current;
                if (cancelled || !element) return;
                google.initialize({
                    client_id: clientId,
                    ux_mode: 'popup',
                    callback: (response) => response.credential && callback.current(response.credential),
                });
                // Google draws the button at a fixed width in pixels, 400 at most.
                const width = Math.round(Math.min(400, Math.max(200, element.clientWidth)));
                google.renderButton(element, {
                    type: 'standard',
                    theme: 'outline',
                    size: 'large',
                    shape: 'pill',
                    text: 'continue_with',
                    logo_alignment: 'center',
                    locale: 'ru',
                    width,
                });
            })
            .catch(() => !cancelled && setFailed(true));
        return () => {
            cancelled = true;
        };
    }, [clientId]);

    if (failed) {
        return <p className="signin-problem">Не удалось загрузить вход через Google. Проверьте интернет или откройте игру в обычном браузере.</p>;
    }
    return <div ref={holder} className="google-button" />;
}
