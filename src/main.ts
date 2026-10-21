import './styles.css';
import { startApp } from './app';
import { createAudioEngine } from './audio/context';
import { browserClock } from './core/clock';
import { browserStorage } from './platform/storage';
import { browserWakeLock } from './platform/wakeLock';

startApp({
  root: document.querySelector<HTMLElement>('#app')!,
  clock: browserClock,
  storage: browserStorage(),
  audio: createAudioEngine(),
  wakeLock: browserWakeLock(),
  soundCheck: import.meta.env.DEV,
});
