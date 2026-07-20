const express = require("express");
const router = express.Router();
const pool = require("../db");

const verifyToken = require("../middleware/verifyToken");
const authorize = require("../middleware/authorize");

// Mọi route trong file này yêu cầu đăng nhập + role TRADER
router.use(verifyToken, authorize("TRADER"));

// ────────────────────────────────────────────
// Helper: lấy trader từ user_id đang đăng nhập
// ────────────────────────────────────────────
async function getTraderByUserId(userId) {
    const result = await pool.query(
        "SELECT * FROM traders WHERE user_id = $1",
        [userId]
    );
    return result.rows[0] || null;
}


// ════════════════════════════════════════════
// GET /api/trader/me/invoices
// Danh sách hóa đơn thuê sạp của tiểu thương đang đăng nhập
// Query param tùy chọn: ?status=UNPAID|PAID
// ════════════════════════════════════════════
router.get("/invoices", async (req, res) => {

    try {

        const trader = await getTraderByUserId(req.user.id);

        if (!trader) {
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy hồ sơ tiểu thương"
            });
        }

        const { status } = req.query;

        const result = await pool.query(
            `
            SELECT
                f.id,
                f.total_amount,
                f.status,
                f.created_at,
                f.period AS contract_period,
                f.due_date,
                f.note,

                c.id           AS contract_id,
                c.start_date,
                c.end_date,
                c.monthly_rent,

                s.code         AS stall_code,
                m.name         AS market_name

            FROM fee_invoices f

            JOIN contracts c
                ON f.contract_id = c.id

            JOIN stalls s
                ON c.stall_id = s.id

            JOIN markets m
                ON s.market_id = m.id

            WHERE c.trader_id = $1
            ${status ? "AND f.status = $2" : ""}

            ORDER BY f.id DESC
            `,
            status ? [trader.id, status] : [trader.id]
        );

        res.json({
            success: true,
            data: result.rows
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: error.message
        });

    }

});


// ════════════════════════════════════════════
// GET /api/trader/me/invoices/:id
// Chi tiết một hóa đơn (kèm lịch sử thanh toán)
// ════════════════════════════════════════════
router.get("/invoices/:id", async (req, res) => {

    try {

        const trader = await getTraderByUserId(req.user.id);

        if (!trader) {
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy hồ sơ tiểu thương"
            });
        }

        // Lấy hóa đơn, đảm bảo nó thuộc về trader đang đăng nhập
        const invoiceResult = await pool.query(
            `
            SELECT
                f.id,
                f.total_amount,
                f.status,
                f.created_at,
                f.period AS contract_period,
                f.due_date,
                f.note,

                c.id           AS contract_id,
                c.start_date,
                c.end_date,
                c.monthly_rent,

                s.code         AS stall_code,
                m.name         AS market_name

            FROM fee_invoices f

            JOIN contracts c
                ON f.contract_id = c.id

            JOIN stalls s
                ON c.stall_id = s.id

            JOIN markets m
                ON s.market_id = m.id

            WHERE f.id = $1
              AND c.trader_id = $2
            `,
            [req.params.id, trader.id]
        );

        if (invoiceResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy hóa đơn hoặc bạn không có quyền xem"
            });
        }

        // Lịch sử các lần thanh toán cho hóa đơn này
        const paymentsResult = await pool.query(
            `
            SELECT
                id,
                amount,
                method,
                payment_date
            FROM payments
            WHERE invoice_id = $1
            ORDER BY id DESC
            `,
            [req.params.id]
        );

        res.json({
            success: true,
            data: {
                invoice: invoiceResult.rows[0],
                payments: paymentsResult.rows
            }
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: error.message
        });

    }

});


