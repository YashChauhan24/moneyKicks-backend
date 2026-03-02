import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "../config/database";

export interface UserAttributes {
  id: string;

  // Twitter / X identity
  twitterId?: string | null;
  twitterUsername?: string | null;
  twitterName?: string | null;
  twitterAvatar?: string | null;

  // OAuth tokens (store securely, consider encryption at-rest in production)
  twitterAccessToken?: string | null;
  twitterRefreshToken?: string | null;

  createdAt?: Date;
  updatedAt?: Date;
}

export type UserCreationAttributes = Optional<
  UserAttributes,
  | "id"
  | "twitterId"
  | "twitterUsername"
  | "twitterName"
  | "twitterAvatar"
  | "twitterAccessToken"
  | "twitterRefreshToken"
  | "createdAt"
  | "updatedAt"
>;

export class User
  extends Model<UserAttributes, UserCreationAttributes>
  implements UserAttributes
{
  public id!: string;

  public twitterId!: string | null;
  public twitterUsername!: string | null;
  public twitterName!: string | null;
  public twitterAvatar!: string | null;

  public twitterAccessToken!: string | null;
  public twitterRefreshToken!: string | null;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

User.init(
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    twitterId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    twitterUsername: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    twitterName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    twitterAvatar: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    twitterAccessToken: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    twitterRefreshToken: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: "users",
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ["twitterId"],
      },
    ],
  },
);
