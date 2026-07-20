const express = require('express');

const bcrypt = require('bcryptjs');

const jwt = require('jsonwebtoken');

const passport = require('passport');

const crypto = require('crypto');

const nodemailer = require('nodemailer');

const router = express.Router();

const pool = require('../db');

require('dotenv').config();

router.post('/register', async (req, res) => {
    try {

        const {
            username,
            password,
            full_name,
            phone,
            email
        } = req.body;

        if (
            !username ||
            !password ||
            !full_name ||
            !phone
        ) {

            return res.status(400).json({

                success: false,

                message: 'Thiếu dữ liệu'

            });

        }

        const existingUser =
            await pool.query(

                `
                SELECT id
                FROM users
                WHERE username = $1
                   OR phone = $2
                   OR email = $3
                `,

                [
                    username,
                    phone,
                    email || null
                ]

            );

        if (existingUser.rows.length > 0) {

            return res.status(400).json({

                success: false,

                message: 'Tài khoản đã tồn tại'

            });

        }

        const hashedPassword =
            await bcrypt.hash(password, 10);





        const result =
            await pool.query(

                `
                INSERT INTO users
                (
                    username,
                    password_hash,
                    full_name,
                    phone,
                    email,
                    role_id,
                    status,
                    login_provider
                )
                VALUES
                (
                    $1,
                    $2,
                    $3,
                    $4,
                    $5,
                    4,
                    'ACTIVE',
                    'LOCAL'
                )
                RETURNING
                    id,
                    username,
                    full_name,
                    role_id,
                    status
                `,

                [
                    username,
                    hashedPassword,
                    full_name,
                    phone,
                    email || null
                ]

            );

        res.status(201).json({

            success: true,

            message: 'Đăng ký thành công',

            user: result.rows[0]

        });

    }

    catch (error) {

        console.log(error);

        res.status(500).json({

            success: false,

            message: 'Lỗi server'

        });

    }

});

router.post('/login', async (req, res) => {

    try {

        const {
            username,
            password
        } = req.body;

        if (!username || !password) {

            return res.status(400).json({

                success: false,

                message: 'Thiếu tài khoản hoặc mật khẩu'

            });

        }

        const result =
            await pool.query(

                `
                SELECT
                    u.id,
                    u.username,
                    u.full_name,
                    u.password_hash,
                    u.role_id,
                    u.status,
                    r.name AS role_name
                FROM users u
                JOIN roles r
                    ON u.role_id = r.id
                WHERE u.username = $1
                `,

                [username]

            );

        if (result.rows.length === 0) {

            return res.status(400).json({

                success: false,

                message: 'Tài khoản không tồn tại'

            });

        }

        const user =
            result.rows[0];

        if (user.status !== 'ACTIVE') {

            return res.status(403).json({

                success: false,

                message: 'Tài khoản bị khóa'

            });

        }

        const isMatch =
            await bcrypt.compare(

                password,

                user.password_hash

            );

        if (!isMatch) {

            return res.status(400).json({

                success: false,

                message: 'Sai mật khẩu'

            });

        }

        const token =
            jwt.sign(

                {
                    id: user.id,
                    username: user.username,
                    role_id: user.role_id,
                    role_name: user.role_name
                },

                process.env.JWT_SECRET,

                {
                    expiresIn: '7d'
                }

            );

        await pool.query(

            `
            UPDATE users
            SET last_login = NOW()
            WHERE id = $1
            `,

            [user.id]

        );

        res.json({

            success: true,

            message: 'Đăng nhập thành công',

            token,

            user: {
                id: user.id,
                username: user.username,
                full_name: user.full_name,
                role_name: user.role_name
            }

        });

    }

    catch (error) {

        console.log(error);

        res.status(500).json({

            success: false,

            message: 'Lỗi server'

        });

    }

});

router.get(

    '/auth/google',

    passport.authenticate(

        'google',

        {
            scope: ['profile', 'email']
        }

    )

);

