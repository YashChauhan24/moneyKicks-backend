import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "../config/database";
import { User } from "./User";

export type BetStatus = "pending" | "live" | "closed" | "settled";

export interface BetAttributes {
  id: string;
  title: string;
  description: string;
  competitorAName: string;
  competitorBName: string;
  endCondition: string;
  stakeAmount: string;
  currency: string;
  status: BetStatus;
  startAt: Date;
  endAt: Date;
  createdByUserId: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export type BetCreationAttributes = Optional<
  BetAttributes,
  "id" | "status" | "startAt" | "createdAt" | "updatedAt"
>;

export class Bet
  extends Model<BetAttributes, BetCreationAttributes>
  implements BetAttributes
{
  public id!: string;
  public title!: string;
  public description!: string;
  public competitorAName!: string;
  public competitorBName!: string;
  public endCondition!: string;
  public stakeAmount!: string;
  public currency!: string;
  public status!: BetStatus;
  public startAt!: Date;
  public endAt!: Date;
  public createdByUserId!: string;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Bet.init(
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    competitorAName: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    competitorBName: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    endCondition: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    stakeAmount: {
      type: DataTypes.DECIMAL(18, 8),
      allowNull: false,
    },
    currency: {
      type: DataTypes.STRING(16),
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM("pending", "live", "settled", "closed"),
      allowNull: false,
      defaultValue: "live",
    },
    startAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    endAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    createdByUserId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: "bets",
    timestamps: true,
    indexes: [
      { fields: ["status"] },
      { fields: ["startAt"] },
      { fields: ["endAt"] },
      { fields: ["createdByUserId"] },
    ],
  },
);

User.hasMany(Bet, {
  foreignKey: "createdByUserId",
  as: "createdBets",
});

Bet.belongsTo(User, {
  foreignKey: "createdByUserId",
  as: "creator",
});
