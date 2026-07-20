// ===== CHECK LOGIN =====

const token =
    localStorage.getItem('token');

if(!token){

    // Chưa đăng nhập
    window.location.href =
        'login.html';
}

// ===== HIỂN THỊ USER =====

const fullName =
    localStorage.getItem('full_name');

const username =
    localStorage.getItem('username');

document.getElementById('userName').innerText =
    'Xin chào, ' + (fullName || username);

// ===== LOGOUT =====

function logout(){

    // Xóa dữ liệu đăng nhập
    localStorage.removeItem('token');

    localStorage.removeItem('username');

    localStorage.removeItem('full_name');

    
    window.location.href =
        'http://127.0.0.1:5500/frontend/pages/login.html';
}