const passport = require('passport');

const GoogleStrategy =
    require('passport-google-oauth20').Strategy;

const pool = require('../db');

require('dotenv').config();



passport.use(

    new GoogleStrategy(

        {
            clientID:
                process.env.GOOGLE_CLIENT_ID,

            clientSecret:
                process.env.GOOGLE_CLIENT_SECRET,

            callbackURL:
                'http://127.0.0.1:3000/api/auth/google/callback'
        },

        async (
            accessToken,
            refreshToken,
            profile,
            done
        ) => {

            try {

                const email =
                    profile.emails[0].value;

                const googleId =
                    profile.id;

                const fullName =
                    profile.displayName;

                const avatar =
                    profile.photos[0].value;



                // ===== CHECK USER =====

                const existingUser =
                    await pool.query(

                        `
                        SELECT
                            u.*,
                            r.name AS role_name
                        FROM users u
                        JOIN roles r
                            ON u.role_id = r.id
                        WHERE email = $1
                        `,

                        [email]

                    );



                // ===== USER EXISTS =====

                if (
                    existingUser.rows.length > 0
                ) {

                    return done(
                        null,
                        existingUser.rows[0]
                    );

                }



                // ===== CREATE USER =====

                const newUser =
                    await pool.query(

                        `
                        INSERT INTO users
                        (
                            username,
                            password_hash,
                            full_name,
                            email,
                            avatar_url,
                            role_id,
                            status,
                            google_id,
                            login_provider
                        )
                        VALUES
                        (
                            $1,
                            '',
                            $2,
                            $3,
                            $4,
                            4,
                            'ACTIVE',
                            $5,
                            'GOOGLE'
                        )
                        RETURNING *
                        `,

                        [
                            email.split('@')[0],
                            fullName,
                            email,
                            avatar,
                            googleId
                        ]

                    );



                const user =
                    newUser.rows[0];



                user.role_name =
                    'CUSTOMER';



                return done(
                    null,
                    user
                );

            }

            catch (error) {

                console.log(error);

                return done(error, null);

            }

        }

    )

);

module.exports = passport;