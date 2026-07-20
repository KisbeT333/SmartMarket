const express = require("express");
const router = express.Router();

const pool = require("../db");

const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit");


// ==========================================
// EXPORT ORDERS TO EXCEL
// GET /api/export/excel
// ==========================================

router.get("/excel", async (req, res) => {

    try {

        const result = await pool.query(`
            SELECT

                o.id,
                o.total_amount,
                o.created_at,

                t.business_name

            FROM orders o

            LEFT JOIN traders t
                ON o.trader_id = t.id

            ORDER BY o.id DESC
        `);

        const workbook =
            new ExcelJS.Workbook();

        const worksheet =
            workbook.addWorksheet(
                "Orders Report"
            );

        worksheet.columns = [

            {
                header: "Order ID",
                key: "id",
                width: 15
            },

            {
                header: "Trader",
                key: "business_name",
                width: 35
            },

            {
                header: "Total Amount",
                key: "total_amount",
                width: 20
            },

            {
                header: "Created At",
                key: "created_at",
                width: 30
            }

        ];

        result.rows.forEach(row => {

            worksheet.addRow({
                id: row.id,
                business_name:
                    row.business_name || "N/A",
                total_amount:
                    Number(row.total_amount),
                created_at:
                    row.created_at
            });

        });

        worksheet.getRow(1).font = {
            bold: true
        };

        res.setHeader(
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );

        res.setHeader(
            "Content-Disposition",
            "attachment; filename=orders.xlsx"
        );

        await workbook.xlsx.write(res);

        res.end();

    }
    catch (error) {

        console.error(error);

        res.status(500).json({

            success: false,
            message: error.message

        });

    }

});


// ==========================================
// EXPORT ORDERS TO PDF
// GET /api/export/pdf
// ==========================================

router.get("/pdf", async (req, res) => {

    try {

        const result = await pool.query(`
            SELECT

                o.id,
                o.total_amount,
                o.created_at,

                t.business_name

            FROM orders o

            LEFT JOIN traders t
                ON o.trader_id = t.id

            ORDER BY o.id DESC
        `);

        const doc =
            new PDFDocument({
                margin: 40
            });

        res.setHeader(
            "Content-Type",
            "application/pdf"
        );

        res.setHeader(
            "Content-Disposition",
            "attachment; filename=orders.pdf"
        );

        doc.pipe(res);

        doc.fontSize(20)
            .text(
                "SMART MARKET REPORT",
                {
                    align: "center"
                }
            );

        doc.moveDown();

        doc.fontSize(12);

        result.rows.forEach(item => {

            doc.text(
                `Order #${item.id}`
            );

            doc.text(
                `Trader: ${item.business_name || "N/A"}`
            );

            doc.text(
                `Amount: ${Number(item.total_amount).toLocaleString("vi-VN")} VND`
            );

            doc.text(
                `Date: ${item.created_at}`
            );

            doc.moveDown();

        });

        doc.end();

    }
    catch (error) {

        console.error(error);

        res.status(500).json({

            success: false,
            message: error.message

        });

    }

});


// ==========================================
// EXPORT SUMMARY REPORT
// GET /api/export/summary
// ==========================================

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

            data: {

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

                revenue:
                    Number(
                        revenue.rows[0].total
                    )

            }

        });

    }
    catch (error) {

        console.error(error);

        res.status(500).json({

            success: false,
            message: error.message

        });

    }

});

module.exports = router;