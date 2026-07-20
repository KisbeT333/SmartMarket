const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const passport = require("passport");
const session = require("express-session");
const cron = require("node-cron");
dotenv.config();

const app = express();
require("./config/passport");

// Đặt SAU dotenv.config() vì invoiceGenerator require("../db"),
// mà db.js đọc process.env.DB_PASSWORD... ngay lúc load module (không lazy) —
// nếu require trước dotenv.config(), Pool sẽ được tạo với toàn bộ biến undefined.
const { runBillingCycle } = require('./services/Invoicegenerator');

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


const path = require("path");
app.use("/uploads", express.static(path.join(__dirname, "uploads")));



app.use(
  session({
    secret: process.env.SESSION_SECRET || "smartmarket",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production", 
      maxAge: 24 * 60 * 60 * 1000 
    }
  })
);



app.use(passport.initialize());
app.use(passport.session());

const productRoutes = require("./routes/productRoutes");
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const traderMeRoutes = require("./routes/traderMeRoutes");
const traderRoutes = require("./routes/traderRoutes");
const contractRoutes = require("./routes/contractRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const marketRoutes = require("./routes/marketRoutes");
const zoneRoutes =require("./routes/zoneRoutes");
const stallRoutes =require("./routes/stallRoutes");
const cartRoutes = require("./routes/cartRoutes");
const orderRoutes = require("./routes/orderRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const invoiceRoutes =require("./routes/invoiceRoutes");
const reportRoutes =require("./routes/reportRoutes");
const exportRoutes =require("./routes/exportRoutes");
const stallRequestRoutes = require("./routes/stallRequestRoutes");
app.use("/api/stall-requests", stallRequestRoutes);
const managerRouter = require("./routes/managerRouter");
app.use("/api/manager", managerRouter);
const renewalRequestRoutes = require("./routes/renewalRequestRoutes");
app.use("/api/renewal-requests", renewalRequestRoutes);
const traderPaymentRoutes = require("./routes/traderPaymentRoutes");
app.use("/api/trader/me", traderPaymentRoutes);
app.use("/api/stall-feedback", require("./routes/stallFeedbackRoutes"));
app.use(
    "/api/invoices",
    invoiceRoutes
);

// EXPORT
app.use(
    "/api/export",
    exportRoutes
);


// REPORTS
app.use(
    "/api/reports",
    reportRoutes
);
app.use(
    "/api/payments",
    paymentRoutes
);

app.use(
    "/api/orders",
    orderRoutes
);
app.use("/api/cart",cartRoutes);
app.use("/api/stalls",stallRoutes);
app.use("/api/zones",zoneRoutes);
app.use("/api/markets",marketRoutes);
app.use("/api/dashboard",dashboardRoutes);
app.use("/api/contracts",contractRoutes);
app.use("/api", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/trader/me", traderMeRoutes);   
app.use("/api/trader", traderRoutes);
app.use("/api/products", productRoutes);


app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    app: "Smart Market",
    version: "1.0.0",
    message: "Smart Market API running..."
  });
});


app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "API không tồn tại"
  });
});


app.use((err, req, res, next) => {
  console.error(err.stack); 
  res.status(500).json({
    success: false,
    message: "Lỗi server",
    error:
      process.env.NODE_ENV === "development"
        ? err.message
        : "Internal Server Error"
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`
URL: http://127.0.0.1:${PORT}
MODE: ${process.env.NODE_ENV || "development"}
`);

  // ═════════════════════════════════════════════════════════════
  // BILLING TỰ ĐỘNG — hợp đồng thuê sạp thanh toán theo kỳ
  // ═════════════════════════════════════════════════════════════
  // Chạy ngay lúc khởi động: phòng trường hợp server tắt qua nhiều ngày,
  // vẫn tạo bù các hóa đơn/kỳ đã tới hạn ngay khi bật lại.
  runBillingCycle().catch((err) =>
    console.error("[billing] Lỗi khi chạy billing lúc khởi động:", err)
  );

  // Chạy định kỳ mỗi ngày lúc 00:10 (giờ server): tạo hóa đơn cho các kỳ
  // vừa tới hạn + đánh dấu OVERDUE cho hóa đơn UNPAID đã quá hạn thanh toán.
  cron.schedule("10 0 * * *", () => {
    runBillingCycle().catch((err) =>
      console.error("[billing] Lỗi khi chạy cron billing:", err)
    );
  });
});