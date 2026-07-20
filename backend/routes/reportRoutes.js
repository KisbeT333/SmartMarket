const express = require("express");
const router = express.Router();
const pool = require("../db");

router.get("/summary", async (req, res) => {

    try {

        const traders =
            await pool.query(
                "SELECT COUNT(*) FROM traders"
            );

        const products =
            await pool.query(
                "SELECT COUNT(*) FROM products"
            );

        const orders =
            await pool.query(
                "SELECT COUNT(*) FROM orders"
            );

        const stalls =
            await pool.query(
                "SELECT COUNT(*) FROM stalls"
            );

        // SỬA: stalls.status lưu 'rented' (xem stallRoutes.js/contractRoutes.js),
        // không phải 'OCCUPIED' -> số sạp "đang thuê" trong báo cáo trước đây
        // luôn ra 0 dù thực tế đã có sạp cho thuê.
        const occupied =
            await pool.query(`
                SELECT COUNT(*)
                FROM stalls
                WHERE status='rented'
            `);

        const unpaid =
            await pool.query(`
                SELECT COUNT(*)
                FROM fee_invoices
                WHERE status IN ('UNPAID', 'OVERDUE')
            `);

        const overdueOnly =
            await pool.query(`
                SELECT COUNT(*)
                FROM fee_invoices
                WHERE status = 'OVERDUE'
            `);

        const revenue =
            await pool.query(`
                SELECT
                COALESCE(
                    SUM(amount),
                    0
                ) AS total
                FROM payments
            `);

        res.json({

            success: true,

            traders:
                Number(
                    traders.rows[0].count
                ),

            products:
                Number(
                    products.rows[0].count
                ),

            orders:
                Number(
                    orders.rows[0].count
                ),

            stalls:
                Number(
                    stalls.rows[0].count
                ),

            occupied:
                Number(
                    occupied.rows[0].count
                ),

            unpaid:
                Number(
                    unpaid.rows[0].count
                ),

            overdue:
                Number(
                    overdueOnly.rows[0].count
                ),

            revenue:
                Number(
                    revenue.rows[0].total
                )

        });

    } catch (error) {

        res.status(500).json({

            success: false,
            message: error.message

        });

    }

});
router.get("/recent-orders", async(req,res)=>{

    try{

        const result =
        await pool.query(`

        SELECT

            o.id,

            u.full_name,

            t.business_name,

            o.total_amount,

            o.created_at

        FROM orders o

        JOIN users u
        ON o.customer_id=u.id

        JOIN traders t
        ON o.trader_id=t.id

        ORDER BY o.id DESC

        LIMIT 10

        `);

        res.json({

            success:true,

            data:result.rows

        });

    }
    catch(error){

        res.status(500).json({

            success:false,

            message:error.message

        });

    }

});
router.get("/revenue-monthly", async (req, res) => {

    try {

        const result = await pool.query(`
            SELECT

                EXTRACT(
                    MONTH
                    FROM payment_date
                ) AS month,

                SUM(amount) AS revenue

            FROM payments

            GROUP BY month

            ORDER BY month
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
router.get("/top-traders", async (req, res) => {

    try {

        const result = await pool.query(`
            SELECT

                t.business_name,

                COUNT(o.id) AS total_orders

            FROM traders t

            LEFT JOIN orders o
                ON t.id = o.trader_id

            GROUP BY
                t.business_name

            ORDER BY
                total_orders DESC

            LIMIT 5
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
router.get("/stall-status", async (req, res) => {

    try {

        const result = await pool.query(`
            SELECT

                status,

                COUNT(*) AS total

            FROM stalls

            GROUP BY status
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

module.exports = router;