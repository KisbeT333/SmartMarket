const express = require('express');

const router = express.Router();

const pool = require('../db');

const verifyToken =
    require('../middleware/verifyToken');

const authorize =
    require('../middleware/authorize');



// =============================================
// PROFILE
// ALL LOGIN USER
// =============================================

router.get(

    '/profile',

    verifyToken,

    async (req, res) => {

        try {

            const result =
                await pool.query(
                    `
                    SELECT
                        u.id,
                        u.username,
                        u.full_name,
                        u.phone,
                        u.email,
                        u.status,
                        u.created_at,
                        r.name AS role_name
                    FROM users u
                    LEFT JOIN roles r
                        ON u.role_id = r.id
                    WHERE u.id = $1
                    `,
                    [req.user.id]
                );



            if(result.rows.length === 0){

                return res.status(404).json({
                    success:false,
                    message:'Không tìm thấy user'
                });
            }



            res.json({

                success:true,

                user:result.rows[0]
            });

        }

        catch (error) {

            console.error(error);

            res.status(500).json({

                success:false,

                message:'Lỗi server'
            });
        }
    }
);



// =============================================
// ADMIN ONLY
// =============================================

router.get(

    '/admin',

    verifyToken,

    authorize('ADMIN'),

    async (req, res) => {

        try {

            res.json({

                success:true,

                message:'Xin chào ADMIN',

                user:req.user
            });

        }

        catch (error) {

            console.error(error);

            res.status(500).json({

                success:false,

                message:'Lỗi server'
            });
        }
    }
);



// =============================================
// ADMIN + STAFF
// =============================================

router.get(

    '/staff',

    verifyToken,

    authorize('ADMIN', 'STAFF'),

    async (req, res) => {

        try {

            res.json({

                success:true,

                message:'Khu vực STAFF',

                user:req.user
            });

        }

        catch (error) {

            console.error(error);

            res.status(500).json({

                success:false,

                message:'Lỗi server'
            });
        }
    }
);



// =============================================
// GET ALL USERS
// ADMIN ONLY
// =============================================

router.get(

    '/',

    verifyToken,

    authorize('ADMIN'),

    async (req, res) => {

        try {

            const result =
                await pool.query(
                    `
                    SELECT
                        u.id,
                        u.username,
                        u.full_name,
                        u.phone,
                        u.email,
                        u.status,
                        r.name AS role_name,
                        u.created_at
                    FROM users u
                    LEFT JOIN roles r
                        ON u.role_id = r.id
                    ORDER BY u.id DESC
                    `
                );



            res.json({

                success:true,

                total:result.rows.length,

                users:result.rows
            });

        }

        catch (error) {

            console.error(error);

            res.status(500).json({

                success:false,

                message:'Lỗi server'
            });
        }
    }
);



// =============================================
// GET USER BY ID
// =============================================

router.get(

    '/:id',

    verifyToken,

    async (req, res) => {

        try {

            const { id } = req.params;



            const result =
                await pool.query(
                    `
                    SELECT
                        u.id,
                        u.username,
                        u.full_name,
                        u.phone,
                        u.email,
                        u.status,
                        r.name AS role_name
                    FROM users u
                    LEFT JOIN roles r
                        ON u.role_id = r.id
                    WHERE u.id = $1
                    `,
                    [id]
                );



            if(result.rows.length === 0){

                return res.status(404).json({

                    success:false,

                    message:'Không tìm thấy user'
                });
            }



            res.json({

                success:true,

                user:result.rows[0]
            });

        }

        catch (error) {

            console.error(error);

            res.status(500).json({

                success:false,

                message:'Lỗi server'
            });
        }
    }
);



// =============================================
// UPDATE USER STATUS
// ADMIN ONLY
// =============================================

router.put(

    '/:id/status',

    verifyToken,

    authorize('ADMIN'),

    async (req, res) => {

        try {

            const { id } =
                req.params;

            const { status } =
                req.body || {};



            if(!status){

                return res.status(400).json({

                    success:false,

                    message:'Thiếu status'
                });
            }



            const result =
                await pool.query(
                    `
                    UPDATE users
                    SET
                        status = $1,
                        updated_at = NOW()
                    WHERE id = $2
                    RETURNING
                        id,
                        username,
                        status
                    `,
                    [status, id]
                );



            if(result.rows.length === 0){

                return res.status(404).json({

                    success:false,

                    message:'User không tồn tại'
                });
            }



            res.json({

                success:true,

                message:'Cập nhật trạng thái thành công',

                user:result.rows[0]
            });

        }

        catch (error) {

            console.error(error);

            res.status(500).json({

                success:false,

                message:'Lỗi server'
            });
        }
    }
);



module.exports = router;