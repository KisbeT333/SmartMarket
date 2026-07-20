const express = require("express");
const router = express.Router();
const pool = require("../db");
const { generateDueInvoices } = require("../services/invoiceGenerator");

const verifyToken = require("../middleware/verifyToken");
const authorize = require("../middleware/authorize");

// Mọi route trong file này yêu cầu đăng nhập + role ADMIN hoặc MANAGER
router.use(verifyToken, authorize("ADMIN", "MANAGER"));

// ════════════════════════════════════════════
// GET /api/stall-requests — Danh sách tất cả yêu cầu thuê sạp (admin)
// Query param tùy chọn: ?status=PENDING|APPROVED|REJECTED
// ════════════════════════════════════════════
router.get("/", async (req, res) => {

    try {

        const { status } = req.query;

        const result = await pool.query(
            `
            SELECT
                sr.id,
                sr.requested_start_date,
                sr.requested_end_date,
                sr.note,
                sr.status,
                sr.admin_note,
                sr.reviewed_at,
                sr.created_at,

                s.id AS stall_id,
                s.code AS stall_code,
                s.monthly_rent,

                m.name AS market_name,

                t.id AS trader_id,
                t.business_name,
                u.full_name AS trader_full_name,
                u.phone AS trader_phone

            FROM stall_rental_requests sr

            JOIN stalls s
                ON sr.stall_id = s.id

            JOIN markets m
                ON s.market_id = m.id

            JOIN traders t
                ON sr.trader_id = t.id

            JOIN users u
                ON t.user_id = u.id

            ${status ? "WHERE sr.status = $1" : ""}

            ORDER BY sr.id DESC
            `,
            status ? [status] : []
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
// PUT /api/stall-requests/:id/approve — Duyệt yêu cầu thuê sạp
// Tạo hợp đồng mới + chuyển sạp sang trạng thái "rented"
// ════════════════════════════════════════════
router.put("/:id/approve", async (req, res) => {

    const client = await pool.connect();

    try {

        const { id } = req.params;
        const { admin_note, monthly_rent } = req.body;

        const reviewedBy = req.user ? req.user.id : null;

        await client.query("BEGIN");

        const requestResult = await client.query(
            "SELECT * FROM stall_rental_requests WHERE id = $1",
            [id]
        );

        if (requestResult.rows.length === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy yêu cầu thuê sạp"
            });
        }

        const request = requestResult.rows[0];

        if (request.status !== "PENDING") {
            await client.query("ROLLBACK");
            return res.status(409).json({
                success: false,
                message: "Yêu cầu này đã được xử lý trước đó"
            });
        }

        // Đảm bảo sạp vẫn đang trống tại thời điểm duyệt
        const stallCheck = await client.query(
            "SELECT status, monthly_rent FROM stalls WHERE id = $1",
            [request.stall_id]
        );

        if (stallCheck.rows.length === 0 || stallCheck.rows[0].status !== "available") {
            await client.query("ROLLBACK");
            return res.status(409).json({
                success: false,
                message: "Sạp này không còn trống, không thể duyệt yêu cầu"
            });
        }

        const rent = monthly_rent || stallCheck.rows[0].monthly_rent;

        // 1. Tạo hợp đồng mới
        const contractResult = await client.query(
            `
            INSERT INTO contracts
                (trader_id, stall_id, start_date, end_date, monthly_rent, status)
            VALUES
                ($1, $2, $3, $4, $5, 'active')
            RETURNING *
            `,
            [request.trader_id, request.stall_id, request.requested_start_date, request.requested_end_date, rent]
        );

        // 2. Chuyển trạng thái sạp sang "rented"
        await client.query(
            "UPDATE stalls SET status = 'rented' WHERE id = $1",
            [request.stall_id]
        );

        // 3. Cập nhật trạng thái yêu cầu
        const updatedRequest = await client.query(
            `
            UPDATE stall_rental_requests SET
                status = 'APPROVED',
                admin_note = $1,
                reviewed_by = $2,
                reviewed_at = CURRENT_TIMESTAMP
            WHERE id = $3
            RETURNING *
            `,
            [admin_note || null, reviewedBy, id]
        );

        await client.query("COMMIT");

        // Hợp đồng mới vừa tạo (status='active') → tạo ngay hóa đơn cho kỳ
        // thanh toán đầu tiên, không đợi cron chạy lúc 00:10.
        generateDueInvoices().catch((err) =>
            console.error("[billing] Lỗi tạo hóa đơn ngay sau khi duyệt yêu cầu thuê sạp:", err)
        );

        res.json({
            success: true,
            message: "Đã duyệt yêu cầu thuê sạp và tạo hợp đồng mới",
            data: {
                request: updatedRequest.rows[0],
                contract: contractResult.rows[0]
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
// PUT /api/stall-requests/:id/reject — Từ chối yêu cầu thuê sạp
// ════════════════════════════════════════════
router.put("/:id/reject", async (req, res) => {

    try {

        const { id } = req.params;
        const { admin_note } = req.body;

        const reviewedBy = req.user ? req.user.id : null;

        const requestCheck = await pool.query(
            "SELECT status FROM stall_rental_requests WHERE id = $1",
            [id]
        );

        if (requestCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy yêu cầu thuê sạp"
            });
        }

        if (requestCheck.rows[0].status !== "PENDING") {
            return res.status(409).json({
                success: false,
                message: "Yêu cầu này đã được xử lý trước đó"
            });
        }

        const result = await pool.query(
            `
            UPDATE stall_rental_requests SET
                status = 'REJECTED',
                admin_note = $1,
                reviewed_by = $2,
                reviewed_at = CURRENT_TIMESTAMP
            WHERE id = $3
            RETURNING *
            `,
            [admin_note || null, reviewedBy, id]
        );

        res.json({
            success: true,
            message: "Đã từ chối yêu cầu thuê sạp",
            data: result.rows[0]
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: error.message
        });

    }

});

module.exports = router;