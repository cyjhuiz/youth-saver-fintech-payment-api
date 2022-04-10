const Transaction = require("../models/transaction");
const MerchantCharge = require("../models/merchant-charge");

const axios = require("axios");
const { sequelize } = require("../util/database");
const Sequelize = require("sequelize");

const {
  createCurrentUTCDate,
  createUTCDateForFirstDayOfThePreviousMonth,
  createUTCDateForLastDayOfThePreviousMonth,
  calculateTotalMerchantCharges,
} = require("../util/payment-util");

const HttpError = require("../models/http-error");
const { response } = require("express");
const {
  CARD_API_ENDPOINT,
  CUSTOMER_API_ENDPOINT,
  ACCOUNT_API_ENDPOINT,
  SMS_API_ENDPOINT,
  TBANK_API_ENDPOINT,
} = process.env;

const createPaymentIntent = async (req, res, next) => {
  const {
    merchantName,
    merchantTBankAccountNumber,
    merchantTBankCustomerID,
    amountTotal,
    cardFirstName,
    cardLastName,
    cardNumber,
    cardExpiry,
    cardCvcNumber,
  } = req.body;

  if (amountTotal < 0) {
    const error = new HttpError("Payment amount cannot be less than 0", 500);
    return next(error);
  }

  let userCard;
  try {
    const response = await axios.post(
      `${CARD_API_ENDPOINT}/api/card/userCard/cardDetails`,
      {
        cardFirstName,
        cardLastName,
        cardNumber,
        cardExpiry,
        cardCvcNumber,
      }
    );

    if (response.status !== 200) {
      const error = new HttpError(
        "Something went wrong, card details are invalid",
        400
      );
      return next(error);
    }
    userCard = response.data.userCard;
  } catch (err) {
    const error = new HttpError(
      "Something went wrong, could not fetch verify card details",
      500
    );
    return next(error);
  }

  let transaction;
  try {
    // get info from own API via userID (customer)
    let response = await axios.get(
      `${CUSTOMER_API_ENDPOINT}/child/credentials?customerID=${userCard.userID}`
    );

    if (response.status !== 200) {
      const error = new HttpError(
        "Something went wrong, could not process transaction.",
        500
      );
      return next(error);
    }

    const { UserID, CustomerID, Pin } = response.data.data;

    transaction = await Transaction.create({
      merchantName: merchantName,
      amountTotal: amountTotal,
      senderTBankCustomerID: CustomerID,
      senderTBankPIN: Pin,
      senderUserCardID: userCard.userCardID,
      senderTBankAccountNumber: userCard.associatedAccountID,
      receiverTBankCustomerID: merchantTBankCustomerID,
      receiverTBankAccountNumber: merchantTBankAccountNumber,
      transactionCardSchemeID: userCard.cardID,
      paymentTransactionDate: createCurrentUTCDate(),
      transactionStatus: "Pending",
    });

    await transaction.save();

    response = await axios
      .post(`${SMS_API_ENDPOINT}/otp`, {
        UserID: UserID,
        Pin: Pin,
      })
      .catch((err) => {
        const error = new HttpError(
          "Something went wrong, OTP request failed.",
          500
        );
        return next(error);
      });
  } catch (err) {
    const error = new HttpError(
      "Something went wrong, payment transaction could not be processed.",
      500
    );
    return next(error);
  }

  return res.status(200).json({
    transactionID: transaction.getDataValue("transactionID"),
    message:
      "Payment transaction currently processing, please enter OTP to complete the payment",
  });
};

