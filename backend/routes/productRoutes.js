const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");
const multer = require("multer");

const pool = require("../db");

// ──────────────────────────────────────────────
// MULTER — lưu ảnh sản phẩm (dùng cho admin)
// ──────────────────────────────────────────────
const uploadDir = path.join(__dirname, "..", "uploads", "products");
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


// ======================================================
// GET ALL PRODUCTS
// GET /api/products
// ======================================================

router.get("/", async (req, res) => {

    try {

        const result = await pool.query(`

            SELECT

                p.id,
                p.name,
                p.price,
                p.image_url,

                p.trader_id,
                p.stall_id,

                t.business_name,

                u.full_name AS trader_name,

                s.code AS stall_code,

                m.id AS market_id,

                m.name AS market_name


            FROM products p


            JOIN traders t
                ON p.trader_id = t.id


            JOIN users u
                ON t.user_id = u.id


            JOIN stalls s
                ON p.stall_id = s.id


            JOIN markets m
                ON s.market_id = m.id


            ORDER BY p.id DESC

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
// SEARCH PRODUCT
// GET /api/products/search?q=
// ======================================================

router.get("/search", async(req,res)=>{


    try{


        const keyword =
        req.query.q || "";



        const result =
        await pool.query(`


            SELECT

                p.id,

                p.name,

                p.price,

                p.image_url,

                t.business_name,

                s.code AS stall_code,

                m.name AS market_name


            FROM products p


            JOIN traders t
            ON p.trader_id=t.id


            JOIN stalls s
            ON p.stall_id=s.id


            JOIN markets m
            ON s.market_id=m.id



            WHERE p.name ILIKE $1


            ORDER BY p.id DESC


        `,
        [
            `%${keyword}%`
        ]);



        res.json({

            success:true,

            count:
            result.rows.length,

            data:
            result.rows

        });



    }catch(error){


        res.status(500).json({

            success:false,

            message:error.message

        });

    }


});




// ======================================================
// GET PRODUCT BY ID
// GET /api/products/:id
// ======================================================

router.get("/:id", async(req,res)=>{


    try{


        const result =
        await pool.query(`


            SELECT


                p.*,

                t.business_name,

                u.full_name AS trader_name,

                s.code AS stall_code,

                m.name AS market_name


            FROM products p


            JOIN traders t
            ON p.trader_id=t.id


            JOIN users u
            ON t.user_id=u.id


            JOIN stalls s
            ON p.stall_id=s.id


            JOIN markets m
            ON s.market_id=m.id



            WHERE p.id=$1



        `,
        [
            req.params.id
        ]);



        if(result.rows.length===0){

            return res.status(404).json({

                success:false,

                message:"Không tìm thấy sản phẩm"

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
// CREATE PRODUCT
// POST /api/products
// ======================================================

router.post("/", upload.single("image"), async(req,res)=>{


    try{


        const {

            trader_id,

            stall_id,

            name,

            price,

            image_url = null

        } = req.body;



        if(
            !trader_id ||
            !stall_id ||
            !name ||
            price <= 0
        ){
            if (req.file) fs.unlink(req.file.path, () => {});
            return res.status(400).json({

                success:false,

                message:"Dữ liệu không hợp lệ"

            });

        }

        // Ưu tiên file upload, fallback về image_url text
        const finalImageUrl = req.file
            ? `/uploads/products/${req.file.filename}`
            : (image_url || null);

        const result =
        await pool.query(`


            INSERT INTO products

            (
                trader_id,
                stall_id,
                name,
                price,
                image_url
            )


            VALUES

            ($1,$2,$3,$4,$5)


            RETURNING *


        `,
        [
            trader_id,
            stall_id,
            name,
            price,
            finalImageUrl
        ]);



        res.status(201).json({

            success:true,

            message:"Thêm sản phẩm thành công",

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




// ======================================================
// UPDATE PRODUCT
// PUT /api/products/:id
// ======================================================

router.put("/:id", upload.single("image"), async(req,res)=>{


    try{


        const {

            name,

            price,

            stall_id,

            image_url        // URL text (ảnh cũ giữ lại từ frontend)

        } = req.body;

        // Lấy ảnh cũ trong DB để xóa file nếu cần
        const old = await pool.query(
            "SELECT image_url FROM products WHERE id = $1",
            [req.params.id]
        );

        if (old.rows.length === 0) {
            if (req.file) fs.unlink(req.file.path, () => {});
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy sản phẩm"
            });
        }

        const oldImageUrl = old.rows[0].image_url;

        // Xác định image_url cuối cùng:
        // 1. Nếu có file upload mới → dùng file mới
        // 2. Nếu không có file nhưng có image_url text từ body → giữ nguyên
        // 3. Nếu cả 2 đều null/undefined → xóa ảnh (set NULL)
        let finalImageUrl;
        if (req.file) {
            finalImageUrl = `/uploads/products/${req.file.filename}`;
            // Xóa file ảnh cũ trên disk
            if (oldImageUrl) {
                const oldPath = path.join(__dirname, "..", oldImageUrl.replace(/^\//, ""));
                fs.unlink(oldPath, () => {});
            }
        } else if (image_url !== undefined) {
            finalImageUrl = image_url || null;
        } else {
            // Không gửi gì → giữ nguyên ảnh cũ
            finalImageUrl = oldImageUrl;
        }

        const result =
        await pool.query(`


            UPDATE products


            SET

                name    = COALESCE($1, name),

                price   = COALESCE($2, price),

                stall_id = COALESCE($3, stall_id),

                image_url = $4


            WHERE id=$5


            RETURNING *


        `,
        [

            name    || null,

            price   || null,

            stall_id || null,

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





// ======================================================
// DELETE PRODUCT
// DELETE /api/products/:id
// ======================================================

router.delete("/:id", async(req,res)=>{


    try{


        const result =
        await pool.query(`


            DELETE FROM products

            WHERE id=$1


            RETURNING *


        `,
        [
            req.params.id
        ]);



        if(result.rows.length===0){

            return res.status(404).json({

                success:false,

                message:"Không tìm thấy sản phẩm"

            });

        }



        res.json({

            success:true,

            message:"Xóa sản phẩm thành công"

        });



    }catch(error){


        res.status(500).json({

            success:false,

            message:error.message

        });

    }

});




// ======================================================
// GET PRODUCTS BY TRADER
// GET /api/products/trader/:id
// ======================================================

router.get("/trader/:id", async(req,res)=>{


    try{


        const result =
        await pool.query(`


            SELECT *

            FROM products


            WHERE trader_id=$1


            ORDER BY id DESC


        `,
        [
            req.params.id
        ]);



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