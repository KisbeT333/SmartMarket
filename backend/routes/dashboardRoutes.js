const express = require("express");
const router = express.Router();

const pool = require("../db");


// Chạy 1 câu COUNT(*) độc lập: nếu bảng lỗi (sai tên, chưa tồn tại, mất kết nối...)
// chỉ số liệu đó về 0 và log rõ ra console — KHÔNG làm sập toàn bộ /api/dashboard
// (trước đây nếu 1 trong các query ném lỗi, toàn bộ try{} rớt xuống catch và
// TOÀN BỘ số liệu, bao gồm cả những số đã lấy được, đều không trả về nữa).
async function safeCount(label, sql) {
    try {
        const r = await pool.query(sql);
        return Number(r.rows[0].count) || 0;
    } catch (err) {
        console.error(`[dashboard] Lỗi truy vấn "${label}":`, err.message);
        return 0;
    }
}




router.get("/", async (req, res) => {

    try {

        // Mỗi số liệu chạy độc lập qua safeCount — nếu bảng "traders" (hay bất
        // kỳ bảng nào khác) bị lỗi tên/không tồn tại, chỉ riêng số đó về 0 và
        // được log ra console, các số liệu còn lại vẫn hiển thị bình thường.
        const [
            users,
            traders,
            markets,
            stalls,
            activeStalls,
            emptyStalls,
            maintenanceStalls,
            products,
            contracts,
            activeContracts,
            orders,
        ] = await Promise.all([
            safeCount("users", `SELECT COUNT(*) FROM users`),
            safeCount("traders", `SELECT COUNT(*) FROM traders`),
            safeCount("markets", `SELECT COUNT(*) FROM markets`),
            safeCount("stalls", `SELECT COUNT(*) FROM stalls`),

            // SỬA: giá trị thật của stalls.status trong DB là 'rented'/'available'/
            // 'maintenance' (chữ thường) — trước đây so sánh với 'ACTIVE' (chữ hoa,
            // không tồn tại) nên "đã thuê" luôn ra 0 và "trống" luôn ra tổng số sạp,
            // bất kể thực tế.
            // SỬA TIẾP: "trống" (empty) trước đây = "khác rented", nên gộp luôn cả
            // sạp đang 'maintenance' vào trống — sai vì sạp bảo trì không phải sạp
            // trống. Giờ tách rõ 3 trạng thái: rented / available (trống) / maintenance.
            safeCount("stalls (rented)", `SELECT COUNT(*) FROM stalls WHERE status = 'rented'`),
            safeCount("stalls (empty)", `SELECT COUNT(*) FROM stalls WHERE status = 'available'`),
            safeCount("stalls (maintenance)", `SELECT COUNT(*) FROM stalls WHERE status = 'maintenance'`),

            safeCount("products", `SELECT COUNT(*) FROM products`),
            safeCount("contracts", `SELECT COUNT(*) FROM contracts`),

            // SỬA: status hợp đồng lưu chữ thường 'active' (xem contractRoutes.js),
            // so với 'ACTIVE' trước đây nên số "hợp đồng còn hiệu lực" luôn ra 0.
            safeCount("contracts (active)", `SELECT COUNT(*) FROM contracts WHERE status='active'`),

            safeCount("orders", `SELECT COUNT(*) FROM orders`),
        ]);

        // Doanh thu tách riêng vì trả về SUM chứ không phải COUNT
        let revenueTotal = 0;
        try {
            const revenue = await pool.query(`
                SELECT COALESCE(SUM(amount), 0) AS total_revenue
                FROM payments
            `);
            revenueTotal = Number(revenue.rows[0].total_revenue) || 0;
        } catch (err) {
            console.error(`[dashboard] Lỗi truy vấn "revenue":`, err.message);
        }

        res.json({
            success: true,
            dashboard: {
                users,
                traders,
                markets,
                stalls: {
                    total: stalls,
                    rented: activeStalls,
                    empty: emptyStalls,
                    maintenance: maintenanceStalls
                },
                products,
                contracts: {
                    total: contracts,
                    active: activeContracts
                },
                orders,
                revenue: revenueTotal
            }
        });

    } catch (error) {

        console.log(error);

        res.status(500).json({
            success: false,
            message: "Dashboard error",
            error: error.message
        });

    }

});





// ======================================================
// MONTHLY REVENUE CHART
// GET /api/dashboard/revenue
// ======================================================


router.get("/revenue", async(req,res)=>{


    try{


        const result = await pool.query(`


            SELECT

                TO_CHAR(
                    payment_date,
                    'YYYY-MM'
                ) AS month,


                SUM(amount) AS revenue



            FROM payments


            GROUP BY month


            ORDER BY month



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





// ======================================================
// TOP PRODUCTS
// GET /api/dashboard/top-products
// ======================================================


router.get("/top-products", async(req,res)=>{


    try{


        const result = await pool.query(`


            SELECT


                p.name,


                SUM(oi.quantity) AS sold



            FROM order_items oi


            JOIN products p

            ON oi.product_id=p.id



            GROUP BY p.name


            ORDER BY sold DESC


            LIMIT 10



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



module.exports = router;