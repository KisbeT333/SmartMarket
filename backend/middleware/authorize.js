    function authorize(...roles) {

        return (req, res, next) => {

            // chưa đăng nhập
            if (!req.user) {

                return res.status(401).json({
                    success: false,
                    message: 'Chưa xác thực'
                });
            }

            // không có quyền
            if (!roles.includes(req.user.role_name)) {

                return res.status(403).json({
                    success: false,
                    message: 'Bạn không có quyền'
                });
            }

            next();
        };
    }

    module.exports = authorize;