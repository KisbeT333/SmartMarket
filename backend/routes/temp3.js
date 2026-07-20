const express = require("express");
const router = express.Router();
const pool = require("../db");

const verifyToken = require("../middleware/verifyToken");
const authorize = require("../middleware/authorize");

// ════════════════════════════════════════════
// Mọi route trong file này yêu cầu đăng nhập.
// - Xem danh sách / xét duyệt: chỉ ADMIN, MANAGER
// - Gửi phản ánh mới: TRADER hoặc CUSTOMER (tự phân loại theo role đang đăng nhập)
// ════════════════════════════════════════════
router.use(verifyToken);

// ──────────────────────────────────────────────
// Helper: MANAGER chỉ được xem/xử lý phản ánh thuộc chợ mình quản lý
// (markets.manager_id = mình). ADMIN luôn được phép (bỏ qua kiểm tra này).
// Trả về: true nếu được phép, false nếu không tìm thấy hoặc không thuộc quyền.
// ──────────────────────────────────────────────
async function managerOwnsFeedback(feedbackId, userId) {
    const check = await pool.query(
        `
        SELECT m.manager_id
        FROM stall_feedbacks sf
        JOIN stalls s ON sf.stall_id = s.id
        JOIN markets m ON s.market_id = m.id
        WHERE sf.id = $1
        `,
        [feedbackId]
    );
    if (check.rows.length === 0) return null; // không tìm thấy phản ánh
    return check.rows[0].manager_id === userId;
}

