// setup.ts — Quickstart shared setup: public client, chain-ID check, one pinned Ethereum block.
// Read-only: no wallet, no private key.
import { createPublicClient, http, type PublicClient } from "viem";
import { checkChain, required, resolveBlock } from "./src/snapshot";

export { required };
export const client = createPublicClient({ transport: http(required("RPC_URL")) }) as PublicClient;
export const chainId = await checkChain(client);
export const block = await resolveBlock(client);
export const blockNumber = block.number!;

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log({ chainId: chainId.toString(), blockNumber: blockNumber.toString(), blockHash: block.hash });
}
