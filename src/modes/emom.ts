import { intervalMode } from './builders';

export const emom = intervalMode({
  id: 'emom',
  name: 'EMOM',
  description: 'Every minute on the minute: a new round each minute.',
  intervalSec: 60,
  defaultRounds: 10,
  maxRounds: 60,
});
