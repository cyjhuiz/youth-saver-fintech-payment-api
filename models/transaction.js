const { INTEGER, STRING, FLOAT, DATE } = require("sequelize");

const { sequelize } = require("../util/database");

const sequelizeConfig = { timestamps: false };

const Transaction = sequelize.define(
  "transaction",
  {
    transactionID: {
      type: INTEGER,
      autoIncrement: true,
      allowNull: false,
      primaryKey: true,
    },
    merchantName: {
      type: STRING,
      autoIncrement: false,
      allowNull: false,
      primaryKey: false,
    },
    amountTotal: {
      type: FLOAT,
      allowNull: false,
    },
    senderTBankCustomerID: {
      type: STRING,
      allowNull: false,
    },
    senderUserCardID: {
      type: INTEGER,
      allowNull: false,
    },
    senderTBankAccountNumber: {
      type: STRING,
      allowNull: false,
    },
    receiverTBankCustomerID: {
      type: STRING,
      allowNull: false,
    },
    receiverTBankAccountNumber: {
      type: STRING,
      allowNull: false,
    },
    transactionCardSchemeID: {
      type: INTEGER,
      allowNull: false,
    },
    paymentTransactionDate: {
      type: DATE,
      allowNull: false,
    },
    transactionStatus: {
      type: STRING,
      allowNull: false,
    },
  },
  sequelizeConfig
);

module.exports = Transaction;
