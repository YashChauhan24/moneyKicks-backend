import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "../config/database";
import { Jackpot } from "./Jackpot";
import { Transfer } from "./Transfer";

export interface JackpotEntryAttributes {
  id: string;
  jackpotId: string;
  walletAddress: string;
  transferId: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export type JackpotEntryCreationAttributes = Optional<
  JackpotEntryAttributes,
  "id" | "createdAt" | "updatedAt"
>;

export class JackpotEntry
  extends Model<JackpotEntryAttributes, JackpotEntryCreationAttributes>
  implements JackpotEntryAttributes
{
  public id!: string;
  public jackpotId!: string;
  public walletAddress!: string;
  public transferId!: string;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

JackpotEntry.init(
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
    walletAddress: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    transferId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: "jackpot_entries",
    timestamps: true,
    indexes: [
      { unique: true, fields: ["jackpotId", "walletAddress"] },
      { fields: ["walletAddress"] },
      { fields: ["jackpotId"] },
    ],
  }
);

// Define associations (optional at runtime, but useful)
Jackpot.hasMany(JackpotEntry, {
  foreignKey: "jackpotId",
  as: "entries",
});

JackpotEntry.belongsTo(Jackpot, {
  foreignKey: "jackpotId",
  as: "jackpot",
});

Transfer.hasMany(JackpotEntry, {
  foreignKey: "transferId",
  as: "jackpotEntries",
});

JackpotEntry.belongsTo(Transfer, {
  foreignKey: "transferId",
  as: "transfer",
});

