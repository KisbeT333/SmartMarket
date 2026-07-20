const express = require("express");
const router = express.Router();
const pool = require("../db");
const { generateDueInvoices } = require("../services/invoiceGenerator");

const verifyToken = require("../middleware/verifyToken");
const authorize = require("../middleware/authorize");

// Mọi route trong file này yêu cầu đăng nhập + role ADMIN
router.use(verifyToken, authorize("ADMIN", "MANAGER"));

// ════════════════════════════════════════════
// GET /api/renewal-requests — Danh sách tất cả yêu cầu gia hạn (admin)
// Query param tùy chọn: ?status=PENDING|APPROVED|REJECTED
// ════════════════════════════════════════════
router.get("/", async (req, res) => {

    try {

        const { status } = req.query;

        const result = await pool.query(
            `
            SELECT
                rr.id,
                rr.requested_end_date,
                rr.requested_monthly_rent,
                rr.note,
                rr.status,
                rr.admin_note,
                rr.reviewed_at,
                rr.created_at,

                c.id AS contract_id,
                c.end_date AS current_end_date,
                c.monthly_rent AS current_monthly_rent,

                s.code AS stall_code,
                m.name AS market_name,

                t.id AS trader_id,
                t.business_name,
                u.full_name AS trader_full_name

            FROM contract_renewal_requests rr

            JOIN contracts c
                ON rr.contract_id = c.id

            JOIN stalls s
                ON c.stall_id = s.id

            JOIN markets m
                ON s.market_id = m.id

            JOIN traders t
                ON rr.trader_id = t.id

            JOIN users u
                ON t.user_id = u.id

            ${status ? "WHERE rr.status = $1" : ""}

            ORDER BY rr.id DESC
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
// PUT /api/renewal-requests/:id/approve — Duyệt yêu cầu gia hạn
// Cập nhật contracts.end_date (và monthly_rent nếu có) theo yêu cầu
// ════════════════════════════════════════════
router.put("/:id/approve", async (req, res) => {

    const client = await pool.connect();

    try {

        const { id } = req.params;
        const { admin_note } = req.body;

        // TODO: Khi có middleware auth cho admin, lấy reviewed_by từ req.user.id thay vì null
        const reviewedBy = req.user ? req.user.id : null;

        await client.query("BEGIN");

        const requestResult = await client.query(
            "SELECT * FROM contract_renewal_requests WHERE id = $1",
            [id]
        );

        if (requestResult.rows.length === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy yêu cầu gia hạn"
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

        // Cập nhật hợp đồng: gia hạn end_date (và monthly_rent nếu trader có đề xuất đổi giá)
        await client.query(
            `
            UPDATE contracts SET
                end_date = $1,
                monthly_rent = COALESCE($2, monthly_rent),
                status = 'active'
            WHERE id = $3
            `,
            [request.requested_end_date, request.requested_monthly_rent, request.contract_id]
        );

        // Cập nhật trạng thái yêu cầu
        const updatedRequest = await client.query(
            `
            UPDATE contract_renewal_requests SET
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

        // Hợp đồng vừa được gia hạn (end_date mới, có thể có thêm kỳ đã tới
        // hạn) → tạo ngay hóa đơn tương ứng, không đợi cron chạy lúc 00:10.
        generateDueInvoices().catch((err) =>
            console.error("[billing] Lỗi tạo hóa đơn ngay sau khi duyệt gia hạn:", err)
        );

        res.json({
            success: true,
            message: "Đã duyệt gia hạn hợp đồng",
            data: updatedRequest.rows[0]
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
// PUT /api/renewal-requests/:id/reject — Từ chối yêu cầu gia hạn
// ════════════════════════════════════════════
router.put("/:id/reject", async (req, res) => {

    try {

        const { id } = req.params;
        const { admin_note } = req.body;

        const reviewedBy = req.user ? req.user.id : null;

        const requestCheck = await pool.query(
            "SELECT status FROM contract_renewal_requests WHERE id = $1",
            [id]
        );

        if (requestCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy yêu cầu gia hạn"
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
            UPDATE contract_renewal_requests SET
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
            message: "Đã từ chối yêu cầu gia hạn",
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