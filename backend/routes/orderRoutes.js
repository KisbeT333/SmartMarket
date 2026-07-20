const express = require("express");
const router = express.Router();

const pool = require("../db");


// =======================================
// LỊCH SỬ MUA HÀNG — tra cứu tất cả đơn theo SĐT
// GET /api/orders/history?phone=09xxxxxxxx
// Không cần đăng nhập — dùng SĐT làm định danh nhẹ cho khách vãng lai
// lẫn khách đã có tài khoản (tra được cả 2 loại nếu trùng SĐT).
// =======================================

router.get("/history", async (req, res) => {

    try {

        const phone = String(req.query.phone || "").replace(/[\s.-]/g, "");

        if (!phone || !/^(0|\+84)\d{9,10}$/.test(phone)) {
            return res.status(400).json({
                success: false,
                message: "Số điện thoại không hợp lệ"
            });
        }

        const result = await pool.query(
            `
            SELECT
                o.id, o.order_code,
                o.payment_method, o.status, o.total_amount, o.created_at,
                (o.customer_id IS NULL) AS is_guest,
                t.business_name
            FROM orders o
            LEFT JOIN users   u ON u.id = o.customer_id
            LEFT JOIN traders t ON t.id = o.trader_id
            WHERE COALESCE(u.phone, o.guest_phone) = $1
            ORDER BY o.created_at DESC
            `,
            [phone]
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



// =======================================
// GET ALL ORDERS
// Hỗ trợ lọc: ?trader_id=..&status=..&customer_id=..
// (trader chỉ xem đơn của mình, admin/manager xem tất cả)
// =======================================

router.get("/", async (req, res) => {

    try {

        const { trader_id, status, customer_id } = req.query;

        const conditions = [];
        const values = [];

        if (trader_id) {
            values.push(trader_id);
            conditions.push(`o.trader_id = $${values.length}`);
        }

        if (status) {
            values.push(status);
            conditions.push(`o.status = $${values.length}`);
        }

        if (customer_id) {
            values.push(customer_id);
            conditions.push(`o.customer_id = $${values.length}`);
        }

        const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

        const result = await pool.query(
            `
            SELECT

                o.id,
                o.order_code,

                o.customer_id,
                o.trader_id,

                COALESCE(u.full_name, o.guest_name) AS customer_name,
                COALESCE(u.phone, o.guest_phone)     AS customer_phone,
                (o.customer_id IS NULL)              AS is_guest,

                o.guest_address,
                o.guest_note,

                t.business_name,

                o.payment_method,
                o.status,

                o.total_amount,

                o.created_at

            FROM orders o
            LEFT JOIN users   u ON u.id = o.customer_id
            LEFT JOIN traders t ON t.id = o.trader_id

            ${where}

            ORDER BY o.id DESC
            `,
            values
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



// =======================================
// GET ORDER DETAIL (kèm order_items) — dùng cho trang chi tiết đơn
// của tiểu thương / admin manager
// =======================================

router.get("/:id/detail", async (req, res) => {

    try {

        const { id } = req.params;

        const orderRes = await pool.query(
            `
            SELECT
                o.id, o.order_code, o.customer_id, o.trader_id,
                COALESCE(u.full_name, o.guest_name) AS customer_name,
                COALESCE(u.phone, o.guest_phone)     AS customer_phone,
                (o.customer_id IS NULL)              AS is_guest,
                o.guest_address, o.guest_note,
                t.business_name,
                o.payment_method, o.status, o.total_amount, o.created_at
            FROM orders o
            LEFT JOIN users   u ON u.id = o.customer_id
            LEFT JOIN traders t ON t.id = o.trader_id
            WHERE o.id = $1
            `,
            [id]
        );

        if (orderRes.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy đơn hàng"
            });
        }

        const itemsRes = await pool.query(
            `
            SELECT oi.product_id, oi.quantity, oi.price, p.name AS product_name
            FROM order_items oi
            JOIN products p ON p.id = oi.product_id
            WHERE oi.order_id = $1
            `,
            [id]
        );

        res.json({
            success: true,
            data: { ...orderRes.rows[0], items: itemsRes.rows }
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: error.message
        });

    }

});



// =======================================
// CẬP NHẬT TRẠNG THÁI ĐƠN HÀNG
// Dùng cho tiểu thương/admin đánh dấu "đã hoàn thành", "đã hủy"...
// Body: { status: "pending" | "confirmed" | "completed" | "cancelled" }
// =======================================

const ALLOWED_STATUSES = ["pending", "confirmed", "completed", "cancelled"];

router.patch("/:id/status", async (req, res) => {

    try {

        const { id } = req.params;
        const { status } = req.body;

        if (!ALLOWED_STATUSES.includes(status)) {
            return res.status(400).json({
                success: false,
                message: `Trạng thái không hợp lệ. Chỉ chấp nhận: ${ALLOWED_STATUSES.join(", ")}`
            });
        }

        const result = await pool.query(
            `UPDATE orders SET status = $1 WHERE id = $2 RETURNING *`,
            [status, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy đơn hàng"
            });
        }

        res.json({
            success: true,
            message: "Cập nhật trạng thái thành công",
            data: result.rows[0]
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: error.message
        });

    }

});



// =======================================
// CREATE ORDER — KHÁCH VÃNG LAI (không cần đăng nhập)
// Body: { name, phone, address, note, payment_method, items:[{product_id,quantity}] }
// Lưu ý: đặt route này TRƯỚC "/:customerId" vì cả hai đều là POST,
// nếu không Express sẽ hiểu "guest" chính là customerId.
// =======================================

router.post("/guest", async (req, res) => {

    const client = await pool.connect();

    try {

        const {
            name,
            phone,
            address,
            note,
            payment_method,
            items
        } = req.body;

        // ---- validate cơ bản ----
        const phoneDigits = String(phone || "").replace(/[\s.-]/g, "");

        if (!phoneDigits || !/^(0|\+84)\d{9,10}$/.test(phoneDigits)) {
            return res.status(400).json({
                success: false,
                message: "Số điện thoại không hợp lệ"
            });
        }

        if (!address || !String(address).trim()) {
            return res.status(400).json({
                success: false,
                message: "Vui lòng nhập địa chỉ giao hàng"
            });
        }

        const method = ["cod", "bank"].includes(payment_method) ? payment_method : "cod";

        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Giỏ hàng trống"
            });
        }

        await client.query("BEGIN");

        // ---- tra giá & trader_id từ DB (không tin giá client gửi lên) ----
        let total = 0;
        let traderId = null;
        const resolvedItems = [];

        for (const raw of items) {

            const productId = Number(raw.product_id);
            const quantity = Number(raw.quantity);

            if (!productId || !quantity || quantity <= 0) {
                await client.query("ROLLBACK");
                return res.status(400).json({
                    success: false,
                    message: "Sản phẩm trong giỏ hàng không hợp lệ"
                });
            }

            const pRes = await client.query(
                `SELECT id, price, trader_id FROM products WHERE id = $1`,
                [productId]
            );

            if (pRes.rows.length === 0) {
                await client.query("ROLLBACK");
                return res.status(400).json({
                    success: false,
                    message: `Sản phẩm #${productId} không còn tồn tại`
                });
            }

            const product = pRes.rows[0];
            if (traderId === null) traderId = product.trader_id;

            total += Number(product.price) * quantity;
            resolvedItems.push({
                product_id: productId,
                quantity,
                price: product.price
            });

        }

        const orderCode = "SM" + Date.now().toString(36).toUpperCase();

        // ---- tạo order (customer_id = NULL vì là khách vãng lai) ----
        const order = await client.query(
            `
            INSERT INTO orders
            (
                customer_id,
                trader_id,
                total_amount,
                payment_method,
                status,
                guest_name,
                guest_phone,
                guest_address,
                guest_note,
                order_code
            )
            VALUES
            (NULL, $1, $2, $3, 'pending', $4, $5, $6, $7, $8)

            RETURNING *
            `,
            [
                traderId,
                total,
                method,
                name || null,
                phoneDigits,
                address,
                note || null,
                orderCode
            ]
        );

        const orderId = order.rows[0].id;

        // ---- tạo order_items ----
        for (const item of resolvedItems) {

            await client.query(
                `
                INSERT INTO order_items
                (
                    order_id,
                    product_id,
                    quantity,
                    price
                )
                VALUES
                ($1,$2,$3,$4)
                `,
                [
                    orderId,
                    item.product_id,
                    item.quantity,
                    item.price
                ]
            );

        }

        await client.query("COMMIT");

        res.status(201).json({
            success: true,
            message: "Đặt hàng thành công",
            order_id: orderId,
            order_code: orderCode,
            total_amount: total
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



// =======================================
// CREATE ORDER FROM CART
// =======================================

router.post("/:customerId", async (req, res) => {

    const client =
    await pool.connect();

    try {

        await client.query("BEGIN");

        const customerId =
        req.params.customerId;

        // lấy giỏ hàng

        const cart =
        await client.query(
            `
            SELECT

                c.product_id,
                c.quantity,

                p.price,
                p.trader_id

            FROM cart_items c

            JOIN products p
            ON c.product_id = p.id

            WHERE c.customer_id = $1
            `,
            [customerId]
        );

        if (cart.rows.length === 0) {

            await client.query(
                "ROLLBACK"
            );

            return res.status(400).json({
                success: false,
                message: "Giỏ hàng trống"
            });

        }

        let total = 0;

        cart.rows.forEach(item => {

            total +=
                Number(item.price) *
                Number(item.quantity);

        });

        const traderId =
        cart.rows[0].trader_id;

        // tạo order

        const order =
        await client.query(
            `
            INSERT INTO orders
            (
                customer_id,
                trader_id,
                total_amount
            )
            VALUES
            ($1,$2,$3)

            RETURNING *
            `,
            [
                customerId,
                traderId,
                total
            ]
        );

        const orderId =
        order.rows[0].id;

        // tạo order_items

        for (const item of cart.rows) {

            await client.query(
                `
                INSERT INTO order_items
                (
                    order_id,
                    product_id,
                    quantity,
                    price
                )
                VALUES
                ($1,$2,$3,$4)
                `,
                [
                    orderId,
                    item.product_id,
                    item.quantity,
                    item.price
                ]
            );

        }

        // xóa cart

        await client.query(
            `
            DELETE FROM cart_items
            WHERE customer_id = $1
            `,
            [customerId]
        );

        await client.query(
            "COMMIT"
        );

        res.status(201).json({
            success: true,
            message: "Tạo đơn hàng thành công",
            order_id: orderId,
            total_amount: total
        });

    } catch (error) {

        await client.query(
            "ROLLBACK"
        );

        res.status(500).json({
            success: false,
            message: error.message
        });

    } finally {

        client.release();

    }

});

module.exports = router;