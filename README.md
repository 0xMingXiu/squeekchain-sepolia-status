# Squeekchain Sepolia Quickstart + Status Board

只读（read-only）示例：按官方 Quickstart 校验 Squeekchain Sepolia 部署并读取 SqueekCore，外加一个极简状态面板。
Read-only demo following the official Quickstart (https://docs.squeekchain.com/developers/quickstart/), plus a minimal status board. No wallet, no private keys.

## 1. 安装 Install
```bash
npm install
```

## 2. 设置 RPC_URL / Set RPC_URL
`sepolia-env.sh` 中的 `EXPECTED_*` 值逐字复制自官方 Developers 页面，并与 `sepolia.json` 核对一致。
The `EXPECTED_*` values in `sepolia-env.sh` are copied verbatim from the Developers page and match `sepolia.json`.

- 默认 RPC / default: `https://sepolia.gateway.tenderly.co`（免费、支持历史状态 / free, serves historical state）
- 换成你自己的 / use your own (must serve historical state):
  ```bash
  export RPC_URL=https://your-sepolia-endpoint
  export ETHEREUM_BLOCK=12014176   # 可选：固定区块；默认取最新 finalized 区块 / optional; default = latest finalized
  ```
- 所有 npm 脚本都会通过 `./env.sh` 加载 `sepolia-env.sh`（再加载 `sepolia-env.local.sh`，如果有的话）。
  All npm scripts load the env via `./env.sh`.

## 3. 校验部署 Verify
```bash
npm run verify          # 官方记录 + 本地 reporter 覆盖 / official record + local reporter override
npm run verify:strict   # 只用官方记录 / official record only (currently FAILS, see below)
```

## 4. 读取 Core / Read core
```bash
npm run read-core
npm run read-core:strict
ETHEREUM_BLOCK=11971683 npm run read-core:strict   # 轮换前的区块，严格校验通过 / pre-rotation block, strict passes
```
输出：区块号与哈希、当前轮次、已结算 frontier、区块高度、完整 state()（bigint 一律输出为字符串）。
Prints block number/hash, wall-clock round, certified frontier, Squeek block height and the full state() (bigints as strings).

## 5. 状态面板 Dashboard
```bash
npm run dashboard        # PORT=8787 by default
# 打开 / open  http://localhost:8787
```
后端每次（缓存 12 秒）都会：检查 chainId → 固定一个 finalized 区块 → 完整校验部署 → 在同一区块读取 configuration/state/roundPage → 重新读取区块哈希防止重组。校验失败时面板只显示错误，不显示状态。
Each refresh: chain check → pin one finalized block → full verify → same-block reads → reorg re-check. If verify fails, the board shows the error and no state.

## ⚠️ Reporter 轮换 / Reporter rotation (docs are stale)
官方记录的 Reporter 是 `0xA663…5A75`，但链上已于 2026-10-23 03:40 JST（区块 11971684，tx `0x0a0712bb…004e`）由 Guardian 在暂停期间轮换为 `0xB317AB7Cc24fD5d94EA120B3b189bc6527a7d0Aa`，下一区块解除暂停。
The docs list Reporter `0xA663…5A75`; onchain it was rotated to `0xB317…d0Aa` at block 11971684.
按文档规则（不匹配就停止），严格模式在此之后会失败。`sepolia-env.local.sh` 是一个**本地、非官方**的覆盖文件，附有链上证据；删除它或使用 `SQUEEK_STRICT=1` 即恢复严格模式。面板会显示黄色警告条。
Per the docs rule (stop on any mismatch), strict mode fails after that block. `sepolia-env.local.sh` is a **local, unofficial** override with the onchain evidence. Delete it, or set `SQUEEK_STRICT=1`, to go back to strict mode. The board shows a warning banner while the override is in use.

## 文件 Files
- `setup.ts`, `verify.ts`, `read-core.ts`: Quickstart files. Shared logic is in `src/snapshot.ts`.
- `verify-run.ts`: runs verification and prints the verified identities
- `abi/*.json`: official ABIs. `src/abis.ts` is generated from them (`npm run gen:abi`).
- `sepolia.json`: official deployment record. `docs/`: snapshots of the doc pages.
- `dashboard/server.ts`, `dashboard/index.html`: the status board
