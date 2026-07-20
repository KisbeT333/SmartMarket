const express = require("express");
const router = express.Router();
const pool = require("../db");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const bcrypt = require("bcryptjs");

const verifyToken = require("../middleware/verifyToken");
const authorize = require("../middleware/authorize");

// Mọi route trong file này yêu cầu đăng nhập + role TRADER
router.use(verifyToken, authorize("TRADER"));

// ────────────────────────────────────────────
// MULTER: cấu hình upload ảnh sản phẩm
// Lưu file vào /uploads/products, tên file = timestamp + random + đuôi gốc
// ────────────────────────────────────────────
const uploadDir = path.join(__dirname, "..", "uploads", "products");
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    },
});

const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "image/gif"];

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // tối đa 5MB
    fileFilter: (req, file, cb) => {
        if (!ALLOWED_MIME.includes(file.mimetype)) {
            return cb(new Error("Chỉ chấp nhận ảnh JPEG, PNG, WEBP hoặc GIF"));
        }
        cb(null, true);
    },
});

// ────────────────────────────────────────────
// Helper: lấy trader_id từ user_id đang đăng nhập (req.user.id)
// ────────────────────────────────────────────
async function getTraderByUserId(userId) {
    const result = await pool.query(
        "SELECT * FROM traders WHERE user_id = $1",
        [userId]
    );
    return result.rows[0] || null;
}

