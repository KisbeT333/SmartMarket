const express = require("express");
const router = express.Router();

const pool = require("../db");
const { generateDueInvoices } = require("../services/invoiceGenerator");



// ======================================================
// GET ALL CONTRACTS
// GET /api/contracts
// ======================================================

router.get("/", async (req,res)=>{

    try {


        // SỬA: bổ sung c.stall_id (trước đây KHÔNG được select) — đây là lý do
        // trang "Sạp" ở frontend không bao giờ khớp được hợp đồng active với
        // sạp tương ứng (so sánh contract.stall_id với stall.id luôn ra
        // undefined !== id), khiến ô "Người thuê" không hiện hoặc hiện sai.
        //
        // SỬA: bổ sung mảng "installments" tổng hợp từ fee_invoices (+ ngày
        // thanh toán thật lấy từ payments) cho từng hợp đồng, để frontend
        // không phải tự đoán trạng thái từng kỳ (luôn ra UNPAID kể cả khi đã
        // thu tiền) mà lấy đúng dữ liệu hóa đơn/thanh toán thật trong DB.
        const result = await pool.query(`

            SELECT

                c.id,

                c.stall_id,

                c.start_date,

                c.end_date,

                c.monthly_rent,

                c.payment_step_months,

                c.status,


                t.id AS trader_id,

                t.business_name,


                u.full_name AS trader_name,

                u.phone,


                s.code AS stall_code,


                m.id AS market_id,

                m.name AS market_name,


                COALESCE(inst.installments, '[]'::json) AS installments


            FROM contracts c


            JOIN traders t
                ON c.trader_id = t.id


            JOIN users u
                ON t.user_id = u.id


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


            ORDER BY c.id DESC


        `);



        res.json({

            success:true,

            count:result.rows.length,

            data:result.rows

        });



    }catch(error){


        res.status(500).json({

            success:false,

            message:error.message

        });

    }

});






// ======================================================
// GET CONTRACT BY ID
// GET /api/contracts/:id
// ======================================================

