import dotenv from "dotenv";
import type { Address, Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const wagmiCore = require("@wagmi/core");
const wagmiActions = require("@wagmi/core/actions");
const wagmiChains = require("@wagmi/core/chains");

dotenv.config();

const rpcUrl =
  process.env.RPC_URL || "https://api.avax-test.network/ext/bc/C/rpc";

const inferChainIdFromRpcUrl = (url: string): number => {
  const normalized = url.toLowerCase();
  if (
    normalized.includes("api.avax-test.network") ||
    normalized.includes("fuji")
  ) {
    return wagmiChains.avalancheFuji.id;
  }

  if (normalized.includes("api.avax.network")) {
    return wagmiChains.avalanche.id;
  }

  return wagmiChains.avalancheFuji.id;
};

const inferredChainId = inferChainIdFromRpcUrl(rpcUrl);
const envChainId = process.env.CHAIN_ID?.trim();
const parsedEnvChainId = envChainId ? Number(envChainId) : undefined;
const configuredChainId =
  parsedEnvChainId === wagmiChains.avalanche.id ||
  parsedEnvChainId === wagmiChains.avalancheFuji.id
    ? parsedEnvChainId
    : inferredChainId;

if (envChainId && configuredChainId !== parsedEnvChainId) {
  console.warn(
    `WARNING: Unsupported CHAIN_ID="${envChainId}". Falling back to inferred chainId=${inferredChainId} from RPC_URL.`,
  );
}
const selectedChain =
  configuredChainId === wagmiChains.avalanche.id
    ? wagmiChains.avalanche
    : wagmiChains.avalancheFuji;

const privateKey = process.env.PRIVATE_KEY as Hex | undefined;
const fallbackPrivateKey =
  "0x0000000000000000000000000000000000000000000000000000000000000001" as const;

if (!privateKey) {
  console.warn("WARNING: PRIVATE_KEY is missing in backend .env");
}

export const walletAccount = privateKeyToAccount(
  privateKey || fallbackPrivateKey,
);
export const walletAddress = walletAccount.address;
export const walletChainId = selectedChain.id;

export const wagmiConfig = wagmiCore.createConfig({
  chains: [selectedChain],
  transports: {
    [selectedChain.id]: wagmiCore.http(rpcUrl),
  },
});

let rpcChainValidationPromise: Promise<void> | null = null;

const ensureRpcChainMatchesConfig = async (): Promise<void> => {
  if (!rpcChainValidationPromise) {
    rpcChainValidationPromise = (async () => {
      const rpcChainId = await wagmiActions.getChainId(wagmiConfig, {
        chainId: walletChainId,
      });

      if (rpcChainId !== walletChainId) {
        throw new Error(
          `[Web3] RPC/CHAIN_ID mismatch: configured chainId=${walletChainId}, RPC reports chainId=${rpcChainId}. RPC_URL=${rpcUrl}. Set CHAIN_ID to match RPC_URL.`,
        );
      }
    })().catch((error: unknown) => {
      rpcChainValidationPromise = null;
      throw error;
    });
  }

  return rpcChainValidationPromise;
};

export const getWalletBalanceWei = async (): Promise<bigint> => {
  await ensureRpcChainMatchesConfig();

  const balance = await wagmiActions.getBalance(wagmiConfig, {
    address: walletAddress,
    chainId: walletChainId,
  });
  return balance.value;
};

export const getEstimatedGasPriceWei = async (): Promise<bigint | null> => {
  await ensureRpcChainMatchesConfig();

  const feeData = await wagmiActions.estimateFeesPerGas(wagmiConfig, {
    chainId: walletChainId,
  });

  return feeData.gasPrice ?? feeData.maxFeePerGas ?? null;
};

export const sendWalletTransaction = async (params: {
  to: Address;
  value: bigint;
}): Promise<Hex> => {
  await ensureRpcChainMatchesConfig();

  return wagmiActions.sendTransaction(wagmiConfig, {
    account: walletAccount,
    chainId: walletChainId,
    to: params.to,
    value: params.value,
  });
};

export const waitForWalletTransactionReceipt = async (hash: Hex) => {
  await ensureRpcChainMatchesConfig();

  return wagmiActions.waitForTransactionReceipt(wagmiConfig, {
    chainId: walletChainId,
    hash,
  });
};