// ════════════════════════════════════════════
// GET /api/stall-feedback — Danh sách phản ánh (ADMIN, MANAGER)
// ADMIN: xem toàn bộ. MANAGER: chỉ xem phản ánh thuộc sạp trong các chợ
// mà mình được admin phân công quản lý (markets.manager_id = mình).
// Query param tùy chọn: ?status=PENDING|RESOLVED|REJECTED&type=TRADER|CUSTOMER&stall_id=
// ════════════════════════════════════════════
router.get("/", authorize("ADMIN", "MANAGER"), async (req, res) => {

    try {

        const { status, type, stall_id } = req.query;

        const conditions = [];
        const params = [];

        // Giới hạn theo chợ được phân công — CHỈ áp dụng cho MANAGER, ADMIN xem tất cả.
        if (req.user.role_name === "MANAGER") {
            params.push(req.user.id);
            conditions.push(`m.manager_id = $${params.length}`);
        }

        if (status) { params.push(status); conditions.push(`sf.status = $${params.length}`); }
        if (type) { params.push(type); conditions.push(`sf.type = $${params.length}`); }
        if (stall_id) { params.push(stall_id); conditions.push(`sf.stall_id = $${params.length}`); }

        const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

        const result = await pool.query(
            `
            SELECT
                sf.id,
                sf.type,
                sf.title,
                sf.content,
                sf.status,
                sf.admin_note,
                sf.reviewed_at,
                sf.created_at,

                s.id AS stall_id,
                s.code AS stall_code,
                m.name AS market_name,

                p.id AS product_id,
                p.name AS product_name,

                u.id AS sender_id,
                u.full_name AS sender_name,
                u.phone AS sender_phone,

                t.business_name,

                ru.full_name AS reviewed_by_name

            FROM stall_feedbacks sf

            JOIN stalls s
                ON sf.stall_id = s.id

            JOIN markets m
                ON s.market_id = m.id

            LEFT JOIN products p
                ON sf.product_id = p.id

            JOIN users u
                ON sf.sender_id = u.id

            LEFT JOIN traders t
                ON t.user_id = u.id AND sf.type = 'TRADER'

            LEFT JOIN users ru
                ON sf.reviewed_by = ru.id

            ${whereClause}

            ORDER BY sf.id DESC
            `,
            params
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
// GET /api/stall-feedback/me — Lịch sử phản ánh CỦA CHÍNH người đang đăng nhập
// (TRADER hoặc CUSTOMER). Đặt TRƯỚC "/:id" — nếu không Express sẽ hiểu nhầm
// "me" là :id (kiểu INTEGER), gây lỗi SQL, giống lỗi đã từng gặp ở managerRouter.js.
// Query param tùy chọn: ?status=PENDING|RESOLVED|REJECTED
// ════════════════════════════════════════════
router.get("/me", authorize("TRADER", "CUSTOMER"), async (req, res) => {

    try {

        const { status } = req.query;

        const conditions = ["sf.sender_id = $1"];
        const params = [req.user.id];

        if (status) { params.push(status); conditions.push(`sf.status = $${params.length}`); }

        const result = await pool.query(
            `
            SELECT
                sf.id,
                sf.type,
                sf.title,
                sf.content,
                sf.status,
                sf.admin_note,
                sf.reviewed_at,
                sf.created_at,

                s.id AS stall_id,
                s.code AS stall_code,
                m.name AS market_name,

                p.id AS product_id,
                p.name AS product_name

            FROM stall_feedbacks sf

            JOIN stalls s
                ON sf.stall_id = s.id

            JOIN markets m
                ON s.market_id = m.id

            LEFT JOIN products p
                ON sf.product_id = p.id

            WHERE ${conditions.join(" AND ")}

            ORDER BY sf.id DESC
            `,
            params
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
// GET /api/stall-feedback/:id — Chi tiết 1 phản ánh (ADMIN, MANAGER)
// ════════════════════════════════════════════
router.get("/:id", authorize("ADMIN", "MANAGER"), async (req, res) => {

    try {

        if (req.user.role_name === "MANAGER") {
            const owns = await managerOwnsFeedback(req.params.id, req.user.id);
            if (owns === null) {
                return res.status(404).json({ success: false, message: "Không tìm thấy phản ánh" });
            }
            if (!owns) {
                return res.status(403).json({ success: false, message: "Phản ánh này không thuộc chợ bạn quản lý" });
            }
        }

        const result = await pool.query(
            `
            SELECT
                sf.*,

                s.code AS stall_code,
                m.name AS market_name,

                p.name AS product_name,

                u.full_name AS sender_name,
                u.phone AS sender_phone,

                t.business_name

            FROM stall_feedbacks sf

            JOIN stalls s
                ON sf.stall_id = s.id

            JOIN markets m
                ON s.market_id = m.id

            LEFT JOIN products p
                ON sf.product_id = p.id

            JOIN users u
                ON sf.sender_id = u.id

            LEFT JOIN traders t
                ON t.user_id = u.id AND sf.type = 'TRADER'

            WHERE sf.id = $1
            `,
            [req.params.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy phản ánh"
            });
        }

        res.json({
            success: true,
            data: result.rows[0]
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: error.message
        });

    }

});

// ════════════════════════════════════════════
// POST /api/stall-feedback — Gửi phản ánh mới (TRADER hoặc CUSTOMER)
// Body: { stall_id, product_id?, title?, content }
// Loại phản ánh (type) tự suy ra từ role của người đăng nhập, không nhận từ client.
// ════════════════════════════════════════════
router.post("/", authorize("TRADER", "CUSTOMER"), async (req, res) => {

    try {

        const { stall_id, product_id, title, content } = req.body;

        if (!stall_id || !content) {
            return res.status(400).json({
                success: false,
                message: "Thiếu thông tin bắt buộc: stall_id, content"
            });
        }

        const type = req.user.role_name === "TRADER" ? "TRADER" : "CUSTOMER";

        const result = await pool.query(
            `
            INSERT INTO stall_feedbacks
                (type, stall_id, product_id, sender_id, title, content)
            VALUES
                ($1, $2, $3, $4, $5, $6)
            RETURNING *
            `,
            [type, stall_id, product_id || null, req.user.id, title || null, content]
        );

        res.status(201).json({
            success: true,
            message: "Gửi phản ánh thành công",
            data: result.rows[0]
        });

    } catch (error) {

        if (error.code === "23503") {
            return res.status(400).json({
                success: false,
                message: "stall_id hoặc product_id không tồn tại"
            });
        }

        res.status(500).json({
            success: false,
            message: error.message
        });

    }

});

// ════════════════════════════════════════════
// PUT /api/stall-feedback/:id/resolve — Đánh dấu đã xử lý (ADMIN, MANAGER)
// Body: { admin_note? }
// ════════════════════════════════════════════
router.put("/:id/resolve", authorize("ADMIN", "MANAGER"), async (req, res) => {

    try {

        const { id } = req.params;
        const { admin_note } = req.body;
        const reviewedBy = req.user.id;

        if (req.user.role_name === "MANAGER") {
            const owns = await managerOwnsFeedback(id, req.user.id);
            if (owns === null) {
                return res.status(404).json({ success: false, message: "Không tìm thấy phản ánh" });
            }
            if (!owns) {
                return res.status(403).json({ success: false, message: "Bạn không có quyền xử lý phản ánh này (không thuộc chợ bạn quản lý)" });
            }
        }

        const check = await pool.query(
            "SELECT status FROM stall_feedbacks WHERE id = $1",
            [id]
        );

        if (check.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy phản ánh"
            });
        }

        if (check.rows[0].status !== "PENDING") {
            return res.status(409).json({
                success: false,
                message: "Phản ánh này đã được xử lý trước đó"
            });
        }

        const result = await pool.query(
            `
            UPDATE stall_feedbacks SET
                status = 'RESOLVED',
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
            message: "Đã đánh dấu xử lý phản ánh",
            data: result.rows[0]
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: error.message
        });

    }

});

// ════════════════════════════════════════════
// PUT /api/stall-feedback/:id/reject — Từ chối / đánh dấu không hợp lệ (ADMIN, MANAGER)
// Body: { admin_note? }
// ════════════════════════════════════════════
router.put("/:id/reject", authorize("ADMIN", "MANAGER"), async (req, res) => {

    try {

        const { id } = req.params;
        const { admin_note } = req.body;
        const reviewedBy = req.user.id;

        if (req.user.role_name === "MANAGER") {
            const owns = await managerOwnsFeedback(id, req.user.id);
            if (owns === null) {
                return res.status(404).json({ success: false, message: "Không tìm thấy phản ánh" });
            }
            if (!owns) {
                return res.status(403).json({ success: false, message: "Bạn không có quyền xử lý phản ánh này (không thuộc chợ bạn quản lý)" });
            }
        }

        const check = await pool.query(
            "SELECT status FROM stall_feedbacks WHERE id = $1",
            [id]
        );

        if (check.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy phản ánh"
            });
        }

        if (check.rows[0].status !== "PENDING") {
            return res.status(409).json({
                success: false,
                message: "Phản ánh này đã được xử lý trước đó"
            });
        }

        const result = await pool.query(
            `
            UPDATE stall_feedbacks SET
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
            message: "Đã từ chối phản ánh",
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