// ════════════════════════════════════════════
// POST /api/trader/me/invoices/:id/pay
// Tiểu thương thanh toán một hóa đơn chưa thanh toán
// Body: { method: "CASH" | "BANK_TRANSFER" | "MOMO" | ... }
// ════════════════════════════════════════════
router.post("/invoices/:id/pay", async (req, res) => {

    const client = await pool.connect();

    try {

        const trader = await getTraderByUserId(req.user.id);

        if (!trader) {
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy hồ sơ tiểu thương"
            });
        }

        const { method } = req.body;

        const ALLOWED_METHODS = ["CASH", "BANK_TRANSFER", "MOMO", "VNPAY", "ZALOPAY"];

        if (!method || !ALLOWED_METHODS.includes(method.toUpperCase())) {
            return res.status(400).json({
                success: false,
                message: `Phương thức thanh toán không hợp lệ. Chấp nhận: ${ALLOWED_METHODS.join(", ")}`
            });
        }

        await client.query("BEGIN");

        // Kiểm tra hóa đơn tồn tại + thuộc về trader này + chưa thanh toán
        // Dùng FOR UPDATE để lock row, tránh double-payment
        const invoiceResult = await client.query(
            `
            SELECT
                f.id,
                f.total_amount,
                f.status,
                c.trader_id

            FROM fee_invoices f

            JOIN contracts c
                ON f.contract_id = c.id

            WHERE f.id = $1
              AND c.trader_id = $2

            FOR UPDATE
            `,
            [req.params.id, trader.id]
        );

        if (invoiceResult.rows.length === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy hóa đơn hoặc bạn không có quyền thanh toán"
            });
        }

        const invoice = invoiceResult.rows[0];

        if (invoice.status === "PAID") {
            await client.query("ROLLBACK");
            return res.status(409).json({
                success: false,
                message: "Hóa đơn này đã được thanh toán trước đó"
            });
        }

        // Tạo bản ghi thanh toán
        const paymentResult = await client.query(
            `
            INSERT INTO payments
                (invoice_id, amount, method)
            VALUES
                ($1, $2, $3)
            RETURNING *
            `,
            [invoice.id, invoice.total_amount, method.toUpperCase()]
        );

        // Cập nhật trạng thái hóa đơn → PAID
        await client.query(
            `
            UPDATE fee_invoices
            SET status = 'PAID'
            WHERE id = $1
            `,
            [invoice.id]
        );

        await client.query("COMMIT");

        res.status(201).json({
            success: true,
            message: "Thanh toán thành công",
            data: {
                payment: paymentResult.rows[0],
                invoice_id: invoice.id,
                amount: invoice.total_amount,
                method: method.toUpperCase()
            }
        });

    } catch (error) {

        await client.query("ROLLBACK");

        res.status(500).json({
            success: false,
            message: error.message
        });

    } finally {

        client.release();

    }

});


// ════════════════════════════════════════════
// GET /api/trader/me/payments
// Lịch sử các lần thanh toán của tiểu thương (tất cả hóa đơn)
// ════════════════════════════════════════════
router.get("/payments", async (req, res) => {

    try {

        const trader = await getTraderByUserId(req.user.id);

        if (!trader) {
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy hồ sơ tiểu thương"
            });
        }

        const result = await pool.query(
            `
            SELECT
                p.id,
                p.amount,
                p.method,
                p.payment_date,

                f.id           AS invoice_id,
                f.total_amount AS invoice_total,

                s.code         AS stall_code,
                m.name         AS market_name

            FROM payments p

            JOIN fee_invoices f
                ON p.invoice_id = f.id

            JOIN contracts c
                ON f.contract_id = c.id

            JOIN stalls s
                ON c.stall_id = s.id

            JOIN markets m
                ON s.market_id = m.id

            WHERE c.trader_id = $1

            ORDER BY p.id DESC
            `,
            [trader.id]
        );

        res.json({
            success: true,
            data: result.rows
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: error.message
        });

    }

});


// ════════════════════════════════════════════
// GET /api/trader/me/payment-summary
// Tổng quan tình trạng thanh toán: tổng nợ, đã trả, còn lại
// ════════════════════════════════════════════
router.get("/payment-summary", async (req, res) => {

    try {

        const trader = await getTraderByUserId(req.user.id);

        if (!trader) {
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy hồ sơ tiểu thương"
            });
        }

        const result = await pool.query(
            `
            SELECT
                COUNT(*)                                                    AS total_invoices,
                COUNT(*) FILTER (WHERE f.status = 'PAID')                  AS paid_invoices,
                COUNT(*) FILTER (WHERE f.status IN ('UNPAID','OVERDUE'))   AS unpaid_invoices,
                COUNT(*) FILTER (WHERE f.status = 'OVERDUE')               AS overdue_invoices,
                COALESCE(SUM(f.total_amount), 0)                           AS total_amount,
                COALESCE(SUM(f.total_amount) FILTER
                    (WHERE f.status = 'PAID'), 0)                          AS paid_amount,
                COALESCE(SUM(f.total_amount) FILTER
                    (WHERE f.status IN ('UNPAID','OVERDUE')), 0)           AS unpaid_amount,
                COALESCE(SUM(f.total_amount) FILTER
                    (WHERE f.status = 'OVERDUE'), 0)                       AS overdue_amount

            FROM fee_invoices f

            JOIN contracts c
                ON f.contract_id = c.id

            WHERE c.trader_id = $1
            `,
            [trader.id]
        );

        const row = result.rows[0];

        res.json({
            success: true,
            data: {
                total_invoices:   Number(row.total_invoices),
                paid_invoices:    Number(row.paid_invoices),
                unpaid_invoices:  Number(row.unpaid_invoices),
                overdue_invoices: Number(row.overdue_invoices),
                total_amount:     Number(row.total_amount),
                paid_amount:      Number(row.paid_amount),
                unpaid_amount:    Number(row.unpaid_amount),
                overdue_amount:   Number(row.overdue_amount)
            }
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: error.message
        });

    }

});


module.exports = router;