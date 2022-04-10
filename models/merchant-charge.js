const { INTEGER, STRING, FLOAT, DATE } = require("sequelize");

const { sequelize } = require("../util/database");

const sequelizeConfig = { timestamps: false };

const MerchantCharge = sequelize.define(
  "merchantcharges",
  {
    transactionCardSchemeID: {
      type: INTEGER,
      autoIncrement: true,
      allowNull: false,
      primaryKey: true,
    },
    chargeRate: {
      type: FLOAT,
      autoIncrement: false,
      allowNull: false,
      primaryKey: false,
    },
  },
  sequelizeConfig
);

module.exports = MerchantCharge;
