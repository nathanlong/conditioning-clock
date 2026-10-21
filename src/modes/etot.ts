import { intervalMode } from './builders';

export const etot = intervalMode({
  id: 'etot',
  name: 'ETOT',
  description: 'Every thirty on the thirty: a new round every 30 seconds.',
  intervalSec: 30,
  defaultRounds: 20,
  maxRounds: 120,
});
