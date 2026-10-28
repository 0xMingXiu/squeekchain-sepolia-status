// read-core.ts — Quickstart "Read SqueekCore state": verify first, then configuration() + state()
// + roundPage frontier check, all at ONE Ethereum block. All uint64+ kept as bigint (printed as strings).
import { block, blockNumber, client, chainId } from "./setup";
import { verifyGraph } from "./verify";
import { jsonSafe, readCore } from "./src/snapshot";

const { core, coreId } = await verifyGraph();
const { currentRound, frontier, config, state } = await readCore(client, { number: blockNumber, hash: block.hash!, timestamp: block.timestamp }, core);
console.log(JSON.stringify(jsonSafe({
  chainId, coreProxy: core, coreImplementation: coreId.implementation, coreVersion: coreId.codeVersion,
  blockNumber, blockHash: block.hash, blockTimestamp: block.timestamp,
  currentRound, frontier, settledThroughRound: state.settledThroughRound,
  height: state.blockHeight, blockProgress: state.blockProgress,
  workPerThousandBlocks: state.workPerThousandBlocks, paused: state.paused,
  state, configuration: config,
}), null, 2));
