// THE TESTER: direct EOA call to official SqueekMining.checkpoint() on Sepolia.
// Usage:
//   npx tsx scripts/tester-tx.ts --dry-run          # no key needed: status + simulation only
//   PRIVATE_KEY=... npx tsx scripts/tester-tx.ts    # simulate, then send if simulation passes
//   PRIVATE_KEY=... npx tsx scripts/tester-tx.ts --wait   # poll until the round settles, then send
// PRIVATE_KEY is read from env only and is never printed or written anywhere.
import { createPublicClient, createWalletClient, http, getAddress, BaseError, ContractFunctionRevertedError } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const official = JSON.parse(fs.readFileSync(path.join(root, 'abi/SqueekMining.json'), 'utf8'));
const MINING_ABI: any = official.abi ?? official; // full official ABI so custom errors (e.g. RoundNotSettled) decode

const RPC_URL = process.env.RPC_URL || 'https://sepolia.gateway.tenderly.co';
const MINING = getAddress('0x3beE588fC20dE788Bac17d33b41Da7346cb27EC4'); // official, sepolia.json release squeeks-sepolia-core3-mining6-001
const EXPECTED_FROM = getAddress('0x9a35216211e70b9e786fa5d5c5e4e526d1267897');
const EXPLORER = 'https://eth-sepolia.blockscout.com';
const DRY = process.argv.includes('--dry-run');
const WAIT = process.argv.includes('--wait');
const WAIT_MAX_MS = Number(process.env.WAIT_MAX_MS || 30 * 60_000);

const pub = createPublicClient({ chain: sepolia, transport: http(RPC_URL) });

function revertName(e: unknown): string {
  if (e instanceof BaseError) {
    const r = e.walk((x) => x instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null;
    if (r?.data?.errorName) return r.data.errorName;
    return e.shortMessage;
  }
  return String(e);
}

async function status() {
  const [corePaused, nextRound, roundSettled] = (await pub.readContract({ address: MINING, abi: MINING_ABI, functionName: 'checkpointStatus' })) as [boolean, bigint, boolean];
  return { corePaused, nextRound, roundSettled };
}

async function simulate(account: `0x${string}`) {
  try {
    const { request } = await pub.simulateContract({ address: MINING, abi: MINING_ABI, functionName: 'checkpoint', account });
    return { ok: true as const, request };
  } catch (e) { return { ok: false as const, reason: revertName(e) }; }
}

async function main() {
  const chainId = await pub.getChainId();
  if (chainId !== 11155111) throw new Error(`Wrong chain ${chainId}`);
  const bal = await pub.getBalance({ address: EXPECTED_FROM });
  console.log(`from=${EXPECTED_FROM} balance=${Number(bal) / 1e18} ETH  target=SqueekMining ${MINING}`);

  let s = await status();
  console.log(`checkpointStatus: corePaused=${s.corePaused} nextRound=${s.nextRound} roundSettled=${s.roundSettled}`);
  let sim = await simulate(EXPECTED_FROM);
  console.log(sim.ok ? 'simulation: OK' : `simulation: reverts (${sim.reason})`);

  if (WAIT && !sim.ok) {
    const t0 = Date.now();
    while (!sim.ok && Date.now() - t0 < WAIT_MAX_MS) {
      await new Promise((r) => setTimeout(r, 15_000));
      s = await status(); sim = await simulate(EXPECTED_FROM);
      console.log(`[${new Date().toISOString()}] nextRound=${s.nextRound} roundSettled=${s.roundSettled} sim=${sim.ok ? 'OK' : sim.reason}`);
    }
  }
  if (DRY) return;
  if (!sim.ok) { console.error('Not sending: checkpoint() would revert now. Re-run later or use --wait.'); process.exit(2); }

  const pk = process.env.PRIVATE_KEY?.trim();
  if (!pk) { console.error('PRIVATE_KEY env not set.'); process.exit(1); }
  const account = privateKeyToAccount((pk.startsWith('0x') ? pk : `0x${pk}`) as `0x${string}`);
  if (getAddress(account.address) !== EXPECTED_FROM) { console.error(`Key does not match expected wallet (got ${account.address}). Aborting.`); process.exit(1); }

  const wallet = createWalletClient({ account, chain: sepolia, transport: http(RPC_URL) });
  const { request } = await pub.simulateContract({ address: MINING, abi: MINING_ABI, functionName: 'checkpoint', account }); // re-sim with signer
  const hash = await wallet.writeContract(request); // direct EOA -> SqueekMining, no intermediary contract
  console.log(`tx hash: ${hash}\nexplorer: ${EXPLORER}/tx/${hash}`);
  const rc = await pub.waitForTransactionReceipt({ hash });
  console.log(`status=${rc.status} block=${rc.blockNumber} gasUsed=${rc.gasUsed}`);
  if (rc.status !== 'success') process.exit(3);
}
main().catch((e) => { console.error(revertName(e)); process.exit(1); });
