import 'dotenv/config';
import { run as stake } from './example/stake';
import { run as unstake } from './example/unstake';
import { run as fee } from './example/fee';
import { run as staker } from './example/staker';
import { run as deposits } from './example/deposits';

async function main() {
  const args = process.argv.slice(2);
  const example = args[0];

  if (example === 'stake') {
    await stake();
  } else if (example === 'unstake') {
    await unstake();
  } else if (example === 'fee') {
    await fee();
  } else if (example === 'staker') {
    await staker();
  } else if (example === 'deposits') {
    await deposits();
  } else {
    console.error('Invalid example');
  }
}

main().catch(console.error);
