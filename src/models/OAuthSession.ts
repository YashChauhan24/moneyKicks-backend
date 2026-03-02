import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "../config/database";

export interface OAuthSessionAttributes {
  id: string;
  provider: string;
  oauthToken: string;
  oauthTokenSecret: string;
  state: string;
  createdAt?: Date;
  expiresAt: Date;
}

export type OAuthSessionCreationAttributes = Optional<
  OAuthSessionAttributes,
  "id" | "createdAt"
>;

export class OAuthSession
  extends Model<OAuthSessionAttributes, OAuthSessionCreationAttributes>
  implements OAuthSessionAttributes
{
  public id!: string;
  public provider!: string;
  public oauthToken!: string;
  public oauthTokenSecret!: string;
  public state!: string;
  public expiresAt!: Date;
  public readonly createdAt!: Date;
}

OAuthSession.init(
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    provider: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    oauthToken: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
    },
    oauthTokenSecret: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    state: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: "oauth_sessions",
    timestamps: true,
    updatedAt: false,
    indexes: [
      { fields: ["provider"] },
      { fields: ["expiresAt"] },
    ],
  }
);

