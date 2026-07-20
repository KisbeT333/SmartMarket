const express = require("express");
const router = express.Router();
const pool = require("../db");
const bcrypt = require("bcryptjs");

const verifyToken = require("../middleware/verifyToken");
const authorize = require("../middleware/authorize");

const TRADER_ROLE_ID = 3;

// SỬA (BẢO MẬT NGHIÊM TRỌNG): file này trước đây KHÔNG có verifyToken/authorize
// nào cả — mọi route bên dưới (xem danh sách, tạo, sửa, xóa tiểu thương, kể cả
// đổi mật khẩu qua PUT /:id) đều công khai hoàn toàn, không cần đăng nhập.
// Bất kỳ ai biết (hoặc đoán, vì id là số nguyên tuần tự) id của một tiểu
// thương đều có thể đổi mật khẩu/email/số điện thoại/trạng thái của họ mà
// không cần xác thực gì.
//
// Áp dụng verifyToken cho toàn bộ route (bắt buộc đăng nhập), nhưng phân
// quyền riêng theo từng route thay vì chặn cứng "chỉ ADMIN": Manager cần
// xem được danh sách tiểu thương thuộc chợ mình quản lý (manager.js trang
// "Tiểu thương"), nên 2 route GET cho phép cả ADMIN và MANAGER. Các route
// tạo/sửa/xóa (bao gồm đổi mật khẩu, khóa tài khoản) vẫn giữ ADMIN-only vì
// đây là hành động nhạy cảm hơn.
router.use(verifyToken);

