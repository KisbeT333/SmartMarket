const express = require("express");
const router = express.Router();

const pool = require("../db");

const verifyToken = require("../middleware/verifyToken");
const authorize = require("../middleware/authorize");
const { runBillingCycle } = require("../services/invoiceGenerator");



// =====================================
// GET ALL INVOICES
// =====================================

router.get("/", async(req,res)=>{

    try{

        const result =
        await pool.query(`

            SELECT

                f.id,

                f.total_amount,

                f.status,

                f.created_at,

                f.period AS contract_period,

                f.due_date,

                f.note,

                f.auto_generated,

                c.id AS contract_id,

                t.business_name,

                s.code AS stall_code,

                m.id AS market_id,

                m.name AS market_name


            FROM fee_invoices f


            JOIN contracts c
            ON f.contract_id = c.id


            JOIN traders t
            ON c.trader_id = t.id


            JOIN stalls s
            ON c.stall_id = s.id


            JOIN markets m
            ON s.market_id = m.id


            ORDER BY f.id DESC

        `);


        res.json({

            success:true,

            data:result.rows

        });


    }catch(error){

        res.status(500).json({

            success:false,

            message:error.message

        });

    }


});





// =====================================
// CREATE INVOICE
// =====================================


router.post("/", async(req,res)=>{


    try{


        const {

            contract_id,
            total_amount,
            period = null,
            due_date = null,
            note = null

        } = req.body;



        const result =
        await pool.query(`


            INSERT INTO fee_invoices

            (
                contract_id,
                total_amount,
                status,
                period,
                due_date,
                note,
                auto_generated
            )


            VALUES

            ($1,$2,'UNPAID',$3,$4,$5,FALSE)


            RETURNING *


        `,
        [
            contract_id,
            total_amount,
            period,
            due_date,
            note
        ]);



        res.status(201).json({

            success:true,

            message:"Tạo hóa đơn thành công",

            data:result.rows[0]

        });



    }catch(error){

        // Trùng kỳ thanh toán của cùng 1 hợp đồng (UNIQUE INDEX contract_id + period)
        if (error.code === "23505") {

            return res.status(409).json({

                success:false,

                message:"Hợp đồng này đã có hóa đơn cho kỳ thanh toán này rồi"

            });

        }

        res.status(500).json({

            success:false,

            message:error.message

        });

    }

});





// =====================================
// UPDATE STATUS
// =====================================


router.put("/:id/status", async(req,res)=>{


    try{


        const {
            status
        } = req.body;



        const result =
        await pool.query(`


            UPDATE fee_invoices

            SET status=$1

            WHERE id=$2


            RETURNING *


        `,
        [
            status,
            req.params.id
        ]);



        res.json({

            success:true,

            data:result.rows[0]

        });


    }catch(error){


        res.status(500).json({

            success:false,

            message:error.message

        });


    }


});




// =====================================
// RUN BILLING CYCLE (THỦ CÔNG)
// POST /api/invoices/run-billing
//
// Bình thường hệ thống tự chạy mỗi ngày lúc 00:10 (xem server.js + services/
// invoiceGenerator.js). Endpoint này cho phép ADMIN/MANAGER kích hoạt ngay
// lập tức: tạo hóa đơn cho các kỳ thanh toán vừa tới hạn (chưa có hóa đơn)
// + đánh dấu OVERDUE cho hóa đơn UNPAID đã quá hạn thanh toán.
// =====================================

router.post(
    "/run-billing",
    verifyToken,
    authorize("ADMIN", "MANAGER"),
    async (req, res) => {

        try {

            const result = await runBillingCycle();

            res.json({

                success: true,

                message: `Đã tạo ${result.created} hóa đơn mới, đánh dấu ${result.overdue} hóa đơn quá hạn.`,

                data: result

            });

        } catch (error) {

            res.status(500).json({

                success: false,

                message: error.message

            });

        }

    }
);




module.exports = router;