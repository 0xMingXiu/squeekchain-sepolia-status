// verify.ts — Quickstart "Verify the deployment": EIP-1967 slots, runtime hash, layout digest,
// implementation version, timelock ownership, graph links and launch configuration. Stops on any mismatch.
import { block, blockNumber, client } from "./setup";
import { verifyGraph as verifyGraphAt, jsonSafe } from "./src/snapshot";

export const verifyGraph = () => verifyGraphAt(client, blockNumber);
export { block, blockNumber };
export const _jsonSafe = jsonSafe;
