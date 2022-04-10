const express = require("express");

const {
  createCardPayment,
  createPaymentIntent,
  resendPaymentOTP,
  chargeMonthlyMerchantTransactionFees,
} = require("../controllers/payment-controllers");

const router = express.Router();

router.post("/", createCardPayment);
router.post("/createPaymentIntent", createPaymentIntent);
router.post("/resendPaymentOTP", resendPaymentOTP);
router.post(
  "/chargeMonthlyMerchantTransactionFees",
  chargeMonthlyMerchantTransactionFees
);

module.exports = router;