const createCardPayment = async (req, res, next) => {
  const { transactionID, transactionOTP } = req.body;

  try {
    let transaction = await Transaction.findByPk(transactionID, {
      raw: true,
    });

    if (transaction.transactionStatus === "Successful") {
      const error = new HttpError(
        "Payment failed. Transaction has already been completed previously",
        400
      );
      return next(error);
    }

    let response = await axios
      .get(
        `${CUSTOMER_API_ENDPOINT}/child/credentials?customerID=${transaction.senderTBankCustomerID}`
      )
      .catch((err) => {
        const error = new HttpError(
          "Something went wrong, could not retrieve relevant details.",
          500
        );
        return next(error);
      });

    const { UserID, CustomerID, Pin } = response.data.data;

    let headerTemplateCredentials = {
      userID: UserID,
      PIN: Pin,
      OTP: transactionOTP,
    };

    response = await axios
      .post(`${CUSTOMER_API_ENDPOINT}/login`, {
        userID: UserID,
        PIN: Pin,
        OTP: transactionOTP,
      })
      .catch((err) => {
        if (err.response.status !== 200) {
          const error = new HttpError(
            "OTP is incorrect. Please try again!",
            400
          );
          return next(error);
        }
      });

    const {
      amountTotal,
      merchantName,
      senderTBankAccountNumber,
      senderTBankCustomerID,
      receiverTBankAccountNumber,
      receiverTBankCustomerID,
      senderUserCardID,
    } = transaction;

    response = await axios
      .get(`${CARD_API_ENDPOINT}/api/card/userCard/${senderUserCardID}`)
      .catch((err) => {
        const error = new HttpError(
          "Something went wrong with getting user card details",
          500
        );
        return next(error);
      });

    const { userCard } = response.data;

    if (!userCard.isActivated || amountTotal > userCard.creditLimit) {
      const error = new HttpError(
        "Card is yet to be activated or total amount exceeds the card's credit limit.",
        400
      );
      return next(error);
    }

    const transactionDateTime = new Date();
    transactionDateTime.setHours(transactionDateTime.getHours() + 8);

    const transactionDateTimeString = transactionDateTime
      .toISOString()
      .slice(0, 10);
    console.log("hi1");
    // link 1
    header = JSON.stringify({
      Header: {
        serviceName: "addBeneficiary",
        ...headerTemplateCredentials,
      },
    });

    let content = JSON.stringify({
      Content: {
        AccountID: receiverTBankAccountNumber,
        Description: merchantName,
      },
    });

    response = await axios.get(
      `${TBANK_API_ENDPOINT}?Header=${header}&Content=${content}`
    );

    if (
      response.data.Content.ServiceResponse.ServiceRespHeader.ErrorText !==
      "invocation successful"
    ) {
      const error = new HttpError("Payment failed, please try again!", 400);
      return next(error);
    }

    response = await axios
      .get(
        `${CUSTOMER_API_ENDPOINT}/child/credentials?customerID=${transaction.receiverTBankCustomerID}`
      )
      .catch((err) => {
        const error = new HttpError(
          "Something went wrong, could not retrieve relevant details.",
          500
        );
        return next(error);
      });

    const receiverUserID = response.data.data.UserID;
    const receiverPin = response.data.data.Pin;

    response = await axios
      .post(`${ACCOUNT_API_ENDPOINT}/transfer/organization`, {
        ParentUserID: headerTemplateCredentials.userID,
        ParentPin: headerTemplateCredentials.PIN,
        ParentDepositAccountID: senderTBankAccountNumber,
        ChildUserID: receiverUserID,
        ChildPin: receiverPin,
        ChildDepositAccountID: receiverTBankAccountNumber,
        ChildCustomerID: receiverTBankCustomerID,
        Amount: amountTotal.toString(),
        Description: `${merchantName} - SGD $${amountTotal} ${transactionDateTimeString}`,
      })
      .catch((err) => {
        const error = new HttpError(
          "Failed to make credit transfer to organization",
          500
        );
        return next(error);
      });

    transaction = await Transaction.findByPk(transactionID);
    transaction.setDataValue("transactionStatus", "Successful");
    await transaction.save();

    if (userCard.cardName == "YouthSaver") {
      response = await axios
        .get(
          `${ACCOUNT_API_ENDPOINT}/deduct/spendable?customerID=${senderTBankCustomerID}&amount=${amountTotal}`
        )
        .catch((err) => {
          const error = new HttpError(
            "Failed to deduct spendable balance after purchase",
            500
          );
          return next(error);
        });

      response = await axios
        .post(`${CUSTOMER_API_ENDPOINT}/child/details`, {
          userID: headerTemplateCredentials.userID,
          pin: headerTemplateCredentials.PIN,
        })
        .catch((err) => {
          const error = new HttpError(
            "Failed to get spendable balance remainder after purchase",
            500
          );
          return next(error);
        });

      const spendableBalanceToTransferToForceSavings =
        userCard.creditLimit - amountTotal;

      if (spendableBalanceToTransferToForceSavings > 0) {
        response = await axios
          .post(`${ACCOUNT_API_ENDPOINT}/transfer/forcesavings`, {
            customerID: senderTBankCustomerID,
            amount: spendableBalanceToTransferToForceSavings.toString(),
          })
          .catch((err) => {
            console.log(err.response);
            const error = new HttpError(err.response.data.message, 500);
            return next(error);
          });
        console.log(response.data);
      }

      let isActivated = false;
      // withdrawalLimit is > 0, this means that card should remain activated for withdrawal
      if (userCard.withdrawalLimit > 0) {
        isActivated = true;
      }
      response = await axios
        .put(`${CARD_API_ENDPOINT}/api/card/userCard/${userCard.userCardID}`, {
          creditLimit: 0,
          isActivated: isActivated,
        })
        .catch((err) => {
          console.log(err.response);
          const error = new HttpError(
            "Something went wrong with updating card details",
            500
          );
          return next(error);
        });
    }
  } catch (err) {
    const error = new HttpError(
      "Something went wrong, payment transaction could not be processed.",
      500
    );
    return next(error);
  }

  res.status(200).json({
    message: "Payment transaction processed successfully",
  });
};

