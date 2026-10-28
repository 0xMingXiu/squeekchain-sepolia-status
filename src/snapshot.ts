// Library form of the Quickstart (setup + verify + read-core) parameterised by client/block,
// so the CLI scripts and the dashboard share exactly the same checks.
import { getAddress, keccak256, parseAbi, type Address, type Hex, type PublicClient } from "viem";
import { SqueekCoreAbi, SqueekMiningAbi, SqueekTokenAbi } from "./abis";

export const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Supply ${name}`);
  return value;
};

const IMPLEMENTATION_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const ADMIN_SLOT = "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103";
// ProxyAdmin has no published Squeek ABI; owner() is the standard OZ Ownable getter (as in the Quickstart).
const proxyAdminAbi = parseAbi(["function owner() view returns (address)"]);
const slotAddress = (word: Hex | undefined) => getAddress(`0x${(word ?? "0x").slice(-40)}`);
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export async function resolveBlock(client: PublicClient) {
  const raw = (process.env.ETHEREUM_BLOCK ?? "").trim();
  if (raw && /^\d+$/.test(raw)) return client.getBlock({ blockNumber: BigInt(raw) });
  const tag = (raw || "finalized") as "finalized" | "safe" | "latest";
  return client.getBlock({ blockTag: tag });
}

export async function checkChain(client: PublicClient) {
  const chainId = BigInt(await client.getChainId());
  if (chainId !== BigInt(required("EXPECTED_CHAIN_ID"))) throw new Error("Chain mismatch");
  return chainId;
}

export async function verifyProxy(client: PublicClient, blockNumber: bigint, name: "CORE" | "MINING", version: bigint) {
  const proxy = getAddress(required(`${name}_ADDRESS`));
  const abi = name === "CORE" ? SqueekCoreAbi : SqueekMiningAbi;
  const implementation = slotAddress(await client.getStorageAt({ address: proxy, slot: IMPLEMENTATION_SLOT, blockNumber }));
  const admin = slotAddress(await client.getStorageAt({ address: proxy, slot: ADMIN_SLOT, blockNumber }));
  const adminOwner = await client.readContract({ address: admin, abi: proxyAdminAbi, functionName: "owner", blockNumber });
  const code = await client.getCode({ address: implementation, blockNumber });
  const read = { address: proxy, abi, blockNumber } as const;
  const [reported, codeVersion, layout] = await Promise.all([
    client.readContract({ ...read, functionName: "implementationCodeAddress" }) as Promise<Address>,
    client.readContract({ ...read, functionName: "implementationCodeVersion" }) as Promise<bigint>,
    client.readContract({ ...read, functionName: "implementationStorageLayoutDigest" }) as Promise<Hex>,
  ]);
  const runtimeHash = code ? keccak256(code) : undefined;
  const checks: Record<string, boolean> = {
    implementation: same(implementation, required(`EXPECTED_${name}_IMPLEMENTATION`)),
    reportedImplementation: same(reported, implementation),
    runtimeHash: !!runtimeHash && same(runtimeHash, required(`EXPECTED_${name}_RUNTIME_HASH`)),
    proxyAdmin: same(admin, required(`EXPECTED_${name}_PROXY_ADMIN`)),
    layoutDigest: same(layout, required(`EXPECTED_${name}_LAYOUT_DIGEST`)),
    adminOwnedByTimelock: same(adminOwner, required("EXPECTED_TIMELOCK")),
    implementationVersion: codeVersion === version,
  };
  const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([k]) => k);
  if (failed.length) throw new Error(`${name}: deployment does not match the approved record (${failed.join(", ")})`);
  return { proxy, implementation, admin, adminOwner, runtimeHash: runtimeHash!, layout, codeVersion };
}

export async function verifyGraph(client: PublicClient, blockNumber: bigint) {
  const coreId = await verifyProxy(client, blockNumber, "CORE", 3n);
  const miningId = await verifyProxy(client, blockNumber, "MINING", 6n);
  const core = coreId.proxy, mining = miningId.proxy;
  const token = getAddress(required("SQK_ADDRESS"));
  const nft = getAddress(required("NFT_ADDRESS"));
  const [miningCore, tokenMining, policy, config] = await Promise.all([
    client.readContract({ address: mining, abi: SqueekMiningAbi, functionName: "core", blockNumber }),
    client.readContract({ address: token, abi: SqueekTokenAbi, functionName: "mining", blockNumber }),
    client.readContract({ address: mining, abi: SqueekMiningAbi, functionName: "collectionPolicy", args: [0], blockNumber }),
    client.readContract({ address: core, abi: SqueekCoreAbi, functionName: "configuration", blockNumber }),
  ]);
  if (!same(miningCore as string, core) || !same(tokenMining as string, mining) || !same((policy as { nft: string }).nft, nft)) {
    throw new Error("Contracts are not connected as one graph");
  }
  if (
    !same(config.streamId, required("EXPECTED_STREAM_ID")) ||
    config.genesisTimestamp !== BigInt(required("EXPECTED_GENESIS_TIMESTAMP")) ||
    !same(config.guardian, required("EXPECTED_GUARDIAN")) ||
    !same(config.reporter, required("EXPECTED_REPORTER")) ||
    config.maxWorkPerRound !== BigInt(required("EXPECTED_MAX_WORK_PER_ROUND"))
  ) throw new Error("SqueekCore configuration does not match the launch configuration");
  return { core, mining, token, nft, coreId, miningId };
}

/** Same-block snapshot of SqueekCore (Quickstart read-core logic). */
export async function readCore(client: PublicClient, block: { number: bigint; hash: Hex; timestamp: bigint }, core: Address) {
  const blockNumber = block.number;
  const read = { address: core, abi: SqueekCoreAbi, blockNumber } as const;
  const [config, state] = await Promise.all([
    client.readContract({ ...read, functionName: "configuration" }),
    client.readContract({ ...read, functionName: "state" }),
  ]);
  const units = config.blockUnitsPerBlock;
  if (state.blockHeight !== state.cumulativeBlockUnits / units || state.blockProgress !== state.cumulativeBlockUnits % units) {
    throw new Error("Inconsistent block units");
  }
  const frontier = state.settledThroughRound;
  const point = await client.readContract({ ...read, functionName: "roundPage", args: [frontier, frontier, 0n] });
  if (
    point.certifiedThroughRound !== frontier ||
    point.end.cumulativeBlockUnits !== state.cumulativeBlockUnits ||
    point.end.workPerThousandBlocks !== state.workPerThousandBlocks
  ) throw new Error("Inconsistent frontier endpoint");
  const currentRound = block.timestamp < config.genesisTimestamp
    ? 0n
    : (block.timestamp - config.genesisTimestamp) / config.roundDuration + 1n;
  // Reorg guard: re-read the block and confirm the hash is unchanged.
  const again = await client.getBlock({ blockNumber });
  if (again.hash !== block.hash) throw new Error("Block hash changed during read (reorg) — retry");
  return { currentRound, frontier, config, state };
}

/** Recursively stringify bigints for safe printing / JSON. */
export const jsonSafe = (v: unknown): unknown =>
  typeof v === "bigint" ? v.toString()
  : Array.isArray(v) ? v.map(jsonSafe)
  : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, jsonSafe(x)]))
  : v;
