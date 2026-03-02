/**
 * Utility functions for jackpot calculations
 */

/**
 * Get current AVAX to USD conversion rate
 * In production, this would fetch from a live price API (e.g., CoinGecko, CoinMarketCap, Chainlink)
 * For now, we'll use a configurable rate via environment variable or default
 */
export const getAVAXtoUSDRate = async (): Promise<number> => {
  const rateFromEnv = process.env.AVAX_USD_RATE;
  if (rateFromEnv) {
    const rate = parseFloat(rateFromEnv);
    if (!isNaN(rate) && rate > 0) {
      return rate;
    }
  }

  // TODO: In production, fetch from a real API:
  // const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=avalanche-2&vs_currencies=usd');
  // const data = await response.json();
  // return data['avalanche-2'].usd;

  // Default rate (around current AVAX price)
  return 35; // $35 per AVAX (example, should be configurable)
};

export interface PoolCalculationResponse {
  totalPoolUSD: number;
  totalParticipants: number;
  breakdown: {
    usdEntries: number;
    avaxEntries: number;
    avaxToUSD: number;
    avaxRate: number;
  };
}

/**
 * Calculate the total pool in USD for a jackpot
 * Takes into account both USD and AVAX entries
 */
export const calculateJackpotPool = async (
  usdAmount: number,
  avaxAmount: number,
  avaxRate?: number,
): Promise<PoolCalculationResponse> => {
  const rate = avaxRate || (await getAVAXtoUSDRate());
  const avaxToUSD = avaxAmount * rate;
  const totalPoolUSD = usdAmount + avaxToUSD;

  return {
    totalPoolUSD,
    totalParticipants: Math.round((usdAmount + avaxAmount * rate) / 1), // This is a simplified count
    breakdown: {
      usdEntries: usdAmount,
      avaxEntries: avaxAmount,
      avaxToUSD,
      avaxRate: rate,
    },
  };
};

export interface WinnerDistribution {
  place: 1 | 2 | 3;
  percentage: number;
  amount: number;
}

export interface PoolDistribution {
  totalPool: number;
  platformFee: number;
  platformFeePercentage: number;
  remainingAfterFee: number;
  winners: WinnerDistribution[];
}

/**
 * Calculate winner distributions based on the specified formula:
 * Platform fee: 5%
 * Prize distribution (from remaining 95%):
 * 1st: 47.5%
 * 2nd: 28.5%
 * 3rd: 19%
 */
export const calculateWinnerDistribution = (
  totalPoolUSD: number,
): PoolDistribution => {
  const platformFeePercentage = 5;
  const platformFee = (totalPoolUSD * platformFeePercentage) / 100;
  const remainingAfterFee = totalPoolUSD - platformFee;

  const prizeDistribution = [
    { place: 1 as const, percentage: 47.5 },
    { place: 2 as const, percentage: 28.5 },
    { place: 3 as const, percentage: 19 },
  ];

  const winners: WinnerDistribution[] = prizeDistribution.map((prize) => ({
    place: prize.place,
    percentage: prize.percentage,
    amount: (remainingAfterFee * prize.percentage) / 100,
  }));

  return {
    totalPool: totalPoolUSD,
    platformFee,
    platformFeePercentage,
    remainingAfterFee,
    winners,
  };
};

/**
 * Select 3 random winners from a list of participant wallet addresses
 * Returns the selected winners and their prize amounts
 */
export const selectRandomWinners = (
  walletAddresses: string[],
  poolDistribution: PoolDistribution,
): Array<{
  place: 1 | 2 | 3;
  walletAddress: string;
  prizeUSD: number;
  percentage: number;
}> => {
  if (walletAddresses.length < 3) {
    throw new Error("At least 3 participants are required to select winners");
  }

  // Create a shuffled copy
  const shuffled = [...walletAddresses].sort(() => Math.random() - 0.5);
  const winners = shuffled.slice(0, 3);

  return winners.map((walletAddress, index) => {
    const place = (index + 1) as 1 | 2 | 3;
    const distribution = poolDistribution.winners.find(
      (w) => w.place === place,
    );
    return {
      place,
      walletAddress,
      prizeUSD: distribution?.amount ?? 0,
      percentage: distribution?.percentage ?? 0,
    };
  });
};
