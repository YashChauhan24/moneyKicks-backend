import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "../config/database";
import { User } from "./User";
import { Bet } from "./Bet";

export type BetInviteStatus = "PENDING" | "ACCEPTED" | "DECLINED" | "EXPIRED";

export interface BetInviteAttributes {
  id: string;
  betId?: string | null;
  inviterUserId: string;
  inviteeTwitterUsername: string;
  message?: string | null;
  status: BetInviteStatus;
  createdAt?: Date;
  updatedAt?: Date;
}

export type BetInviteCreationAttributes = Optional<
  BetInviteAttributes,
  "id" | "betId" | "status" | "createdAt" | "updatedAt"
>;

export class BetInvite
  extends Model<BetInviteAttributes, BetInviteCreationAttributes>
  implements BetInviteAttributes
{
  public id!: string;
  public betId!: string | null;
  public inviterUserId!: string;
  public inviteeTwitterUsername!: string;
  public message!: string | null;
  public status!: BetInviteStatus;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

BetInvite.init(
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    betId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    inviterUserId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    inviteeTwitterUsername: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM("PENDING", "ACCEPTED", "DECLINED", "EXPIRED"),
      allowNull: false,
      defaultValue: "PENDING",
    },
  },
  {
    sequelize,
    tableName: "bet_invites",
    timestamps: true,
    indexes: [
      { fields: ["betId"] },
      { fields: ["inviterUserId"] },
      { fields: ["inviteeTwitterUsername"] },
      { fields: ["status"] },
    ],
  }
);

User.hasMany(BetInvite, {
  foreignKey: "inviterUserId",
  as: "sentBetInvites",
});

BetInvite.belongsTo(User, {
  foreignKey: "inviterUserId",
  as: "inviter",
});

Bet.hasMany(BetInvite, {
  foreignKey: "betId",
  as: "invites",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});

BetInvite.belongsTo(Bet, {
  foreignKey: "betId",
  as: "bet",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});
