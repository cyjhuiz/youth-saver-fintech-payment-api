const express = require("express");

const path = require("path");

const dotenv = require("dotenv");
dotenv.config();

const { sequelize } = require("./util/database");
const {
  createTransactionAssociations,
} = require("./models/model-associations");
const { errorHandler } = require("./middleware/error-handler");

const paymentRoutes = require("./routes/payment-routes");

const app = express();

app.use(express.json());
// app.use(express.static(path.join("public")));

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization"
  );
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE");

  next();
});

// app.use((req, res, next) => {
//   res.sendFile(path.resolve(__dirname, "public", "index.html"));
// });

app.use("/api/payment", paymentRoutes);

// app.use(errorHandler);

app.use((error, req, res, next) => {
  if (req.file) {
    fs.unlink(req.file.path, (err) => {
      console.log(err);
    });
  }
  if (res.headerSent) {
    return next(error);
  }
  res.status(error.code || 500);
  res.json({ message: error.message || "An unknown error occurred!" });
});

sequelize
  .sync()
  .then((result) => {
    console.log(result);
    createTransactionAssociations();
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
      console.log(`Server is running on ${PORT}`);
    });
  })
  .catch((err) => {
    console.log(err);
  });
