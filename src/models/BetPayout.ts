import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "../config/database";
import { Bet } from "./Bet";
import { User } from "./User";

export type BetPayoutStatus = "pending" | "processing" | "processed";

export interface BetPayoutAttributes {
  id: string;
  betId: string;
  userId: string;
  walletAddress?: string | null;
  side: "A" | "B";
  stakedAmount: string;
  grossPayoutAmount: string;
  feeChargedAmount: string;
  netPayoutAmount: string;
  isWinner: boolean;
  status: BetPayoutStatus;
  createdAt?: Date;
  updatedAt?: Date;
}

export type BetPayoutCreationAttributes = Optional<
  BetPayoutAttributes,
  "id" | "status" | "createdAt" | "updatedAt"
>;

export class BetPayout
  extends Model<BetPayoutAttributes, BetPayoutCreationAttributes>
  implements BetPayoutAttributes
{
  public id!: string;
  public betId!: string;
  public userId!: string;
  public walletAddress!: string | null;
  public side!: "A" | "B";
  public stakedAmount!: string;
  public grossPayoutAmount!: string;
  public feeChargedAmount!: string;
  public netPayoutAmount!: string;
  public isWinner!: boolean;
  public status!: BetPayoutStatus;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

BetPayout.init(
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    betId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    walletAddress: {
      type: DataTypes.STRING(42),
      allowNull: true,
    },
    side: {
      type: DataTypes.ENUM("A", "B"),
      allowNull: false,
    },
    stakedAmount: {
      type: DataTypes.DECIMAL(18, 8),
      allowNull: false,
    },
    grossPayoutAmount: {
      type: DataTypes.DECIMAL(18, 8),
      allowNull: false,
      defaultValue: "0",
    },
    feeChargedAmount: {
      type: DataTypes.DECIMAL(18, 8),
      allowNull: false,
      defaultValue: "0",
    },
    netPayoutAmount: {
      type: DataTypes.DECIMAL(18, 8),
      allowNull: false,
      defaultValue: "0",
    },
    isWinner: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    status: {
      type: DataTypes.ENUM("pending", "processing", "processed"),
      allowNull: false,
      defaultValue: "pending",
    },
  },
  {
    sequelize,
    tableName: "bet_payouts",
    timestamps: true,
    indexes: [
      { fields: ["betId"] },
      { fields: ["userId"] },
      { fields: ["isWinner"] },
    ],
  },
);

Bet.hasMany(BetPayout, {
  foreignKey: "betId",
  as: "payouts",
});

BetPayout.belongsTo(Bet, {
  foreignKey: "betId",
  as: "bet",
});

User.hasMany(BetPayout, {
  foreignKey: "userId",
  as: "betPayouts",
});

BetPayout.belongsTo(User, {
  foreignKey: "userId",
  as: "user",
});
