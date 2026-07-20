const express = require("express");
const router = express.Router();
const pool = require("../db");

router.get("/", async (req, res) => {
    try {

        const result = await pool.query(`
            SELECT
                s.id,
                s.code,
                s.area_m2,
                s.monthly_rent,
                s.status,
                s.market_id,

                z.name AS zone_name,
                m.name AS market_name

            FROM stalls s

            JOIN zones z
                ON s.zone_id = z.id

            JOIN markets m
                ON s.market_id = m.id

            ORDER BY s.code
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

// Thêm sạp mới
router.post("/", async (req, res) => {
    try {

        const {
            market_id,
            zone_id,
            code,
            area_m2,
            monthly_rent,
            status
        } = req.body;

        // Validate dữ liệu bắt buộc
        if (!market_id || !zone_id || !code) {
            return res.status(400).json({
                success: false,
                message: "Thiếu thông tin bắt buộc: market_id, zone_id, code"
            });
        }

        const result = await pool.query(
            `
            INSERT INTO stalls
                (market_id, zone_id, code, area_m2, monthly_rent, status)
            VALUES
                ($1, $2, $3, $4, $5, $6)
            RETURNING *
            `,
            [
                market_id,
                zone_id,
                code,
                area_m2 || null,
                monthly_rent || null,
                status || "available"
            ]
        );

        res.status(201).json({
            success: true,
            message: "Thêm sạp thành công",
            data: result.rows[0]
        });

    } catch (error) {

        // Mã sạp bị trùng (UNIQUE constraint trên code)
        if (error.code === "23505") {
            return res.status(409).json({
                success: false,
                message: "Mã sạp đã tồn tại"
            });
        }

        // Khu vực hoặc chợ không tồn tại (FOREIGN KEY constraint)
        if (error.code === "23503") {
            return res.status(400).json({
                success: false,
                message: "market_id hoặc zone_id không tồn tại"
            });
        }

        res.status(500).json({
            success: false,
            message: error.message
        });

    }
});

// Sửa sạp
router.put("/:id", async (req, res) => {
    try {

        const { id } = req.params;
        const {
            market_id,
            zone_id,
            code,
            area_m2,
            monthly_rent,
            status
        } = req.body;

        const result = await pool.query(
            `
            UPDATE stalls SET
                market_id = COALESCE($1, market_id),
                zone_id = COALESCE($2, zone_id),
                code = COALESCE($3, code),
                area_m2 = COALESCE($4, area_m2),
                monthly_rent = COALESCE($5, monthly_rent),
                status = COALESCE($6, status)
            WHERE id = $7
            RETURNING *
            `,
            [
                market_id || null,
                zone_id || null,
                code || null,
                area_m2 || null,
                monthly_rent || null,
                status || null,
                id
            ]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy sạp"
            });
        }

        res.json({
            success: true,
            message: "Cập nhật sạp thành công",
            data: result.rows[0]
        });

    } catch (error) {

        if (error.code === "23505") {
            return res.status(409).json({
                success: false,
                message: "Mã sạp đã tồn tại"
            });
        }

        if (error.code === "23503") {
            return res.status(400).json({
                success: false,
                message: "market_id hoặc zone_id không tồn tại"
            });
        }

        res.status(500).json({
            success: false,
            message: error.message
        });

    }
});

// Xóa sạp
// CẢNH BÁO: đây là XÓA CỨNG (hard delete) — xóa vĩnh viễn toàn bộ hợp đồng,
// hóa đơn, lịch sử thanh toán, yêu cầu gia hạn, sản phẩm và đơn hàng liên
// quan đến sạp này. KHÔNG THỂ HOÀN TÁC. Nếu chỉ muốn ẩn sạp khỏi danh sách
// cho thuê mà vẫn giữ lịch sử, nên dùng cập nhật status (vd: 'closed') thay
// vì gọi endpoint này.
router.delete("/:id", async (req, res) => {

    const client = await pool.connect();

    try {

        const { id } = req.params;

        await client.query("BEGIN");

        // Khóa sạp trước để tránh race condition (vd: đang tạo hợp đồng/sản phẩm mới cùng lúc)
        const stallLock = await client.query(
            "SELECT id FROM stalls WHERE id = $1 FOR UPDATE",
            [id]
        );

        if (stallLock.rows.length === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy sạp"
            });
        }

        // 1) Contract installments: tham chiếu CẢ contract_id lẫn invoice_id
        //    (fee_invoices) -> phải xóa trước cả payments/fee_invoices/contracts
        await client.query(
            `DELETE FROM contract_installments
             WHERE contract_id IN (SELECT id FROM contracts WHERE stall_id = $1)`,
            [id]
        );

        // 2) Payments của các hóa đơn thuộc các hợp đồng của sạp này
        await client.query(
            `DELETE FROM payments
             WHERE invoice_id IN (
                 SELECT f.id FROM fee_invoices f
                 JOIN contracts c ON f.contract_id = c.id
                 WHERE c.stall_id = $1
             )`,
            [id]
        );

        // 3) Fee invoices của các hợp đồng thuộc sạp này
        await client.query(
            `DELETE FROM fee_invoices
             WHERE contract_id IN (SELECT id FROM contracts WHERE stall_id = $1)`,
            [id]
        );

        // 4) Yêu cầu gia hạn hợp đồng
        await client.query(
            `DELETE FROM contract_renewal_requests
             WHERE contract_id IN (SELECT id FROM contracts WHERE stall_id = $1)`,
            [id]
        );

        // 5) Cart items chứa sản phẩm của sạp này
        await client.query(
            `DELETE FROM cart_items
             WHERE product_id IN (SELECT id FROM products WHERE stall_id = $1)`,
            [id]
        );

        // 6) Order items chứa sản phẩm của sạp này
        //    LƯU Ý: đơn hàng lịch sử (orders) vẫn còn, chỉ dòng chi tiết sản phẩm
        //    (order_items) bị xóa -> đơn hàng cũ có thể mất dòng sản phẩm này.
        await client.query(
            `DELETE FROM order_items
             WHERE product_id IN (SELECT id FROM products WHERE stall_id = $1)`,
            [id]
        );

        // 7) Wishlist chứa sản phẩm của sạp này
        await client.query(
            `DELETE FROM wishlists
             WHERE product_id IN (SELECT id FROM products WHERE stall_id = $1)`,
            [id]
        );

        // 8) Đánh giá (feedback) — tham chiếu CẢ stall_id lẫn product_id, xóa theo cả 2 chiều
        await client.query(
            `DELETE FROM stall_feedbacks
             WHERE stall_id = $1
                OR product_id IN (SELECT id FROM products WHERE stall_id = $1)`,
            [id]
        );

        // 9) Yêu cầu thuê sạp (tên bảng thật: stall_rental_requests)
        await client.query(
            "DELETE FROM stall_rental_requests WHERE stall_id = $1",
            [id]
        );

        // 10) Products của sạp này
        await client.query(
            "DELETE FROM products WHERE stall_id = $1",
            [id]
        );

        // 11) Contracts của sạp này
        await client.query(
            "DELETE FROM contracts WHERE stall_id = $1",
            [id]
        );

        // 12) Cuối cùng, xóa sạp
        const result = await client.query(
            "DELETE FROM stalls WHERE id = $1 RETURNING id",
            [id]
        );

        await client.query("COMMIT");

        res.json({
            success: true,
            message: "Đã xóa sạp và toàn bộ dữ liệu liên quan thành công"
        });

    } catch (error) {

        await client.query("ROLLBACK");

        if (error.code === "23503") {
            return res.status(409).json({
                success: false,
                message: "Không thể xóa: vẫn còn dữ liệu khác tham chiếu tới sạp này (constraint: " + error.constraint + "). Vui lòng kiểm tra lại schema."
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

module.exports = router;