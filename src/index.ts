import 'dotenv/config';
import { run as basic } from './example/basic';
import { run as staker } from './example/staker';

const args = process.argv.slice(2);
const example = args[0];

if (example === 'basic') {
  basic().catch(console.error);
} else if (example === 'staker') {
  staker().catch(console.error);
} else {
  console.error('Invalid example');
}
