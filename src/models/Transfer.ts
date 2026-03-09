// src/models/Transfer.ts
import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "../config/database";

export type Currency = "USD" | "AVAX";

/**
 * Core attributes stored for each transfer.
 * NOTE: amount is stored as DECIMAL in DB and represented as string in TS.
 */
export interface TransferAttributes {
  id: string;
  fromWallet: string;
  toWallet: string;
  amount: string; // use string for DECIMAL
  currency: Currency;
  txHash?: string | null;
  network?: string | null; // e.g. "avalanche", "ethereum", etc.
  jackpotId?: string | null;
  betId?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export type TransferCreationAttributes = Optional<
  TransferAttributes,
  | "id"
  | "txHash"
  | "network"
  | "jackpotId"
  | "betId"
  | "createdAt"
  | "updatedAt"
>;

/**
 * Sequelize model representing a single wallet-to-wallet transfer.
 */
export class Transfer
  extends Model<TransferAttributes, TransferCreationAttributes>
  implements TransferAttributes
{
  public id!: string;
  public fromWallet!: string;
  public toWallet!: string;
  public amount!: string;
  public currency!: Currency;
  public txHash!: string | null;
  public network!: string | null;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Transfer.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    fromWallet: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    toWallet: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    amount: {
      type: DataTypes.DECIMAL(18, 8), // precise enough for tokens / USD
      allowNull: false,
    },
    currency: {
      type: DataTypes.ENUM("USD", "AVAX"),
      allowNull: false,
    },
    txHash: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    network: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    jackpotId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    betId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: "transfers",
    timestamps: true,
    indexes: [
      { fields: ["fromWallet"] },
      { fields: ["toWallet"] },
      { fields: ["currency"] },
      { fields: ["txHash"] },
      { fields: ["jackpotId"] },
    ],
  }
);
