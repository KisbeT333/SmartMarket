
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



// ===============================
// REGISTER
// ===============================

document
    .getElementById('registerForm')
    .addEventListener('submit', async (e) => {

    e.preventDefault();

    const message = document.getElementById('message');

    // DATA
    const username =
        document.getElementById('username').value;

    const full_name =
        document.getElementById('full_name').value;

    const phone =
        document.getElementById('phone').value;

    const email =
        document.getElementById('email').value;

    const password =
        document.getElementById('password').value;

    const confirm_password =
        document.getElementById('confirm_password').value;

    // CHECK PASSWORD
    if(password !== confirm_password){

        showToast(
            'Mật khẩu xác nhận không khớp',
            'error'
        );

        return;
    }

    // OBJECT
    const data = {
        username,
        full_name,
        phone,
        email,
        password,
        role_id: 4
    };

    try {

        const response = await fetch(
            'http://127.0.0.1:3000/api/register',
            {
                method: 'POST',

                headers: {
                    'Content-Type': 'application/json'
                },

                body: JSON.stringify(data)
            }
        );

        const result = await response.json();

        // SUCCESS
        if(result.success){

            showToast(
                'Đăng ký tài khoản thành công!',
                'success'
            );

            setTimeout(() => {

                window.location.href =
                    'login.html';

            }, 1200);

        }

        // FAIL
        else {

            showToast(
                result.message || 'Đăng ký thất bại',
                'error'
            );

            message.style.color = '#ef4444';

            message.innerText =
                result.message;

        }

    } catch (err) {

        console.error(err);

        showToast(
            'Không thể kết nối server',
            'error'
        );

        message.style.color = '#ef4444';

        message.innerText =
            'Không thể kết nối server';
    }

});