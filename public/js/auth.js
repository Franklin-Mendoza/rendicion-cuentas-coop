// =====================================================
// GESTIÓN DE AUTENTICACIÓN - LA SAGRADA FAMILIA R.L.
// =====================================================

document.addEventListener('DOMContentLoaded', function() {
    const currentPage = window.location.pathname;
    const publicPages = ['/index.html', '/', '/login.html'];
    
    if (!publicPages.includes(currentPage)) {
        if (!isAuthenticated()) {
            window.location.href = '/index.html';
            return;
        }
        
        initUserInfo();
    }
});

function redirectByRole(rol) {
    switch(rol) {
        case 'admin':
            window.location.href = '/admin/dashboard.html';
            break;
        case 'supervisor':
            window.location.href = '/supervisor/dashboard.html';
            break;
        case 'usuario':
        default:
            window.location.href = '/usuario/dashboard.html';
            break;
    }
}