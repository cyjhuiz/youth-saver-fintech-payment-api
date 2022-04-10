const { sequelize } = require("../util/database");
const Transaction = require("./transaction");
const MerchantCharge = require("./merchant-charge");

const createTransactionAssociations = () => {
  Transaction.belongsTo(MerchantCharge, {
    foreignKey: "transactionCardSchemeID",
  });
  MerchantCharge.hasMany(Transaction, {
    as: "transaction",
    foreignKey: "transactionCardSchemeID",
  });
  sequelize.sync({ alter: true });
};

exports.createTransactionAssociations = createTransactionAssociations;
