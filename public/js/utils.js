// =====================================================
// UTILIDADES GENERALES - LA SAGRADA FAMILIA R.L.
// =====================================================

const API_BASE_URL = '';

function getToken() {
    return localStorage.getItem('token');
}

function getUsuario() {
    const usuario = localStorage.getItem('usuario');
    return usuario ? JSON.parse(usuario) : null;
}

function isAuthenticated() {
    return !!getToken();
}

function getAuthHeaders() {
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getToken()}`
    };
}

async function apiGet(url) {
    try {
        const response = await fetch(API_BASE_URL + url, {
            method: 'GET',
            headers: getAuthHeaders()
        });
        
        if (response.status === 401 || response.status === 403) {
            logout();
            return null;
        }
        
        return response.json();
    } catch (error) {
        console.error('API Error:', error);
        return null;
    }
}

async function apiPost(url, data) {
    try {
        const response = await fetch(API_BASE_URL + url, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(data)
        });
        
        if (response.status === 401 || response.status === 403) {
            logout();
            return null;
        }
        
        return response.json();
    } catch (error) {
        console.error('API Error:', error);
        return null;
    }
}

async function apiPut(url, data) {
    try {
        const response = await fetch(API_BASE_URL + url, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify(data)
        });
        
        if (response.status === 401 || response.status === 403) {
            logout();
            return null;
        }
        
        return response.json();
    } catch (error) {
        console.error('API Error:', error);
        return null;
    }
}

async function apiDelete(url) {
    try {
        const response = await fetch(API_BASE_URL + url, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        
        if (response.status === 401 || response.status === 403) {
            logout();
            return null;
        }
        
        return response.json();
    } catch (error) {
        console.error('API Error:', error);
        return null;
    }
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    window.location.href = '/index.html';
}

function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('es-BO', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}

function formatDateForInput(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function formatCurrency(amount) {
    return parseFloat(amount || 0).toFixed(2) + ' Bs.';
}

function formatNumber(num, decimals = 2) {
    return parseFloat(num || 0).toFixed(decimals);
}

function showToast(message, type = 'info') {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = '';
    switch(type) {
        case 'success': icon = '✓'; break;
        case 'error': icon = '✗'; break;
        case 'warning': icon = '⚠'; break;
        default: icon = 'ℹ';
    }
    
    toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// Agregar animación de salida
const toastStyle = document.createElement('style');
toastStyle.textContent = `
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
`;
document.head.appendChild(toastStyle);

function showConfirm(title, message) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay active';
        overlay.innerHTML = `
            <div class="modal" style="max-width: 400px;">
                <div class="modal-header">
                    <h3 class="modal-title">${title}</h3>
                </div>
                <div class="modal-body">
                    <p>${message}</p>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" id="btnCancel">Cancelar</button>
                    <button class="btn btn-primary" id="btnConfirm">Confirmar</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(overlay);
        
        overlay.querySelector('#btnConfirm').onclick = () => {
            overlay.remove();
            resolve(true);
        };
        
        overlay.querySelector('#btnCancel').onclick = () => {
            overlay.remove();
            resolve(false);
        };
    });
}

function showLoading(show = true) {
    let loader = document.querySelector('.loading-overlay');
    
    if (show) {
        if (!loader) {
            loader = document.createElement('div');
            loader.className = 'loading-overlay';
            loader.innerHTML = `
                <div style="text-align: center;">
                    <div class="loader"></div>
                    <p class="loading-text">Cargando...</p>
                </div>
            `;
            document.body.appendChild(loader);
        }
        loader.style.display = 'flex';
    } else {
        if (loader) {
            loader.style.display = 'none';
        }
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        showToast('¡Copiado al portapapeles!', 'success');
        return true;
    } catch (err) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand('copy');
            showToast('¡Copiado al portapapeles!', 'success');
            return true;
        } catch (e) {
            showToast('Error al copiar', 'error');
            return false;
        } finally {
            document.body.removeChild(textarea);
        }
    }
}

function downloadBlob(blob, filename) {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
}

function initUserInfo() {
    const usuario = getUsuario();
    if (!usuario) return;
    
    const userAvatar = document.getElementById('userAvatar');
    const userName = document.getElementById('userName');
    const userRole = document.getElementById('userRole');
    
    if (userAvatar) {
        const initials = (usuario.nombres?.charAt(0) || '') + (usuario.apellido_paterno?.charAt(0) || '');
        userAvatar.textContent = initials.toUpperCase();
    }
    
    if (userName) {
        userName.textContent = usuario.nombre_completo || `${usuario.nombres} ${usuario.apellido_paterno}`;
    }
    
    if (userRole) {
        userRole.textContent = usuario.rol;
    }
}

function checkPagePermission(allowedRoles) {
    const usuario = getUsuario();
    if (!usuario || !allowedRoles.includes(usuario.rol)) {
        showToast('No tiene permisos para acceder', 'error');
        setTimeout(() => logout(), 1500);
        return false;
    }
    return true;
}