// ════════════════════════════════════════════
// GET /api/trader/me — Thông tin tiểu thương đang đăng nhập
// ════════════════════════════════════════════
router.get("/", async (req, res) => {

    try {

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
                u.avatar_url,

                m.id AS market_id,
                m.name AS market_name,
                m.address AS market_address,
                m.city AS market_city

            FROM traders t

            JOIN users u
                ON t.user_id = u.id

            JOIN markets m
                ON t.market_id = m.id

            WHERE t.user_id = $1
            `,
            [req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy hồ sơ tiểu thương cho tài khoản này"
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
// PUT /api/trader/me — Cập nhật hồ sơ (chỉ thông tin cá nhân, không đổi market/business)
// ════════════════════════════════════════════
router.put("/", async (req, res) => {

    try {

        const { full_name, phone, email } = req.body;

        const result = await pool.query(
            `
            UPDATE users SET
                full_name = COALESCE($1, full_name),
                phone = COALESCE($2, phone),
                email = COALESCE($3, email),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $4
            RETURNING id, username, full_name, phone, email, status
            `,
            [full_name || null, phone || null, email || null, req.user.id]
        );

        res.json({
            success: true,
            message: "Cập nhật hồ sơ thành công",
            data: result.rows[0]
        });

    } catch (error) {

        if (error.code === "23505") {
            return res.status(409).json({
                success: false,
                message: "Số điện thoại hoặc email đã được sử dụng"
            });
        }

        res.status(500).json({
            success: false,
            message: error.message
        });

    }

});

// ════════════════════════════════════════════
// PUT /api/trader/me/password — Tự đổi mật khẩu (yêu cầu đúng mật khẩu hiện tại)
//
// MỚI: trước đây frontend (trader.js) gọi PUT /api/trader/:id (route dành cho
// ADMIN quản lý tiểu thương, và route đó lại không hề có xác thực) để tự đổi
// mật khẩu — vừa sai kiến trúc (mượn route admin) vừa là lỗ hổng bảo mật.
// Endpoint này thay thế đúng cách: xác định trader từ chính token đăng nhập
// (req.user.id), không nhận id từ client nên không thể đổi mật khẩu người
// khác, và bắt buộc nhập đúng mật khẩu hiện tại trước khi cho đổi.
// ════════════════════════════════════════════
router.put("/password", async (req, res) => {

    try {

        const { current_password, new_password } = req.body;

        if (!current_password || !new_password) {
            return res.status(400).json({
                success: false,
                message: "Thiếu mật khẩu hiện tại hoặc mật khẩu mới"
            });
        }

        if (new_password.length < 6) {
            return res.status(400).json({
                success: false,
                message: "Mật khẩu mới phải có ít nhất 6 ký tự"
            });
        }

        const userResult = await pool.query(
            "SELECT id, password_hash FROM users WHERE id = $1",
            [req.user.id]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy tài khoản"
            });
        }

        const isMatch = await bcrypt.compare(current_password, userResult.rows[0].password_hash);

        if (!isMatch) {
            return res.status(400).json({
                success: false,
                message: "Mật khẩu hiện tại không đúng"
            });
        }

        const newHash = await bcrypt.hash(new_password, 10);

        await pool.query(
            `
            UPDATE users SET
                password_hash = $1,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
            `,
            [newHash, req.user.id]
        );

        res.json({
            success: true,
            message: "Đổi mật khẩu thành công"
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: error.message
        });

    }

});


router.get("/products", async (req, res) => {

    try {

        const trader = await getTraderByUserId(req.user.id);
        if (!trader) {
            return res.status(404).json({ success: false, message: "Không tìm thấy hồ sơ tiểu thương" });
        }

        const result = await pool.query(
            `
            SELECT
                p.id,
                p.name,
                p.price,
                p.image_url,

                s.id AS stall_id,
                s.code AS stall_code

            FROM products p

            JOIN stalls s
                ON p.stall_id = s.id

            WHERE p.trader_id = $1

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
// POST /api/trader/me/products — Thêm sản phẩm mới (kèm ảnh, multipart/form-data)
// ════════════════════════════════════════════
router.post("/products", upload.single("image"), async (req, res) => {

    try {

        const { stall_id, name, price } = req.body;

        if (!stall_id || !name || price === undefined) {
            // Nếu validate fail mà đã upload ảnh thì xóa file rác đi
            if (req.file) fs.unlink(req.file.path, () => {});
            return res.status(400).json({
                success: false,
                message: "Thiếu thông tin bắt buộc: stall_id, name, price"
            });
        }

        const trader = await getTraderByUserId(req.user.id);
        if (!trader) {
            if (req.file) fs.unlink(req.file.path, () => {});
            return res.status(404).json({ success: false, message: "Không tìm thấy hồ sơ tiểu thương" });
        }

        // Đảm bảo sạp này thuộc về chính trader đang đăng nhập (qua hợp đồng còn hiệu lực)
        const stallCheck = await pool.query(
            `
            SELECT 1 FROM contracts
            WHERE trader_id = $1 AND stall_id = $2
            `,
            [trader.id, stall_id]
        );

        if (stallCheck.rows.length === 0) {
            if (req.file) fs.unlink(req.file.path, () => {});
            return res.status(403).json({
                success: false,
                message: "Sạp này không thuộc hợp đồng của bạn"
            });
        }

        const imageUrl = req.file ? `/uploads/products/${req.file.filename}` : null;

        const result = await pool.query(
            `
            INSERT INTO products
                (trader_id, stall_id, name, price, image_url)
            VALUES
                ($1, $2, $3, $4, $5)
            RETURNING *
            `,
            [trader.id, stall_id, name, price, imageUrl]
        );

        res.status(201).json({
            success: true,
            message: "Thêm sản phẩm thành công",
            data: result.rows[0]
        });

    } catch (error) {

        if (req.file) fs.unlink(req.file.path, () => {});

        if (error.code === "23503") {
            return res.status(400).json({
                success: false,
                message: "stall_id không tồn tại"
            });
        }

        res.status(500).json({
            success: false,
            message: error.message
        });

    }

});

// ════════════════════════════════════════════
// PUT /api/trader/me/products/:id — Sửa sản phẩm (chỉ của chính mình, ảnh tùy chọn)
// ════════════════════════════════════════════
router.put("/products/:id", upload.single("image"), async (req, res) => {

    try {

        const { id } = req.params;
        const { name, price } = req.body;

        const trader = await getTraderByUserId(req.user.id);
        if (!trader) {
            if (req.file) fs.unlink(req.file.path, () => {});
            return res.status(404).json({ success: false, message: "Không tìm thấy hồ sơ tiểu thương" });
        }

        // Lấy ảnh cũ để xóa file nếu có ảnh mới thay thế
        const oldProduct = await pool.query(
            "SELECT image_url FROM products WHERE id = $1 AND trader_id = $2",
            [id, trader.id]
        );

        if (oldProduct.rows.length === 0) {
            if (req.file) fs.unlink(req.file.path, () => {});
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy sản phẩm hoặc sản phẩm không thuộc về bạn"
            });
        }

        const newImageUrl = req.file ? `/uploads/products/${req.file.filename}` : null;

        const result = await pool.query(
            `
            UPDATE products SET
                name = COALESCE($1, name),
                price = COALESCE($2, price),
                image_url = COALESCE($3, image_url)
            WHERE id = $4 AND trader_id = $5
            RETURNING *
            `,
            [name || null, price || null, newImageUrl, id, trader.id]
        );

        // Xóa file ảnh cũ trên đĩa nếu vừa thay ảnh mới
        if (newImageUrl && oldProduct.rows[0].image_url) {
            const oldPath = path.join(__dirname, "..", oldProduct.rows[0].image_url.replace(/^\//, ""));
            fs.unlink(oldPath, () => {});
        }

        res.json({
            success: true,
            message: "Cập nhật sản phẩm thành công",
            data: result.rows[0]
        });

    } catch (error) {

        if (req.file) fs.unlink(req.file.path, () => {});

        res.status(500).json({
            success: false,
            message: error.message
        });

    }

});

// ════════════════════════════════════════════
// DELETE /api/trader/me/products/:id — Xóa sản phẩm (chỉ của chính mình)
// ════════════════════════════════════════════
router.delete("/products/:id", async (req, res) => {

    try {

        const { id } = req.params;

        const trader = await getTraderByUserId(req.user.id);
        if (!trader) {
            return res.status(404).json({ success: false, message: "Không tìm thấy hồ sơ tiểu thương" });
        }

        const result = await pool.query(
            "DELETE FROM products WHERE id = $1 AND trader_id = $2 RETURNING id, image_url",
            [id, trader.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy sản phẩm hoặc sản phẩm không thuộc về bạn"
            });
        }

        // Xóa file ảnh khỏi đĩa nếu có
        const imageUrl = result.rows[0].image_url;
        if (imageUrl) {
            const imagePath = path.join(__dirname, "..", imageUrl.replace(/^\//, ""));
            fs.unlink(imagePath, () => {});
        }

        res.json({
            success: true,
            message: "Đã xóa sản phẩm thành công"
        });

    } catch (error) {

        // Sản phẩm đang nằm trong order_items hoặc cart_items (FOREIGN KEY constraint)
        if (error.code === "23503") {
            return res.status(409).json({
                success: false,
                message: "Không thể xóa: sản phẩm đang được dùng trong đơn hàng hoặc giỏ hàng"
            });
        }

        res.status(500).json({
            success: false,
            message: error.message
        });

    }

});

// ════════════════════════════════════════════
// GET /api/trader/me/orders — Đơn hàng của riêng tôi
// ════════════════════════════════════════════
router.get("/orders", async (req, res) => {

    try {

        const trader = await getTraderByUserId(req.user.id);
        if (!trader) {
            return res.status(404).json({ success: false, message: "Không tìm thấy hồ sơ tiểu thương" });
        }

        const result = await pool.query(
            `
            SELECT
                o.id,
                o.order_code,
                o.total_amount,
                o.payment_method,
                o.status,
                o.created_at,

                COALESCE(u.full_name, o.guest_name) AS customer_name,
                COALESCE(u.phone, o.guest_phone)     AS customer_phone,
                (o.customer_id IS NULL)              AS is_guest,
                o.guest_address,
                o.guest_note

            FROM orders o

            LEFT JOIN users u
                ON o.customer_id = u.id

            WHERE o.trader_id = $1

            ORDER BY o.id DESC
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
// GET /api/trader/me/orders/:id — Chi tiết 1 đơn hàng (kèm order_items)
// ════════════════════════════════════════════
router.get("/orders/:id", async (req, res) => {

    try {

        const { id } = req.params;

        const trader = await getTraderByUserId(req.user.id);
        if (!trader) {
            return res.status(404).json({ success: false, message: "Không tìm thấy hồ sơ tiểu thương" });
        }

        const orderResult = await pool.query(
            `
            SELECT
                o.id,
                o.order_code,
                o.total_amount,
                o.payment_method,
                o.status,
                o.created_at,

                COALESCE(u.full_name, o.guest_name) AS customer_name,
                COALESCE(u.phone, o.guest_phone)     AS customer_phone,
                (o.customer_id IS NULL)              AS is_guest,
                o.guest_address,
                o.guest_note

            FROM orders o

            LEFT JOIN users u
                ON o.customer_id = u.id

            WHERE o.id = $1 AND o.trader_id = $2
            `,
            [id, trader.id]
        );

        if (orderResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy đơn hàng hoặc đơn hàng không thuộc về bạn"
            });
        }

        const itemsResult = await pool.query(
            `
            SELECT
                oi.id,
                oi.quantity,
                oi.price,

                p.name AS product_name

            FROM order_items oi

            JOIN products p
                ON oi.product_id = p.id

            WHERE oi.order_id = $1
            `,
            [id]
        );

        res.json({
            success: true,
            data: {
                ...orderResult.rows[0],
                items: itemsResult.rows
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
// GET /api/trader/me/contracts — Hợp đồng / sạp của riêng tôi
// ════════════════════════════════════════════
router.get("/contracts", async (req, res) => {

    try {

        const trader = await getTraderByUserId(req.user.id);
        if (!trader) {
            return res.status(404).json({ success: false, message: "Không tìm thấy hồ sơ tiểu thương" });
        }

        // SỬA: trước đây mục "installments" lấy từ bảng contract_installments —
        // bảng này không được tạo/cập nhật ở bất kỳ đâu khác trong hệ thống
        // (không route nào ghi dữ liệu vào đó), nên field này luôn rỗng hoặc
        // gây lỗi 500 nếu bảng không tồn tại trong DB thật. Đổi sang lấy từ
        // fee_invoices + payments (dữ liệu thật, giống cách admin/contractRoutes.js
        // đang dùng) để nhất quán trong toàn hệ thống.
        const result = await pool.query(
            `
            SELECT
                c.id,
                c.start_date,
                c.end_date,
                c.monthly_rent,
                c.payment_step_months,
                c.status,

                s.id AS stall_id,
                s.code AS stall_code,
                s.area_m2,

                m.name AS market_name,

                COALESCE(inst.installments, '[]'::json) AS installments

            FROM contracts c

            JOIN stalls s
                ON c.stall_id = s.id

            JOIN markets m
                ON s.market_id = m.id

            LEFT JOIN LATERAL (

                SELECT json_agg(
                    json_build_object(
                        'period',       f.period,
                        'status',       f.status,
                        'invoice_id',   f.id,
                        'due_date',     f.due_date,
                        'total_amount', f.total_amount,
                        'paid_date',    pay.payment_date
                    )
                    ORDER BY f.period
                ) AS installments

                FROM fee_invoices f

                LEFT JOIN LATERAL (
                    SELECT p.payment_date
                    FROM payments p
                    WHERE p.invoice_id = f.id
                    ORDER BY p.id DESC
                    LIMIT 1
                ) pay ON TRUE

                WHERE f.contract_id = c.id

            ) inst ON TRUE

            WHERE c.trader_id = $1

            ORDER BY c.id DESC
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
// POST /api/trader/me/contracts/:id/renew — Gửi yêu cầu gia hạn hợp đồng (chờ admin duyệt)
// ════════════════════════════════════════════
router.post("/contracts/:id/renew", async (req, res) => {

    try {

        const { id } = req.params; // contract_id
        const { requested_end_date, requested_monthly_rent, note } = req.body;

        if (!requested_end_date) {
            return res.status(400).json({
                success: false,
                message: "Thiếu thông tin bắt buộc: requested_end_date"
            });
        }

        const trader = await getTraderByUserId(req.user.id);
        if (!trader) {
            return res.status(404).json({ success: false, message: "Không tìm thấy hồ sơ tiểu thương" });
        }

        // Đảm bảo hợp đồng này thuộc về chính trader đang đăng nhập
        const contractCheck = await pool.query(
            "SELECT id, end_date FROM contracts WHERE id = $1 AND trader_id = $2",
            [id, trader.id]
        );

        if (contractCheck.rows.length === 0) {
            return res.status(403).json({
                success: false,
                message: "Hợp đồng này không thuộc về bạn"
            });
        }

        // Chặn gửi yêu cầu mới nếu đang có yêu cầu PENDING cho hợp đồng này
        const pendingCheck = await pool.query(
            "SELECT id FROM contract_renewal_requests WHERE contract_id = $1 AND status = 'PENDING'",
            [id]
        );

        if (pendingCheck.rows.length > 0) {
            return res.status(409).json({
                success: false,
                message: "Hợp đồng này đang có một yêu cầu gia hạn chờ duyệt. Vui lòng đợi admin xử lý."
            });
        }

        const result = await pool.query(
            `
            INSERT INTO contract_renewal_requests
                (contract_id, trader_id, requested_end_date, requested_monthly_rent, note)
            VALUES
                ($1, $2, $3, $4, $5)
            RETURNING *
            `,
            [id, trader.id, requested_end_date, requested_monthly_rent || null, note || null]
        );

        res.status(201).json({
            success: true,
            message: "Đã gửi yêu cầu gia hạn, vui lòng chờ admin duyệt",
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
// GET /api/trader/me/renewal-requests — Danh sách yêu cầu gia hạn của tôi
// ════════════════════════════════════════════
router.get("/renewal-requests", async (req, res) => {

    try {

        const trader = await getTraderByUserId(req.user.id);
        if (!trader) {
            return res.status(404).json({ success: false, message: "Không tìm thấy hồ sơ tiểu thương" });
        }

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
                s.code AS stall_code

            FROM contract_renewal_requests rr

            JOIN contracts c
                ON rr.contract_id = c.id

            JOIN stalls s
                ON c.stall_id = s.id

            WHERE rr.trader_id = $1

            ORDER BY rr.id DESC
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
// GET /api/trader/me/available-stalls?market_id=X — Sạp trống của một chợ
// ════════════════════════════════════════════
router.get("/available-stalls", async (req, res) => {

    try {

        const { market_id } = req.query;

        if (!market_id) {
            return res.status(400).json({
                success: false,
                message: "Thiếu thông tin bắt buộc: market_id"
            });
        }

        const result = await pool.query(
            `
            SELECT
                s.id,
                s.code,
                s.area_m2,
                s.monthly_rent,
                s.status,

                z.name AS zone_name,
                m.name AS market_name

            FROM stalls s

            JOIN zones z
                ON s.zone_id = z.id

            JOIN markets m
                ON s.market_id = m.id

            WHERE s.market_id = $1 AND s.status = 'available'

            ORDER BY s.code
            `,
            [market_id]
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
// POST /api/trader/me/stall-requests — Gửi yêu cầu thuê sạp trống (chờ admin duyệt)
// ════════════════════════════════════════════
router.post("/stall-requests", async (req, res) => {

    try {

        const { stall_id, requested_start_date, requested_end_date, note } = req.body;

        if (!stall_id || !requested_start_date || !requested_end_date) {
            return res.status(400).json({
                success: false,
                message: "Thiếu thông tin bắt buộc: stall_id, requested_start_date, requested_end_date"
            });
        }

        const trader = await getTraderByUserId(req.user.id);
        if (!trader) {
            return res.status(404).json({ success: false, message: "Không tìm thấy hồ sơ tiểu thương" });
        }

        // Đảm bảo sạp này vẫn đang trống (tránh 2 trader cùng xin 1 sạp)
        const stallCheck = await pool.query(
            "SELECT status FROM stalls WHERE id = $1",
            [stall_id]
        );

        if (stallCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy sạp"
            });
        }

        if (stallCheck.rows[0].status !== "available") {
            return res.status(409).json({
                success: false,
                message: "Sạp này không còn trống, vui lòng chọn sạp khác"
            });
        }

        // Chặn gửi yêu cầu mới nếu đang có yêu cầu PENDING cho chính sạp này
        const pendingCheck = await pool.query(
            "SELECT id FROM stall_rental_requests WHERE stall_id = $1 AND status = 'PENDING'",
            [stall_id]
        );

        if (pendingCheck.rows.length > 0) {
            return res.status(409).json({
                success: false,
                message: "Sạp này đang có một yêu cầu thuê khác chờ duyệt. Vui lòng chọn sạp khác hoặc đợi xử lý."
            });
        }

        const result = await pool.query(
            `
            INSERT INTO stall_rental_requests
                (trader_id, stall_id, requested_start_date, requested_end_date, note)
            VALUES
                ($1, $2, $3, $4, $5)
            RETURNING *
            `,
            [trader.id, stall_id, requested_start_date, requested_end_date, note || null]
        );

        res.status(201).json({
            success: true,
            message: "Đã gửi yêu cầu thuê sạp, vui lòng chờ admin duyệt",
            data: result.rows[0]
        });

    } catch (error) {

        if (error.code === "23503") {
            return res.status(400).json({
                success: false,
                message: "stall_id không tồn tại"
            });
        }

        res.status(500).json({
            success: false,
            message: error.message
        });

    }

});

router.get("/stall-requests", async (req, res) => {

    try {

        const trader = await getTraderByUserId(req.user.id);
        if (!trader) {
            return res.status(404).json({ success: false, message: "Không tìm thấy hồ sơ tiểu thương" });
        }

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

                m.name AS market_name

            FROM stall_rental_requests sr

            JOIN stalls s
                ON sr.stall_id = s.id

            JOIN markets m
                ON s.market_id = m.id

            WHERE sr.trader_id = $1

            ORDER BY sr.id DESC
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

module.exports = router;