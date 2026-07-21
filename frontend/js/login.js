// ===== CHECK LOGIN =====
const token = localStorage.getItem('token');
const role = localStorage.getItem('role_name');

if(token && role){
    redirectByRole(role);
}

// function showToast(message, type = 'success') {

function showToast(message, type = 'success') {

    let toast = document.getElementById('custom-toast');

    // REMOVE TOAST CŨ
    if (toast) {
        toast.remove();
    }

    toast = document.createElement('div');

    toast.id = 'custom-toast';

    const bg =
        type === 'success'
            ? '#16a34a'
            : '#dc2626';

    const icon =
        type === 'success'
            ? '<i class="fa-solid fa-check"></i>'
            : '<i class="fa-solid fa-xmark"></i>';

    toast.style.cssText = `
        position: fixed;
        top: 25px;
        right: 25px;
        background: ${bg};
        color: white;
        padding: 16px 22px;
        border-radius: 14px;
        display: flex;
        align-items: center;
        gap: 12px;
        font-size: 15px;
        font-weight: 700;
        z-index: 99999;
        opacity: 0;
        transform: translateX(100px);
        transition: all .45s ease;
        min-width: 290px;
        box-shadow: 0 12px 35px rgba(0,0,0,.18);
    `;

    toast.innerHTML = `
        <span style="font-size:20px;">
            ${icon}
        </span>

        <span>
            ${message}
        </span>
    `;

    document.body.appendChild(toast);

    // SHOW
    setTimeout(() => {

        toast.style.opacity = '1';
        toast.style.transform = 'translateX(0)';

    }, 10);

    // HIDE
    setTimeout(() => {

        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100px)';

        setTimeout(() => {
            toast.remove();
        }, 400);

    }, 2500);
}

document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const message = document.getElementById('message');

    try {
        const response = await fetch('https://smartmarket-a133.onrender.com/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const result = await response.json();

        if(result.success){
            // Lưu thông tin
            localStorage.setItem('token', result.token);
            localStorage.setItem('username', result.user.username);
            localStorage.setItem('full_name', result.user.full_name);
            localStorage.setItem('role_name', result.user.role_name);

           
            showToast('Đăng nhập thành công', 'success');

            
            setTimeout(() => {
                redirectByRole(result.user.role_name);
            }, 500);
        } else {
            message.style.color = '#ef4444';
            message.innerText = result.message;
        }
    } catch (error) {
        console.error(error);
        message.style.color = '#ef4444';
        message.innerText = 'Không thể kết nối server';
    }
});

// ===== REDIRECT ROLE =====
function redirectByRole(role){
    switch(role){
        case 'ADMIN':
            window.location.href = 'admin.html';
            break;
        case 'TRADER':
            window.location.href = 'trader.html';
            break;
        case 'MANAGER':
            window.location.href = 'manager.html';
            break;
        case 'CUSTOMER':
            window.location.href = 'customer.html';
            break;
        default:
            window.location.href = '/index.html';
    }
}