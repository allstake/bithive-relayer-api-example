import 'dotenv/config';
import { run as stake } from './example/stake';
import { run as unstake } from './example/unstake';
import { run as fee } from './example/fee';
import { run as staker } from './example/staker';

const args = process.argv.slice(2);
const example = args[0];

if (example === 'stake') {
  stake().catch(console.error);
} else if (example === 'unstake') {
  unstake().catch(console.error);
} else if (example === 'fee') {
  fee().catch(console.error);
} else if (example === 'staker') {
  staker().catch(console.error);
} else {
  console.error('Invalid example');
}
