const express = require("express");
const router = express.Router();

const pool = require("../db");



// ======================================================
// GET ALL ZONES
// GET /api/zones
// ======================================================

router.get("/", async(req,res)=>{


    try{


        const result = await pool.query(`


            SELECT

                z.id,

                z.code,

                z.name,


                m.id AS market_id,

                m.name AS market_name



            FROM zones z


            JOIN markets m

            ON z.market_id=m.id


            ORDER BY z.id DESC



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
// GET ZONE BY ID
// GET /api/zones/:id
// ======================================================


router.get("/:id", async(req,res)=>{


    try{


        const result = await pool.query(`


            SELECT


                z.*,


                m.name AS market_name



            FROM zones z



            JOIN markets m

            ON z.market_id=m.id



            WHERE z.id=$1



        `,[req.params.id]);





        if(result.rows.length===0){


            return res.status(404).json({

                success:false,

                message:"Không tìm thấy khu"

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
// CREATE ZONE
// POST /api/zones
// ======================================================


router.post("/", async(req,res)=>{


    try{


        const {

            market_id,

            code,

            name


        } = req.body;




        if(!market_id || !name){


            return res.status(400).json({

                success:false,

                message:"Thiếu dữ liệu khu"

            });


        }





        const result = await pool.query(`


            INSERT INTO zones


            (

                market_id,

                code,

                name

            )


            VALUES

            ($1,$2,$3)


            RETURNING *



        `,[


            market_id,

            code,

            name


        ]);





        res.status(201).json({

            success:true,

            message:"Tạo khu thành công",

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
// UPDATE ZONE
// PUT /api/zones/:id
// ======================================================


router.put("/:id", async(req,res)=>{


    try{


        const {

            code,

            name


        } = req.body;




        const result = await pool.query(`


            UPDATE zones


            SET

                code=$1,

                name=$2



            WHERE id=$3


            RETURNING *



        `,[


            code,

            name,

            req.params.id


        ]);




        if(result.rows.length===0){


            return res.status(404).json({

                success:false,

                message:"Không tìm thấy khu"

            });


        }





        res.json({

            success:true,

            message:"Cập nhật khu thành công",

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
// DELETE ZONE
// DELETE /api/zones/:id
// ======================================================


router.delete("/:id", async(req,res)=>{


    try{

        const { id } = req.params;

        // Kiểm tra trước: khu còn sạp liên kết không
        const stallCheck = await pool.query(
            "SELECT COUNT(*) FROM stalls WHERE zone_id = $1",
            [id]
        );

        const stallCount = parseInt(stallCheck.rows[0].count);

        if (stallCount > 0) {
            return res.status(409).json({
                success: false,
                message: `Không thể xóa: khu này đang có ${stallCount} sạp liên kết. Vui lòng xóa hoặc chuyển các sạp này sang khu khác trước.`
            });
        }


        const result = await pool.query(`


            DELETE FROM zones


            WHERE id=$1


            RETURNING *



        `,[req.params.id]);





        if(result.rows.length===0){


            return res.status(404).json({

                success:false,

                message:"Không tìm thấy khu"

            });


        }





        res.json({

            success:true,

            message:"Xóa khu thành công"

        });




    }catch(error){

        // Lớp bảo vệ thứ 2: bắt mã lỗi FOREIGN KEY của PostgreSQL nếu vẫn lọt qua check trên
        if (error.code === "23503") {
            return res.status(409).json({
                success: false,
                message: "Không thể xóa: khu này vẫn còn dữ liệu liên kết (sạp...)."
            });
        }

        res.status(500).json({

            success:false,

            message:error.message

        });

    }


});




module.exports = router;