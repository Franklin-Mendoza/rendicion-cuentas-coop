// =====================================================
// FUNCIONES DEL USUARIO
// =====================================================

// Este archivo contiene funciones auxiliares para el usuario
// Las funciones principales están en el HTML del formulario

document.addEventListener('DOMContentLoaded', function() {
    // Verificar que el usuario tenga el rol correcto
    const usuario = getUsuario();
    if (usuario && usuario.rol !== 'usuario') {
        // Redirigir si no es usuario
        redirectByRole(usuario.rol);
    }
});

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (!sidebar) return;
    if (window.innerWidth > 1024) return; // En PC siempre visible, no hace nada
    sidebar.classList.toggle('active');
    if (overlay) overlay.classList.toggle('active');
}
 
window.addEventListener('load', function() {
    // En móvil, sidebar empieza cerrado por defecto
    if (window.innerWidth <= 1024) {
        const sidebar = document.getElementById('sidebar');
        if (sidebar) sidebar.classList.remove('active');
    }
});
