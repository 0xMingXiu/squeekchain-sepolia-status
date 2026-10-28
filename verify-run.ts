// Runs verify.ts and prints the verified identities (recorded with every result, per docs).
import { block, blockNumber, verifyGraph, _jsonSafe } from "./verify";
import { chainId } from "./setup";

const g = await verifyGraph();
console.log("✅ Squeekchain Sepolia deployment verified");
console.log(JSON.stringify(_jsonSafe({ chainId, blockNumber, blockHash: block.hash, abiRelease: "squeeks-sepolia-core3-mining6-001", ...g }), null, 2));
