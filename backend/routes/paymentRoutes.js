const express = require("express");
const router = express.Router();
const pool = require("../db");


// =====================================
// GET ALL PAYMENTS
// =====================================

router.get("/", async (req, res) => {

    try {

        const result = await pool.query(`
            SELECT

                p.id,
                p.amount,
                p.method,
                p.payment_date,

                f.id AS invoice_id,
                f.total_amount,

                t.business_name

            FROM payments p

            JOIN fee_invoices f
                ON p.invoice_id = f.id

            JOIN contracts c
                ON f.contract_id = c.id

            JOIN traders t
                ON c.trader_id = t.id

            ORDER BY p.id DESC
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


// =====================================
// GET PAYMENT BY ID
// =====================================

router.get("/:id", async (req, res) => {

    try {

        const result = await pool.query(
            `
            SELECT *
            FROM payments
            WHERE id = $1
            `,
            [req.params.id]
        );

        if (result.rows.length === 0) {

            return res.status(404).json({
                success: false,
                message: "Không tìm thấy thanh toán"
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


// =====================================
// CREATE PAYMENT
// =====================================

router.post("/", async (req, res) => {

    const client = await pool.connect();

    try {

        await client.query("BEGIN");

        const {
            invoice_id,
            amount,
            method
        } = req.body;

        const payment = await client.query(
            `
            INSERT INTO payments
            (
                invoice_id,
                amount,
                method
            )
            VALUES
            ($1,$2,$3)

            RETURNING *
            `,
            [
                invoice_id,
                amount,
                method
            ]
        );

        await client.query(
            `
            UPDATE fee_invoices
            SET status = 'PAID'
            WHERE id = $1
            `,
            [invoice_id]
        );

        await client.query("COMMIT");

        res.status(201).json({
            success: true,
            message: "Thanh toán thành công",
            data: payment.rows[0]
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


// =====================================
// DELETE PAYMENT
// =====================================

router.delete("/:id", async (req, res) => {

    try {

        await pool.query(
            `
            DELETE FROM payments
            WHERE id = $1
            `,
            [req.params.id]
        );

        res.json({
            success: true,
            message: "Xóa thanh toán thành công"
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: error.message
        });

    }

});

module.exports = router;