import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "../config/database";

export type JackpotCurrencyMode = "USD" | "AVAX" | "BOTH";

export interface JackpotAttributes {
  id: string;
  name: string;
  startAt: Date;
  endAt: Date;
  minAmount: string;
  currency: JackpotCurrencyMode;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export type JackpotCreationAttributes = Optional<
  JackpotAttributes,
  "id" | "createdAt" | "updatedAt"
>;

export class Jackpot
  extends Model<JackpotAttributes, JackpotCreationAttributes>
  implements JackpotAttributes
{
  public id!: string;
  public name!: string;
  public startAt!: Date;
  public endAt!: Date;
  public minAmount!: string;
  public currency!: JackpotCurrencyMode;
  public isActive!: boolean;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Jackpot.init(
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    startAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    endAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    minAmount: {
      type: DataTypes.DECIMAL(18, 8),
      allowNull: false,
    },
    currency: {
      type: DataTypes.ENUM("USD", "AVAX", "BOTH"),
      allowNull: false,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    sequelize,
    tableName: "jackpots",
    timestamps: true,
    indexes: [
      { fields: ["currency"] },
      { fields: ["isActive"] },
      { fields: ["startAt", "endAt"] },
    ],
  }
);
