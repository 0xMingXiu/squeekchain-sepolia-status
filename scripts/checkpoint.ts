import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

const MINING = "0x3beE588fC20dE788Bac17d33b41Da7346cb27EC4" as const;
const EXPECTED = "0x9a35216211e70b9e786fa5d5c5e4e526d1267897".toLowerCase();
const ABI = [{ type: "function", name: "checkpoint", inputs: [], outputs: [], stateMutability: "nonpayable" }] as const;

let pk = process.env.PRIVATE_KEY?.trim();
if (!pk) throw new Error("PRIVATE_KEY required");
if (!pk.startsWith("0x")) pk = "0x" + pk;
const account = privateKeyToAccount(pk as `0x${string}`);
if (account.address.toLowerCase() !== EXPECTED) {
  throw new Error(`address mismatch ${account.address}`);
}
const transport = http(process.env.RPC_URL || "https://sepolia.gateway.tenderly.co");
const publicClient = createPublicClient({ chain: sepolia, transport });
const walletClient = createWalletClient({ account, chain: sepolia, transport });
const hash = await walletClient.writeContract({ address: MINING, abi: ABI, functionName: "checkpoint", account });
console.log("tx", hash);
const receipt = await publicClient.waitForTransactionReceipt({ hash });
console.log("status", receipt.status, "block", receipt.blockNumber.toString());