router.get(

    '/auth/google/callback',

    passport.authenticate(

        'google',

        {
            session: false,

            failureRedirect:
                'http://127.0.0.1:5500/frontend/pages/login.html'
        }

    ),

    async (req, res) => {

        try {

            const token =
                jwt.sign(

                    {
                        id: req.user.id,
                        username: req.user.username,
                        role_id: req.user.role_id,
                        role_name: req.user.role_name
                    },

                    process.env.JWT_SECRET,

                    {
                        expiresIn: '7d'
                    }

                );

            if (req.user.role_name === 'ADMIN') {

                return res.redirect(

                    `http://127.0.0.1:5500/frontend/pages/admin.html?token=${token}`

                );

            }

            if (req.user.role_name === 'STAFF') {

                return res.redirect(

                    `http://127.0.0.1:5500/frontend/pages/staff.html?token=${token}`

                );

            }

            return res.redirect(

                `http://127.0.0.1:5500/frontend/pages/customer.html?token=${token}`

            );

        }

        catch (error) {

            console.log(error);

            res.redirect(
                'http://127.0.0.1:5500/frontend/pages/login.html'
            );

        }

    }

);

router.post('/forgot-password', async (req, res) => {

    try {

        const { email } = req.body;

        if (!email) {

            return res.status(400).json({

                success: false,

                message: 'Vui lòng nhập email'

            });

        }

        const user =
            await pool.query(

                `
                SELECT *
                FROM users
                WHERE email = $1
                `,

                [email]

            );

        if (user.rows.length === 0) {

            return res.status(404).json({

                success: false,

                message: 'Email không tồn tại'

            });

        }

        const resetToken =
            crypto.randomBytes(32).toString('hex');

        const expire =
            new Date(Date.now() + 15 * 60 * 1000);

        await pool.query(

            `
            UPDATE users
            SET
                reset_token = $1,
                reset_token_expire = $2
            WHERE email = $3
            `,

            [
                resetToken,
                expire,
                email
            ]

        );

        const resetLink =

            `http://127.0.0.1:5500/frontend/pages/reset-password.html?token=${resetToken}`;

        const transporter =
            nodemailer.createTransport({

                service: 'gmail',

                auth: {

                    user: process.env.EMAIL_USER,

                    pass: process.env.EMAIL_PASS

                }

            });

        await transporter.sendMail({

            from: process.env.EMAIL_USER,

            to: email,

            subject: 'Đặt lại mật khẩu SmartMarket',

            html: `

                <div style="font-family:Arial;padding:20px">

                    <h2>Đặt lại mật khẩu</h2>

                    <p>Bấm nút bên dưới để đổi mật khẩu:</p>

                    <a href="${resetLink}"
                       style="
                            display:inline-block;
                            padding:12px 20px;
                            background:#1a5f3f;
                            color:#fff;
                            text-decoration:none;
                            border-radius:8px;
                       ">

                        Đổi mật khẩu

                    </a>

                    <p style="margin-top:20px">
                        Link hết hạn sau 15 phút.
                    </p>

                </div>

            `

        });

        res.json({

            success: true,

            message: 'Đã gửi email reset mật khẩu'

        });

    }

    catch (error) {

        console.log(error);

        res.status(500).json({

            success: false,

            message: 'Lỗi server'

        });

    }

});

router.post('/reset-password', async (req, res) => {

    try {

        const {
            token,
            password
        } = req.body;



        if (!token || !password) {

            return res.status(400).json({

                success: false,

                message: 'Thiếu dữ liệu'

            });

        }

        const user =
            await pool.query(

                `
                SELECT *
                FROM users
                WHERE reset_token = $1
                AND reset_token_expire > NOW()
                `,

                [token]

            );

        if (user.rows.length === 0) {

            return res.status(400).json({

                success: false,

                message: 'Token không hợp lệ hoặc hết hạn'

            });

        }

        const hashedPassword =
            await bcrypt.hash(password, 10);

        await pool.query(

            `
            UPDATE users
            SET
                password_hash = $1,
                reset_token = NULL,
                reset_token_expire = NULL
            WHERE reset_token = $2
            `,

            [
                hashedPassword,
                token
            ]

        );

        res.json({

            success: true,

            message: 'Đổi mật khẩu thành công'

        });

    }

    catch (error) {

        console.log(error);

        res.status(500).json({

            success: false,

            message: 'Lỗi server'

        });

    }

});

router.get('/users', async (req, res) => {

    try {

        const result =
            await pool.query(

                `
                SELECT
                    id,
                    username,
                    full_name,
                    email,
                    phone,
                    status,
                    created_at
                FROM users
                ORDER BY id DESC
                `

            );

        res.json({

            success: true,

            users: result.rows

        });

    }

    catch (error) {

        console.log(error);

        res.status(500).json({

            success: false,

            message: 'Lỗi server'

        });

    }

});

module.exports = router;