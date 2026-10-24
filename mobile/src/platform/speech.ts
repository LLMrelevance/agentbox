// The phone's own speech recogniser, as lib/dictation.ts asks for it: Apple's
// on an iPhone, Google's on Android, kept on the phone whenever it can be.
import { ExpoSpeechRecognitionModule as Recogniser } from 'expo-speech-recognition';
import { Platform } from 'react-native';
import { languageFor, type Speech } from '../lib/dictation';

let languages: Promise<{ locales: string[]; installedLocales: string[] }> | null = null;
const offered = () => (languages ??= Recogniser.getSupportedLocales({}).catch(() => ({ locales: [], installedLocales: [] })));
const phoneLanguage = () => { try { return Intl.DateTimeFormat().resolvedOptions().locale; } catch { return undefined; } };

// The languages are read before listening starts; a stop or a leave in
// between must win, or the microphone would come on after the box had gone.
let asked = 0;

export const phoneSpeech: Speech = {
  onDevice() {
    try { return Recogniser.supportsOnDeviceRecognition(); } catch { return false; }
  },
  async allow(speech) {
    const answer = speech ? await Recogniser.requestPermissionsAsync() : await Recogniser.requestMicrophonePermissionsAsync();
    return { granted: answer.granted, canAskAgain: answer.canAskAgain };
  },
  start(onDevice) {
    const mine = ++asked;
    void offered().then(({ locales, installedLocales }) => {
      if (mine !== asked) return;
      const lang = languageFor(phoneLanguage(), locales);
      // Android listens on the phone only in a language it has downloaded.
      const here = onDevice && (Platform.OS !== 'android' || (!!lang && installedLocales.includes(lang)));
      Recogniser.start({
        ...(lang ? { lang } : {}),
        interimResults: true,
        continuous: true,
        addsPunctuation: true,
        requiresOnDeviceRecognition: here,
        iosTaskHint: 'dictation',
        volumeChangeEventOptions: { enabled: true, intervalMillis: 120 },
      });
    });
  },
  stop() { asked += 1; Recogniser.stop(); },
  abort() { asked += 1; Recogniser.abort(); },
  listen(on) {
    const subs = [
      Recogniser.addListener('start', () => on.start()),
      Recogniser.addListener('result', (e) => on.result(e.results[0]?.transcript ?? '', e.isFinal)),
      Recogniser.addListener('error', (e) => on.error(e.error, e.message)),
      Recogniser.addListener('end', () => on.end()),
      Recogniser.addListener('volumechange', (e) => on.level(e.value)),
    ];
    return () => subs.forEach((s) => s.remove());
  },
};
