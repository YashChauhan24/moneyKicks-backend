import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "../config/database";
import { Bet } from "./Bet";
import { User } from "./User";

export type BetSide = "A" | "B";

export interface BetPredictionAttributes {
  id: string;
  betId: string;
  userId: string;
  side: BetSide;
  amount: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export type BetPredictionCreationAttributes = Optional<
  BetPredictionAttributes,
  "id" | "createdAt" | "updatedAt"
>;

export class BetPrediction
  extends Model<BetPredictionAttributes, BetPredictionCreationAttributes>
  implements BetPredictionAttributes
{
  public id!: string;
  public betId!: string;
  public userId!: string;
  public side!: BetSide;
  public amount!: string;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

BetPrediction.init(
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
    side: {
      type: DataTypes.ENUM("A", "B"),
      allowNull: false,
    },
    amount: {
      type: DataTypes.DECIMAL(18, 8),
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: "bet_predictions",
    timestamps: true,
    indexes: [
      { fields: ["betId"] },
      { fields: ["userId"] },
      { fields: ["side"] },
    ],
  }
);

Bet.hasMany(BetPrediction, {
  foreignKey: "betId",
  as: "predictions",
});

BetPrediction.belongsTo(Bet, {
  foreignKey: "betId",
  as: "bet",
});

User.hasMany(BetPrediction, {
  foreignKey: "userId",
  as: "betPredictions",
});

BetPrediction.belongsTo(User, {
  foreignKey: "userId",
  as: "user",
});