// ════════════════════════════════════════════
// GET: Danh sách tiểu thương
// ════════════════════════════════════════════
router.get("/", authorize("ADMIN", "MANAGER"), async (req, res) => {

    try {

        const result = await pool.query(`
            SELECT
                t.id,
                t.business_name,
                t.tax_code,

                u.id AS user_id,
                u.username,
                u.full_name,
                u.phone,
                u.email,
                u.status,

                m.id AS market_id,
                m.name AS market_name

            FROM traders t

            JOIN users u
                ON t.user_id = u.id

            JOIN markets m
                ON t.market_id = m.id

            ORDER BY t.id DESC
        `);

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
// GET: Chi tiết một tiểu thương
// ════════════════════════════════════════════
router.get("/:id", authorize("ADMIN", "MANAGER"), async (req, res) => {

    try {

        const { id } = req.params;

        const result = await pool.query(
            `
            SELECT
                t.id,
                t.business_name,
                t.tax_code,

                u.id AS user_id,
                u.username,
                u.full_name,
                u.phone,
                u.email,
                u.status,

                m.id AS market_id,
                m.name AS market_name

            FROM traders t

            JOIN users u
                ON t.user_id = u.id

            JOIN markets m
                ON t.market_id = m.id

            WHERE t.id = $1
            `,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy tiểu thương"
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
// POST: Thêm tiểu thương mới (tạo user + trader)
// ════════════════════════════════════════════
router.post("/", authorize("ADMIN"), async (req, res) => {

    const client = await pool.connect();

    try {

        const {
            username,
            password,
            full_name,
            phone,
            email,
            market_id,
            business_name,
            tax_code
        } = req.body;

        // Validate dữ liệu bắt buộc
        if (!username || !password || !full_name || !market_id || !business_name) {
            return res.status(400).json({
                success: false,
                message: "Thiếu thông tin bắt buộc: username, password, full_name, market_id, business_name"
            });
        }

        await client.query("BEGIN");

        // Hash mật khẩu bằng bcryptjs
        const passwordHash = await bcrypt.hash(password, 10);

        // 1. Tạo user với role_id = 3 (trader)
        const userResult = await client.query(
            `
            INSERT INTO users
                (username, password_hash, full_name, phone, email, role_id, status, login_provider)
            VALUES
                ($1, $2, $3, $4, $5, $6, 'ACTIVE', 'LOCAL')
            RETURNING id, username, full_name, phone, email, status
            `,
            [
                username,
                passwordHash,
                full_name,
                phone || null,
                email || null,
                TRADER_ROLE_ID
            ]
        );

        const newUser = userResult.rows[0];

        // 2. Tạo trader gắn với user vừa tạo
        const traderResult = await client.query(
            `
            INSERT INTO traders
                (user_id, market_id, business_name, tax_code)
            VALUES
                ($1, $2, $3, $4)
            RETURNING *
            `,
            [newUser.id, market_id, business_name, tax_code || null]
        );

        await client.query("COMMIT");

        res.status(201).json({
            success: true,
            message: "Thêm tiểu thương thành công",
            data: {
                ...traderResult.rows[0],
                user: newUser
            }
        });

    } catch (error) {

        await client.query("ROLLBACK");

        // username / phone / email bị trùng (UNIQUE constraint)
        if (error.code === "23505") {
            return res.status(409).json({
                success: false,
                message: "Username, số điện thoại hoặc email đã được sử dụng"
            });
        }

        // market_id không tồn tại (FOREIGN KEY constraint)
        if (error.code === "23503") {
            return res.status(400).json({
                success: false,
                message: "market_id không tồn tại"
            });
        }

        res.status(500).json({
            success: false,
            message: error.message
        });

    } finally {

        client.release();

    }

});

// ════════════════════════════════════════════
// PUT: Sửa thông tin tiểu thương (+ user liên kết)
// ════════════════════════════════════════════
router.put("/:id", authorize("ADMIN"), async (req, res) => {

    const client = await pool.connect();

    try {

        const { id } = req.params;

        const {
            full_name,
            phone,
            email,
            status,
            password,       // tùy chọn — chỉ đổi nếu có gửi lên
            market_id,
            business_name,
            tax_code
        } = req.body;

        // Tìm user_id gắn với trader này
        const traderCheck = await client.query(
            "SELECT user_id FROM traders WHERE id = $1",
            [id]
        );

        if (traderCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy tiểu thương"
            });
        }

        const userId = traderCheck.rows[0].user_id;

        await client.query("BEGIN");

        // 1. Cập nhật users (chỉ cập nhật field có gửi lên)
        await client.query(
            `
            UPDATE users SET
                full_name = COALESCE($1, full_name),
                phone = COALESCE($2, phone),
                email = COALESCE($3, email),
                status = COALESCE($4, status),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $5
            `,
            [full_name || null, phone || null, email || null, status || null, userId]
        );

        // 1b. Nếu có gửi password mới thì hash và cập nhật riêng
        if (password) {
            const passwordHash = await bcrypt.hash(password, 10);
            await client.query(
                "UPDATE users SET password_hash = $1 WHERE id = $2",
                [passwordHash, userId]
            );
        }

        // 2. Cập nhật traders
        const traderResult = await client.query(
            `
            UPDATE traders SET
                market_id = COALESCE($1, market_id),
                business_name = COALESCE($2, business_name),
                tax_code = COALESCE($3, tax_code)
            WHERE id = $4
            RETURNING *
            `,
            [market_id || null, business_name || null, tax_code || null, id]
        );

        await client.query("COMMIT");

        res.json({
            success: true,
            message: "Cập nhật tiểu thương thành công",
            data: traderResult.rows[0]
        });

    } catch (error) {

        await client.query("ROLLBACK");

        if (error.code === "23505") {
            return res.status(409).json({
                success: false,
                message: "Số điện thoại hoặc email đã được sử dụng"
            });
        }

        if (error.code === "23503") {
            return res.status(400).json({
                success: false,
                message: "market_id không tồn tại"
            });
        }

        res.status(500).json({
            success: false,
            message: error.message
        });

    } finally {

        client.release();

    }

});

// ════════════════════════════════════════════
// DELETE: Xóa tiểu thương (+ user liên kết)
// ════════════════════════════════════════════
router.delete("/:id", authorize("ADMIN"), async (req, res) => {

    const client = await pool.connect();

    try {

        const { id } = req.params;

        const traderCheck = await client.query(
            "SELECT user_id FROM traders WHERE id = $1",
            [id]
        );

        if (traderCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy tiểu thương"
            });
        }

        const userId = traderCheck.rows[0].user_id;

        // Kiểm tra ràng buộc: còn hợp đồng hoặc sản phẩm gắn với trader này không
        const contractCheck = await client.query(
            "SELECT COUNT(*) FROM contracts WHERE trader_id = $1",
            [id]
        );
        const productCheck = await client.query(
            "SELECT COUNT(*) FROM products WHERE trader_id = $1",
            [id]
        );

        if (parseInt(contractCheck.rows[0].count) > 0 || parseInt(productCheck.rows[0].count) > 0) {
            return res.status(409).json({
                success: false,
                message: "Không thể xóa: tiểu thương đang có hợp đồng hoặc sản phẩm liên kết. Vui lòng xử lý các dữ liệu này trước."
            });
        }

        await client.query("BEGIN");

        await client.query("DELETE FROM traders WHERE id = $1", [id]);
        await client.query("DELETE FROM users WHERE id = $1", [userId]);

        await client.query("COMMIT");

        res.json({
            success: true,
            message: "Đã xóa tiểu thương thành công"
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

module.exports = router;