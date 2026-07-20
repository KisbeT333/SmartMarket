const jwt = require('jsonwebtoken');

function verifyToken(req, res, next){

    const authHeader =
        req.headers.authorization;

    if(!authHeader){

        return res.status(401).json({
            success:false,
            message:'Không có token'
        });
    }

    const token =
        authHeader.split(' ')[1];

    try{

        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET
        );

        req.user = decoded;

        next();

    }catch(error){

        return res.status(401).json({
            success:false,
            message:'Token không hợp lệ'
        });
    }
}

module.exports = verifyToken;