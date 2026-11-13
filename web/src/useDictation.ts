import { useCallback, useEffect, useRef, useState } from "react";

// Minimal typing for the Web Speech API (not in lib.dom for every TS version).
type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean;
  start(): void; stop(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};
type RecognitionCtor = new () => Recognition;

const Ctor = (): RecognitionCtor | undefined =>
  (globalThis as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }).SpeechRecognition
  ?? (globalThis as unknown as { webkitSpeechRecognition?: RecognitionCtor }).webkitSpeechRecognition;

/**
 * Browser-native dictation (Chrome/Edge/Safari). `onText` receives each finalized phrase.
 * ponytail: Web Speech API sends audio to the browser vendor's service; swap for a server-side STT if that matters.
 */
export function useDictation(onText: (text: string) => void, onError: (msg: string) => void) {
  const supported = !!Ctor();
  const [listening, setListening] = useState(false);
  const rec = useRef<Recognition | null>(null);
  const cb = useRef({ onText, onError });
  cb.current = { onText, onError };

  useEffect(() => () => rec.current?.stop(), []);

  const toggle = useCallback(() => {
    if (rec.current) { rec.current.stop(); return; }
    const C = Ctor();
    if (!C) return;
    const r = new C();
    r.lang = "it-IT";
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++)
        if (e.results[i].isFinal) cb.current.onText(e.results[i][0].transcript.trim());
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed") cb.current.onError("Permesso microfono negato: abilitalo nelle impostazioni del browser.");
      else if (e.error !== "no-speech" && e.error !== "aborted") cb.current.onError(`Dettatura non disponibile (${e.error}).`);
    };
    r.onend = () => { rec.current = null; setListening(false); };
    rec.current = r;
    r.start();
    setListening(true);
  }, []);

  return { supported, listening, toggle };
}
