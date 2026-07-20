const express = require("express");
const router = express.Router();
const pool = require("../db");


// =====================================
// GET CART
// /api/cart/:customerId
// =====================================

router.get("/:customerId", async (req, res) => {

    try {

        const result = await pool.query(
            `
            SELECT

                c.id,
                c.quantity,

                p.id AS product_id,
                p.name,
                p.price,
                p.image_url

            FROM cart_items c

            JOIN products p
            ON c.product_id = p.id

            WHERE c.customer_id = $1
            `,
            [req.params.customerId]
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



// =====================================
// ADD TO CART
// /api/cart
// Nếu sản phẩm đã có trong giỏ của khách thì cộng dồn quantity,
// nếu chưa có thì tạo dòng mới (giữ nguyên hành vi gốc cho trường hợp này).
// =====================================

router.post("/", async (req, res) => {

    try {

        const {
            customer_id,
            product_id,
            quantity
        } = req.body;

        if (!customer_id || !product_id) {
            return res.status(400).json({
                success: false,
                message: "Thiếu thông tin bắt buộc: customer_id, product_id"
            });
        }

        const qtyToAdd = quantity || 1;

        // Kiểm tra sản phẩm này đã có trong giỏ của khách chưa
        const existing = await pool.query(
            `
            SELECT id, quantity
            FROM cart_items
            WHERE customer_id = $1 AND product_id = $2
            `,
            [customer_id, product_id]
        );

        let result;

        if (existing.rows.length > 0) {
            // Đã có: cộng dồn số lượng
            result = await pool.query(
                `
                UPDATE cart_items
                SET quantity = quantity + $1
                WHERE id = $2
                RETURNING *
                `,
                [qtyToAdd, existing.rows[0].id]
            );
        } else {
            // Chưa có: tạo dòng mới
            result = await pool.query(
                `
                INSERT INTO cart_items
                (
                    customer_id,
                    product_id,
                    quantity
                )
                VALUES
                ($1,$2,$3)

                RETURNING *
                `,
                [
                    customer_id,
                    product_id,
                    qtyToAdd
                ]
            );
        }

        res.status(201).json({
            success: true,
            message: "Thêm vào giỏ hàng thành công",
            data: result.rows[0]
        });

    } catch (error) {

        if (error.code === "23503") {
            return res.status(400).json({
                success: false,
                message: "customer_id hoặc product_id không tồn tại"
            });
        }

        res.status(500).json({
            success: false,
            message: error.message
        });

    }

});



// =====================================
// UPDATE CART ITEM QUANTITY
// PUT /api/cart/:id
// =====================================

router.put("/:id", async (req, res) => {

    try {

        const { quantity } = req.body;

        if (!quantity || quantity < 1) {
            return res.status(400).json({
                success: false,
                message: "Số lượng phải lớn hơn 0"
            });
        }

        const result = await pool.query(
            `
            UPDATE cart_items
            SET quantity = $1
            WHERE id = $2
            RETURNING *
            `,
            [quantity, req.params.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy sản phẩm trong giỏ hàng"
            });
        }

        res.json({
            success: true,
            message: "Cập nhật số lượng thành công",
            data: result.rows[0]
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: error.message
        });

    }

});



// =====================================
// DELETE CART ITEM
// /api/cart/:id
// =====================================

router.delete("/:id", async (req, res) => {

    try {

        await pool.query(
            `
            DELETE FROM cart_items
            WHERE id = $1
            `,
            [req.params.id]
        );

        res.json({
            success: true,
            message: "Xóa khỏi giỏ hàng thành công"
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: error.message
        });

    }

});

module.exports = router;