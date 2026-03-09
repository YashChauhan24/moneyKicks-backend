import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "../config/database";
import { Jackpot } from "./Jackpot";

export type JackpotLogType =
  | "created"
  | "pool_calculated"
  | "distribution_calculated"
  | "winner_selected"
  | "transfer_sent"
  | "resolved"
  | "error";

export interface JackpotLogAttributes {
  id: string;
  jackpotId: string;
  type: JackpotLogType;
  message?: string;
  metadata?: object;
  createdAt?: Date;
  updatedAt?: Date;
}

export type JackpotLogCreationAttributes = Optional<
  JackpotLogAttributes,
  "id" | "message" | "metadata" | "createdAt" | "updatedAt"
>;

export class JackpotLog
  extends Model<JackpotLogAttributes, JackpotLogCreationAttributes>
  implements JackpotLogAttributes
{
  public id!: string;
  public jackpotId!: string;
  public type!: JackpotLogType;
  public message?: string;
  public metadata?: object;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

JackpotLog.init(
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },

    jackpotId: {
      type: DataTypes.UUID,
      allowNull: false,
    },

    type: {
      type: DataTypes.ENUM(
        "created",
        "pool_calculated",
        "distribution_calculated",
        "winner_selected",
        "transfer_sent",
        "resolved",
        "error",
      ),
      allowNull: false,
    },

    message: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    metadata: {
      type: DataTypes.JSON,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: "jackpot_logs",
    timestamps: true,
    indexes: [
      { fields: ["jackpotId"] },
      { fields: ["type"] },
      { fields: ["createdAt"] },
    ],
  },
);

Jackpot.hasMany(JackpotLog, {
  foreignKey: "jackpotId",
  as: "logs",
});

JackpotLog.belongsTo(Jackpot, {
  foreignKey: "jackpotId",
  as: "jackpot",
});