const resendPaymentOTP = async (req, res, next) => {
  const { transactionID } = req.body;

  let transaction;
  try {
    transaction = await Transaction.findByPk(transactionID, {
      raw: true,
    });
  } catch (err) {
    const error = new HttpError(
      "Something went wrong, could not retrieve transaction details.",
      500
    );
    return next(error);
  }

  if (transaction === null) {
    const error = new HttpError("Transaction does not exist.", 404);
    return next(error);
  }

  let response = await axios
    .get(
      `${CUSTOMER_API_ENDPOINT}/child/credentials?customerID=${transaction.senderTBankCustomerID}`
    )
    .catch((err) => {
      const error = new HttpError(
        "Something went wrong, could not retrieve relevant details.",
        500
      );
      return next(error);
    });

  const { UserID, CustomerID, Pin } = response.data.data;

  response = await axios
    .post(`${SMS_API_ENDPOINT}/otp`, {
      UserID: UserID,
      Pin: Pin,
    })
    .catch((err) => {
      const error = new HttpError(
        "Something went wrong, request for OTP failed.",
        500
      );
      return next(error);
    });

  return res.status(200).json({
    transactionID: transactionID,
    message: "Resent payment OTP request",
  });
};

const chargeMonthlyMerchantTransactionFees = async (req, res, next) => {
  let groupedTransactionsForThePreviousMonth;
  try {
    let firstDayOfPreviousMonth = createUTCDateForFirstDayOfThePreviousMonth();
    let lastDayOfPreviousMonth = createUTCDateForLastDayOfThePreviousMonth();

    groupedTransactionsForThePreviousMonth = await Transaction.findAll({
      raw: true,
      nest: true,
      order: [["receiverTBankAccountNumber", "ASC"]],
      group: [
        "receiverTBankCustomerID",
        "receiverTBankAccountNumber",
        "merchantcharge.transactionCardSchemeID",
      ],
      attributes: [
        "receiverTBankCustomerID",
        "receiverTBankAccountNumber",
        "merchantName",
        [
          Sequelize.fn("sum", Sequelize.col("amountTotal")),
          "totalPaymentAmountTransactedForPreviousMonth",
        ],
        "transactionStatus",
      ],
      where: {
        paymentTransactionDate: {
          [Sequelize.Op.between]: [
            firstDayOfPreviousMonth,
            lastDayOfPreviousMonth,
          ],
        },
        transactionStatus: "Successful",
      },
      include: [
        {
          model: MerchantCharge,
          include: [],
        },
      ],
    });
  } catch (err) {
    const error = new HttpError(
      "Something went wrong, could not find transactions.",
      500
    );
    return next(error);
  }

  try {
    for (let merchantGroupedTransactionTotalDetails of groupedTransactionsForThePreviousMonth) {
      const youthSaverBankTBankAccountDetails = {
        userID: "youthsaverbank",
        accountNumber: "0000008958",
      };
      // find merchant credentials, use both YSB and merchant credentials to perform credit transfer
      const merchantTBankCustomerID =
        merchantGroupedTransactionTotalDetails.receiverTBankCustomerID;
      let response = await axios
        .get(
          `${CUSTOMER_API_ENDPOINT}/child/credentials?customerID=${merchantTBankCustomerID}`
        )
        .catch((err) => {
          const error = new HttpError(
            "Something went wrong, could not get merchant credentials.",
            500
          );
          return next(error);
        });

      // link merchant --> YouthSaverBank
      const { UserID, Pin } = response.data.data;
      let headerCredentialsTemplate = {
        userID: UserID,
        PIN: Pin,
        OTP: "999999",
      };

      let header = JSON.stringify({
        Header: {
          serviceName: "addBeneficiary",
          ...headerCredentialsTemplate,
        },
      });

      let content = JSON.stringify({
        Content: {
          AccountID: youthSaverBankTBankAccountDetails.accountNumber,
          Description: "YouthSaver Bank",
        },
      });

      response = await axios.get(
        `${TBANK_API_ENDPOINT}?Header=${header}&Content=${content}`
      );

      if (
        response.data.Content.ServiceResponse.ServiceRespHeader.ErrorText !==
        "invocation successful"
      ) {
        const error = new HttpError(
          "Failed to link merchant to bank failed, please try again!",
          400
        );
        return next(error);
      }

      header = JSON.stringify({
        Header: {
          serviceName: "creditTransfer",
          ...headerCredentialsTemplate,
        },
      });

      let yearMonth = createUTCDateForFirstDayOfThePreviousMonth()
        .toISOString()
        .split("-");
      yearMonth = yearMonth[0] + "-" + yearMonth[1];
      // ignore this const inialization block, its for data transformation, different variable naming for readability
      // refer to the block after this instead
      const {
        merchantName,
        merchantTBankAccountNumber,
        totalMerchantCharges,
        transactionCardSchemeID,
      } = {
        merchantName: merchantGroupedTransactionTotalDetails.merchantName,
        merchantTBankAccountNumber:
          merchantGroupedTransactionTotalDetails.receiverTBankAccountNumber,
        totalMerchantCharges: calculateTotalMerchantCharges(
          merchantGroupedTransactionTotalDetails.totalPaymentAmountTransactedForPreviousMonth,
          merchantGroupedTransactionTotalDetails.merchantcharge.chargeRate
        ),
        transactionCardSchemeID:
          merchantGroupedTransactionTotalDetails.merchantcharge
            .transactionCardSchemeID,
      };

      content = JSON.stringify({
        Content: {
          accountFrom: merchantTBankAccountNumber,
          accountTo: youthSaverBankTBankAccountDetails.accountNumber,
          transactionAmount: totalMerchantCharges,
          transactionReferenceNumber: "Payment Transaction",
          narrative: `YSB Mercht Fees - ${merchantName} ${yearMonth} - Scheme ${transactionCardSchemeID}`,
        },
      });

      response = await axios.get(
        `${TBANK_API_ENDPOINT}?Header=${header}&Content=${content}`
      );

      if (
        response.data.Content.ServiceResponse.ServiceRespHeader.ErrorText !==
        "invocation successful"
      ) {
        console.log("this is an error");
        const error = new HttpError(
          "Credit transfer failed, please try again!",
          400
        );
        return next(error);
      }
    }
  } catch (err) {
    const error = new HttpError(
      "Merchant charges failed, please try again!",
      500
    );
    return next(error);
  }

  return res.status(200).json({
    message: "Success",
  });
};

exports.createPaymentIntent = createPaymentIntent;
exports.createCardPayment = createCardPayment;
exports.resendPaymentOTP = resendPaymentOTP;
exports.chargeMonthlyMerchantTransactionFees =
  chargeMonthlyMerchantTransactionFees;
