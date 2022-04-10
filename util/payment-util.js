const createCurrentUTCDate = () => {
  var date = new Date();
  var nowUTC = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds()
  );

  return new Date(nowUTC);
};

const createUTCDateForFirstDayOfThePreviousMonth = () => {
  var date = new Date();
  var nowUTC = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1);

  return new Date(nowUTC);
};

const createUTCDateForLastDayOfThePreviousMonth = () => {
  var date = new Date();
  var nowUTC = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 0);

  return new Date(nowUTC);
};

const calculateTotalMerchantCharges = (amountTotal, chargeRate) => {
  return amountTotal * chargeRate;
};

exports.createCurrentUTCDate = createCurrentUTCDate;
exports.createUTCDateForFirstDayOfThePreviousMonth =
  createUTCDateForFirstDayOfThePreviousMonth;
exports.createUTCDateForLastDayOfThePreviousMonth =
  createUTCDateForLastDayOfThePreviousMonth;
exports.calculateTotalMerchantCharges = calculateTotalMerchantCharges;
