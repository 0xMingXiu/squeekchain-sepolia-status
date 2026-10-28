// Minimal read-only status board. Each /api/status call: chain check -> pin ONE finalized block ->
// verifyGraph (strict per Quickstart) -> SqueekCore configuration/state/roundPage at that block -> reorg re-check.
// bigint values are serialised as strings. No wallet, no keys.
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { createPublicClient, http, type PublicClient } from "viem";
import { checkChain, jsonSafe, readCore, required, resolveBlock, verifyGraph } from "../src/snapshot";
import { SqueekTokenAbi } from "../src/abis";

const client = createPublicClient({ transport: http(required("RPC_URL")) }) as PublicClient;
const PORT = Number(process.env.PORT ?? 8787);
const HTML = new URL("./index.html", import.meta.url);
let cache: { at: number; body: string } | undefined;

async function snapshot() {
  const chainId = await checkChain(client);
  const block = await resolveBlock(client);
  const blockNumber = block.number!;
  const base = {
    chainId, blockNumber, blockHash: block.hash, blockTimestamp: block.timestamp,
    rpc: new URL(required("RPC_URL")).host,
    reporterOverride: process.env.DOCS_EXPECTED_REPORTER && process.env.DOCS_EXPECTED_REPORTER.toLowerCase() !== required("EXPECTED_REPORTER").toLowerCase()
      ? { docs: process.env.DOCS_EXPECTED_REPORTER, used: required("EXPECTED_REPORTER") } : null,
  };
  let graph;
  try { graph = await verifyGraph(client, blockNumber); }
  catch (e) { return { ok: false, verified: false, error: (e as Error).message, ...base }; }
  const core = await readCore(client, { number: blockNumber, hash: block.hash!, timestamp: block.timestamp }, graph.core);
  const sqkSupply = await client.readContract({ address: graph.token, abi: SqueekTokenAbi, functionName: "totalSupply", blockNumber });
  return {
    ok: true, verified: true, ...base,
    contracts: { core: graph.core, mining: graph.mining, token: graph.token, nft: graph.nft,
      coreImplementation: graph.coreId.implementation, coreVersion: graph.coreId.codeVersion, miningVersion: graph.miningId.codeVersion },
    currentRound: core.currentRound, frontier: core.frontier, lagRounds: core.currentRound - core.frontier,
    state: core.state, configuration: core.config, sqkTotalSupplyWei: sqkSupply,
  };
}

createServer(async (req, res) => {
  if (req.url?.startsWith("/api/status")) {
    try {
      if (!cache || Date.now() - cache.at > 12_000) cache = { at: Date.now(), body: JSON.stringify(jsonSafe(await snapshot())) };
      res.writeHead(200, { "content-type": "application/json" }).end(cache.body);
    } catch (e) {
      res.writeHead(502, { "content-type": "application/json" }).end(JSON.stringify({ ok: false, error: (e as Error).message }));
    }
    return;
  }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(readFileSync(HTML));
}).listen(PORT, () => console.log(`Squeekchain status board: http://localhost:${PORT}`));