router.get("/:id", async(req,res)=>{


    try{


        const result = await pool.query(`


            SELECT


                c.*,


                t.business_name,


                u.full_name,


                u.phone,


                s.code AS stall_code,


                m.name AS market_name,


                COALESCE(inst.installments, '[]'::json) AS installments



            FROM contracts c



            JOIN traders t

            ON c.trader_id=t.id



            JOIN users u

            ON t.user_id=u.id



            JOIN stalls s

            ON c.stall_id=s.id



            JOIN markets m

            ON s.market_id=m.id



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



            WHERE c.id=$1



        `,[req.params.id]);




        if(result.rows.length===0){


            return res.status(404).json({

                success:false,

                message:"Không tìm thấy hợp đồng"

            });


        }



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






// ======================================================
// CREATE CONTRACT
// POST /api/contracts
//
// SỬA 2 lỗi so với bản gốc:
// 1) Check trùng hợp đồng dùng status='ACTIVE' (chữ hoa) nhưng giá trị thật
//    trong DB là 'active' (chữ thường) -> check không bao giờ khớp, cho phép
//    tạo nhiều hợp đồng "active" trên cùng 1 sạp. Đã sửa thành 'active'.
// 2) Tạo hợp đồng xong KHÔNG cập nhật stalls.status -> sạp vẫn hiện "available"
//    dù đã có người thuê. Đã thêm UPDATE stalls trong transaction.
// ======================================================

router.post("/", async(req,res)=>{

    const client = await pool.connect();

    try{

        await client.query("BEGIN");

        const {


            trader_id,

            stall_id,

            start_date,

            end_date,

            monthly_rent,

            payment_step_months,

            status


        }=req.body;



        if(

            !trader_id ||

            !stall_id ||

            !start_date ||

            !end_date

        ){

            await client.query("ROLLBACK");

            return res.status(400).json({

                success:false,

                message:"Thiếu dữ liệu hợp đồng"

            });

        }



        const finalStatus = status || "active";

        // Mặc định thanh toán hàng tháng (1) nếu không truyền lên
        const finalPaymentStep =
            Number(payment_step_months) > 0
                ? Number(payment_step_months)
                : 1;



        // kiểm tra quầy đã có hợp đồng còn hiệu lực chưa
        // SỬA: 'ACTIVE' -> 'active' để khớp đúng giá trị thật trong DB

        const check = await client.query(`


            SELECT *

            FROM contracts


            WHERE stall_id=$1

            AND status='active'



        `,[stall_id]);




        if(check.rows.length>0){

            await client.query("ROLLBACK");

            return res.status(400).json({

                success:false,

                message:"Quầy này đang có hợp đồng"

            });

        }



        // Đảm bảo sạp đang tồn tại trước khi tạo hợp đồng + đổi trạng thái

        const stallCheck = await client.query(
            "SELECT id, status FROM stalls WHERE id = $1",
            [stall_id]
        );

        if (stallCheck.rows.length === 0) {

            await client.query("ROLLBACK");

            return res.status(404).json({
                success: false,
                message: "Không tìm thấy sạp"
            });

        }



        const result = await client.query(`


            INSERT INTO contracts


            (

                trader_id,

                stall_id,

                start_date,

                end_date,

                monthly_rent,

                payment_step_months,

                status

            )


            VALUES

            ($1,$2,$3,$4,$5,$6,$7)


            RETURNING *


        `,[


            trader_id,

            stall_id,

            start_date,

            end_date,

            monthly_rent,

            finalPaymentStep,

            finalStatus


        ]);



        // MỚI: đồng bộ trạng thái sạp sang "rented" khi hợp đồng tạo ra có status active
        // (giữ nguyên giá trị status khác, vd "pending", không động vào sạp trong trường hợp đó)

        if (finalStatus === "active") {

            await client.query(
                "UPDATE stalls SET status = 'rented' WHERE id = $1",
                [stall_id]
            );

        }



        await client.query("COMMIT");

        // Tạo ngay hóa đơn cho (các) kỳ thanh toán đã tới hạn của hợp đồng vừa
        // tạo, thay vì bắt tiểu thương đợi tới lần chạy cron kế tiếp (00:10).
        // Không rollback hợp đồng nếu bước này lỗi — chỉ log, cron sẽ tự bù sau.
        if (finalStatus === "active") {

            generateDueInvoices().catch((err) =>
                console.error("[billing] Lỗi tạo hóa đơn ngay sau khi tạo hợp đồng:", err)
            );

        }



        res.status(201).json({

            success:true,

            message:"Tạo hợp đồng thành công",

            data:result.rows[0]

        });



    }catch(error){


        await client.query("ROLLBACK");

        res.status(500).json({

            success:false,

            message:error.message

        });

    } finally {

        client.release();

    }


});







// ======================================================
// UPDATE CONTRACT
// PUT /api/contracts/:id
//
// SỬA: khi đổi status sang "active", đồng bộ luôn stalls.status = 'rented'.
// Khi đổi status sang "expired", trả sạp về "available" để có thể cho thuê lại.
// ======================================================


router.put("/:id", async(req,res)=>{

    const client = await pool.connect();

    try{

        await client.query("BEGIN");

        const {


            start_date,

            end_date,

            monthly_rent,

            payment_step_months,

            status


        }=req.body;




        const result = await client.query(`


            UPDATE contracts


            SET


                start_date=COALESCE($1, start_date),

                end_date=COALESCE($2, end_date),

                monthly_rent=COALESCE($3, monthly_rent),

                payment_step_months=COALESCE($4, payment_step_months),

                status=COALESCE($5, status)



            WHERE id=$6



            RETURNING *



        `,[


            start_date || null,

            end_date || null,

            monthly_rent || null,

            payment_step_months || null,

            status || null,

            req.params.id


        ]);




        if(result.rows.length===0){

            await client.query("ROLLBACK");

            return res.status(404).json({

                success:false,

                message:"Không tìm thấy hợp đồng"

            });

        }



        // MỚI: đồng bộ trạng thái sạp theo trạng thái hợp đồng mới (nếu status có đổi)

        if (status === "active") {

            await client.query(
                "UPDATE stalls SET status = 'rented' WHERE id = $1",
                [result.rows[0].stall_id]
            );

        } else if (status === "expired") {

            await client.query(
                "UPDATE stalls SET status = 'available' WHERE id = $1",
                [result.rows[0].stall_id]
            );

        }



        await client.query("COMMIT");

        if (status === "active") {

            generateDueInvoices().catch((err) =>
                console.error("[billing] Lỗi tạo hóa đơn ngay sau khi cập nhật hợp đồng:", err)
            );

        }



        res.json({

            success:true,

            message:"Cập nhật hợp đồng thành công",

            data:result.rows[0]

        });



    }catch(error){

        await client.query("ROLLBACK");

        res.status(500).json({

            success:false,

            message:error.message

        });

    } finally {

        client.release();

    }


});







// ======================================================
// PAY INSTALLMENT (THU TIỀN THEO KỲ)
// POST /api/contracts/:id/pay-installment
// Body: { period, amount, method }
//
// MỚI: endpoint này trước đây KHÔNG TỒN TẠI ở backend, khiến frontend luôn
// gọi thất bại (404) và rơi vào nhánh dự phòng (tạo hóa đơn + thanh toán rời
// rạc, không gắn với "period" nào) — hậu quả là thu tiền xong nhưng kỳ đó
// vẫn hiển thị "chưa thanh toán" vì không có gì liên kết ngược lại.
//
// Endpoint này tìm đúng hóa đơn (fee_invoices) của hợp đồng theo
// (contract_id, period); nếu kỳ đó chưa có hóa đơn (vd: thu trước hạn) thì
// tạo mới, sau đó ghi nhận payment và cập nhật hóa đơn đó sang PAID. Nhờ vậy
// GET /api/contracts trả về installments luôn phản ánh đúng thực tế.
// ======================================================

router.post("/:id/pay-installment", async (req, res) => {

    const client = await pool.connect();

    try {

        const contractId = req.params.id;
        const { period, amount, method } = req.body;

        if (!period || !amount) {
            return res.status(400).json({
                success: false,
                message: "Thiếu dữ liệu: period, amount là bắt buộc"
            });
        }

        await client.query("BEGIN");

        // Khóa hợp đồng để tránh race condition khi thu 2 lần cùng lúc
        const contractCheck = await client.query(
            "SELECT id, stall_id FROM contracts WHERE id = $1 FOR UPDATE",
            [contractId]
        );

        if (contractCheck.rows.length === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy hợp đồng"
            });
        }

        // Tìm hóa đơn đã có cho đúng kỳ này (do cron tự sinh hoặc do lần thu trước)
        let invoiceResult = await client.query(
            `
            SELECT id, status, total_amount
            FROM fee_invoices
            WHERE contract_id = $1 AND period = $2
            FOR UPDATE
            `,
            [contractId, period]
        );

        let invoice;

        if (invoiceResult.rows.length === 0) {

            // Chưa có hóa đơn cho kỳ này -> tạo mới, gắn đúng period để
            // không bị trùng/tách rời với hóa đơn hệ thống tự sinh sau này
            const created = await client.query(
                `
                INSERT INTO fee_invoices
                    (contract_id, total_amount, status, period, note, auto_generated)
                VALUES
                    ($1, $2, 'UNPAID', $3, $4, FALSE)
                RETURNING id, status, total_amount
                `,
                [contractId, amount, period, `Kỳ ${period}`]
            );

            invoice = created.rows[0];

        } else {

            invoice = invoiceResult.rows[0];

        }

        if (invoice.status === "PAID") {
            await client.query("ROLLBACK");
            return res.status(409).json({
                success: false,
                message: "Kỳ thanh toán này đã được thu tiền trước đó"
            });
        }

        const payment = await client.query(
            `
            INSERT INTO payments
                (invoice_id, amount, method)
            VALUES
                ($1, $2, $3)
            RETURNING *
            `,
            [invoice.id, amount, (method || "CASH").toUpperCase()]
        );

        const updatedInvoice = await client.query(
            `
            UPDATE fee_invoices
            SET status = 'PAID'
            WHERE id = $1
            RETURNING *
            `,
            [invoice.id]
        );

        await client.query("COMMIT");

        res.status(201).json({
            success: true,
            message: `Đã thu tiền kỳ ${period}`,
            data: {
                payment: payment.rows[0],
                invoice: updatedInvoice.rows[0]
            }
        });

    } catch (error) {

        await client.query("ROLLBACK");

        // Trùng kỳ (UNIQUE contract_id + period) — race condition hiếm gặp
        if (error.code === "23505") {
            return res.status(409).json({
                success: false,
                message: "Kỳ thanh toán này vừa được xử lý, vui lòng tải lại trang"
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




// ======================================================
// DELETE CONTRACT
// DELETE /api/contracts/:id
//
// SỬA: trả sạp về "available" khi xóa hợp đồng, tránh sạp bị "kẹt" ở
// trạng thái "rented" mãi mãi sau khi hợp đồng gắn với nó bị xóa.
// ======================================================

router.delete("/:id", async(req,res)=>{

    const client = await pool.connect();

    try{

        await client.query("BEGIN");

        // Kiểm tra trước: hợp đồng đã có hóa đơn liên kết chưa (tránh lỗi FK 500 khó hiểu)
        const invoiceCheck = await client.query(
            "SELECT COUNT(*) FROM fee_invoices WHERE contract_id = $1",
            [req.params.id]
        );

        if (parseInt(invoiceCheck.rows[0].count) > 0) {

            await client.query("ROLLBACK");

            return res.status(409).json({

                success:false,

                message:"Không thể xóa: hợp đồng này đã có hóa đơn liên kết. Vui lòng chuyển hợp đồng sang trạng thái 'expired' thay vì xóa."

            });

        }

        const result = await client.query(`


            DELETE FROM contracts

            WHERE id=$1

            RETURNING *



        `,[req.params.id]);



        if(result.rows.length===0){

            await client.query("ROLLBACK");

            return res.status(404).json({

                success:false,

                message:"Không tìm thấy hợp đồng"

            });


        }



        await client.query(
            "UPDATE stalls SET status = 'available' WHERE id = $1",
            [result.rows[0].stall_id]
        );



        await client.query("COMMIT");




        res.json({

            success:true,

            message:"Xóa hợp đồng thành công"

        });



    }catch(error){

        await client.query("ROLLBACK");

        res.status(500).json({

            success:false,

            message:error.message

        });

    } finally {

        client.release();

    }


});




module.exports = router;