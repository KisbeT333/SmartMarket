const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");
const multer = require("multer");

const pool = require("../db");

const verifyToken = require("../middleware/verifyToken");
const authorize = require("../middleware/authorize");

// Toàn bộ route trong file này yêu cầu đăng nhập + role ADMIN hoặc MANAGER.
// TRƯỚC ĐÂY: router này hoàn toàn công khai (không có verifyToken/authorize),
// bất kỳ ai cũng gọi được API tạo/sửa/xóa mọi chợ mà không cần đăng nhập.
router.use(verifyToken, authorize("ADMIN", "MANAGER"));

// ──────────────────────────────────────────────
// MULTER — lưu ảnh chợ (giống pattern của productRoutes.js)
// ──────────────────────────────────────────────
const uploadDir = path.join(__dirname, "..", "uploads", "markets");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename:    (req, file, cb) => {
        const ext  = path.extname(file.originalname).toLowerCase();
        const name = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
        cb(null, name);
    },
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const OK = ["image/jpeg", "image/png", "image/webp", "image/gif"];
        cb(null, OK.includes(file.mimetype));
    },
});



// =====================================================
// GET ALL MARKETS
// GET /api/markets
// =====================================================

router.get("/", async(req,res)=>{


    try{


        const result = await pool.query(`


            SELECT

                m.id,

                m.name,

                m.address,

                m.city,

                m.image_url,


                u.full_name AS manager_name,


                COUNT(DISTINCT s.id) AS total_stalls,

                COUNT(DISTINCT z.id) AS total_zones,

                COUNT(DISTINCT t.id) AS total_traders



            FROM markets m



            LEFT JOIN users u

            ON m.manager_id=u.id



            LEFT JOIN stalls s

            ON m.id=s.market_id



            LEFT JOIN zones z

            ON m.id=z.market_id



            LEFT JOIN traders t

            ON m.id=t.market_id



            GROUP BY

                m.id,

                u.full_name



            ORDER BY m.id DESC



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





// =====================================================
// GET ME — thông tin manager đang đăng nhập + chợ được giao
// GET /api/manager/me
//
// QUAN TRỌNG: route này PHẢI đặt TRƯỚC "/:id" ở dưới, nếu không Express
// sẽ khớp "/me" vào route "/:id" (hiểu nhầm id="me"), gây lỗi SQL vì
// markets.id là kiểu INTEGER. Đây chính là nguyên nhân trước đây
// fetch("/api/manager/me") luôn lỗi, khiến manager.js không lấy được
// myMarketIds và mặc định coi như "không giới hạn" -> hiển thị TẤT CẢ
// dữ liệu của mọi chợ thay vì chỉ chợ được admin phân công.
//
// "Được giao" = markets.manager_id = id của user đang đăng nhập.
// =====================================================

router.get("/me", async (req, res) => {

    try {

        const managerId = req.user.id;

        const managerResult = await pool.query(
            `
            SELECT id, username, full_name, phone, email
            FROM users
            WHERE id = $1
            `,
            [managerId]
        );

        if (managerResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy tài khoản manager"
            });
        }

        const marketsResult = await pool.query(
            `
            SELECT
                m.id,
                m.name,
                m.address,
                m.city,
                m.image_url,

                (SELECT COUNT(*) FROM stalls s WHERE s.market_id = m.id)  AS total_stalls,
                (SELECT COUNT(*) FROM zones z WHERE z.market_id = m.id)   AS total_zones,
                (SELECT COUNT(*) FROM traders t WHERE t.market_id = m.id) AS total_traders

            FROM markets m
            WHERE m.manager_id = $1
            ORDER BY m.id
            `,
            [managerId]
        );

        res.json({

            success: true,

            manager: managerResult.rows[0],

            markets: marketsResult.rows

        });

    } catch (error) {

        res.status(500).json({

            success: false,

            message: error.message

        });

    }

});



// =====================================================
// GET MARKET BY ID
// GET /api/markets/:id
// =====================================================


router.get("/:id", async(req,res)=>{


    try{


        const result = await pool.query(`


            SELECT

                m.*,

                u.full_name AS manager_name,


                u.phone AS manager_phone,


                (
                    SELECT COUNT(*)
                    FROM stalls s
                    WHERE s.market_id = m.id
                ) AS total_stalls,


                (
                    SELECT COUNT(*)
                    FROM zones z
                    WHERE z.market_id = m.id
                ) AS total_zones,


                (
                    SELECT COUNT(*)
                    FROM traders t
                    WHERE t.market_id = m.id
                ) AS total_traders



            FROM markets m


            LEFT JOIN users u

            ON m.manager_id=u.id


            WHERE m.id=$1



        `,[req.params.id]);




        if(result.rows.length===0){


            return res.status(404).json({

                success:false,

                message:"Không tìm thấy chợ"

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






// =====================================================
// CREATE MARKET
// POST /api/markets
// =====================================================


router.post("/", upload.single("image"), async(req,res)=>{


    try{


        const {

            name,

            address,

            city,

            manager_id,

            image_url


        }=req.body;


        if(!name){

            if (req.file) fs.unlink(req.file.path, () => {});

            return res.status(400).json({

                success:false,

                message:"Tên chợ bắt buộc"

            });

        }

        // Ưu tiên file upload, fallback về image_url text (nếu không có file gửi lên)
        const finalImageUrl = req.file
            ? `/uploads/markets/${req.file.filename}`
            : (image_url || null);



        const result =
        await pool.query(`


            INSERT INTO markets

            (

                name,

                address,

                city,

                manager_id,

                image_url

            )


            VALUES

            ($1,$2,$3,$4,$5)


            RETURNING *



        `,[

            name,

            address,

            city,

            manager_id || null,

            finalImageUrl

        ]);




        res.status(201).json({

            success:true,

            message:"Tạo chợ thành công",

            data:result.rows[0]

        });




    }catch(error){

        if (req.file) fs.unlink(req.file.path, () => {});

        res.status(500).json({

            success:false,

            message:error.message

        });


    }


});







// =====================================================
// UPDATE MARKET
// PUT /api/markets/:id
// =====================================================


router.put("/:id", upload.single("image"), async(req,res)=>{


    try{


        const {

            name,

            address,

            city,

            manager_id,

            image_url        // URL text (ảnh cũ giữ lại từ frontend, hoặc rỗng = xóa ảnh)


        }=req.body;

        // Lấy ảnh cũ trong DB để xóa file nếu cần
        const old = await pool.query(
            "SELECT image_url FROM markets WHERE id = $1",
            [req.params.id]
        );

        if (old.rows.length === 0) {
            if (req.file) fs.unlink(req.file.path, () => {});
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy chợ"
            });
        }

        const oldImageUrl = old.rows[0].image_url;

        // Xác định image_url cuối cùng:
        // 1. Có file upload mới → dùng file mới, xóa file cũ trên disk
        // 2. Không có file nhưng có image_url text từ body → giữ nguyên URL đó
        // 3. Cả 2 đều rỗng → xóa ảnh (set NULL)
        let finalImageUrl;
        if (req.file) {
            finalImageUrl = `/uploads/markets/${req.file.filename}`;
            if (oldImageUrl && oldImageUrl.startsWith("/uploads/")) {
                const oldPath = path.join(__dirname, "..", oldImageUrl.replace(/^\//, ""));
                fs.unlink(oldPath, () => {});
            }
        } else if (image_url !== undefined) {
            finalImageUrl = image_url || null;
        } else {
            finalImageUrl = oldImageUrl;
        }




        const result =
        await pool.query(`


            UPDATE markets


            SET

                name=$1,

                address=$2,

                city=$3,

                manager_id=$4,

                image_url=$5


            WHERE id=$6


            RETURNING *



        `,[


            name,

            address,

            city,

            manager_id || null,

            finalImageUrl,

            req.params.id


        ]);




        res.json({

            success:true,

            message:"Cập nhật thành công",

            data:result.rows[0]

        });





    }catch(error){

        if (req.file) fs.unlink(req.file.path, () => {});

        res.status(500).json({

            success:false,

            message:error.message

        });


    }


});






// =====================================================
// DELETE MARKET
// DELETE /api/markets/:id
// =====================================================


router.delete("/:id", async(req,res)=>{


    try{

        const { id } = req.params;

        // Kiểm tra trước: chợ còn khu, sạp hoặc tiểu thương liên kết không
        const zoneCheck = await pool.query("SELECT COUNT(*) FROM zones WHERE market_id = $1", [id]);
        const stallCheck = await pool.query("SELECT COUNT(*) FROM stalls WHERE market_id = $1", [id]);
        const traderCheck = await pool.query("SELECT COUNT(*) FROM traders WHERE market_id = $1", [id]);

        const zoneCount = parseInt(zoneCheck.rows[0].count);
        const stallCount = parseInt(stallCheck.rows[0].count);
        const traderCount = parseInt(traderCheck.rows[0].count);

        if (zoneCount > 0 || stallCount > 0 || traderCount > 0) {
            const parts = [];
            if (zoneCount > 0) parts.push(`${zoneCount} khu`);
            if (stallCount > 0) parts.push(`${stallCount} sạp`);
            if (traderCount > 0) parts.push(`${traderCount} tiểu thương`);

            return res.status(409).json({
                success: false,
                message: `Không thể xóa: chợ này đang có ${parts.join(", ")} liên kết. Vui lòng xóa hoặc chuyển các dữ liệu này sang chợ khác trước.`
            });
        }


        const result =
        await pool.query(`


            DELETE FROM markets

            WHERE id=$1


            RETURNING *



        `,[req.params.id]);





        if(result.rows.length===0){


            return res.status(404).json({

                success:false,

                message:"Không tìm thấy chợ"

            });

        }




        res.json({

            success:true,

            message:"Xóa chợ thành công"

        });




    }catch(error){

        // Lớp bảo vệ thứ 2: nếu vẫn lọt qua check trên (vd race condition),
        // bắt mã lỗi FOREIGN KEY của PostgreSQL để trả thông báo dễ hiểu
        if (error.code === "23503") {
            return res.status(409).json({
                success: false,
                message: "Không thể xóa: chợ này vẫn còn dữ liệu liên kết (khu, sạp, tiểu thương...)."
            });
        }

        res.status(500).json({

            success:false,

            message:error.message

        });

    }


});



module.exports = router;