// =====================================================
// FUNCIONES DEL ADMINISTRADOR - LA SAGRADA FAMILIA R.L.
// =====================================================

let editContadorFilas = 0;
let asignacionActual = null;

document.addEventListener('DOMContentLoaded', function() {
    if (!checkPagePermission(['admin'])) return;
    
    initUserInfo();
    cargarFotoSidebar();
    cargarEstadisticas();
    cargarPerfil();
    cargarUsuarios();
    cargarHabilitaciones();
    cargarSelectUsuarios();
    
    document.getElementById('formHabilitacion')?.addEventListener('submit', crearHabilitacion);
    document.getElementById('formPerfil')?.addEventListener('submit', guardarPerfil);
});
 
// MEJORA 12: Foto y nombre en sidebar
function cargarFotoSidebar() {
    const u = JSON.parse(localStorage.getItem('usuario') || '{}');
    const nombreEl = document.getElementById('sidebarNombreDiv');
    const cargoEl  = document.getElementById('sidebarCargoDiv');
    const fotoEl   = document.getElementById('fotoSidebar');
    if (nombreEl) {
        const nombres = u.nombres || '';
        const apPat   = u.apellido_paterno || '';
        nombreEl.textContent = nombres ? `${nombres} ${apPat}`.trim() : (u.usuario || '');
    }
    if (cargoEl) cargoEl.textContent = u.cargo || '';
    if (fotoEl && u.id) {
        fotoEl.src = `/api/usuario/${u.id}/foto?t=${Date.now()}`;
        fotoEl.onerror = () => { fotoEl.src = '/Imagen/loguin.jpg'; };
    }
}

function mostrarSeccion(seccion, elemento) {
    document.querySelectorAll('.seccion-content').forEach(s => s.style.display = 'none');
    document.querySelectorAll('.menu-item').forEach(m => m.classList.remove('active'));
    
    document.getElementById(`seccion-${seccion}`).style.display = 'block';
    if (elemento) elemento.classList.add('active');
}

// =====================================================
// ESTADÍSTICAS
// =====================================================

async function cargarEstadisticas() {
    try {
        const stats = await apiGet('/api/admin/estadisticas');
        if (stats) {
            document.getElementById('statUsuarios').textContent = stats.total_usuarios;
            document.getElementById('statHabilitados').textContent = stats.usuarios_habilitados;
            document.getElementById('statAsignaciones').textContent = stats.asignaciones_completadas;
            document.getElementById('statGastos').textContent = stats.total_gastos;
            document.getElementById('statGastoMensual').textContent = formatNumber(stats.gasto_mensual);
            document.getElementById('statSupervisores').textContent = stats.total_supervisores;
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

// =====================================================
// PERFIL
// =====================================================

async function cargarPerfil() {
    try {
        const perfil = await apiGet('/api/usuario/perfil');
        if (perfil) {
            document.getElementById('perfil_nombres').value = perfil.nombres;
            document.getElementById('perfil_apellido_paterno').value = perfil.apellido_paterno;
            document.getElementById('perfil_apellido_materno').value = perfil.apellido_materno;
            document.getElementById('perfil_cargo').value = perfil.cargo;
            document.getElementById('perfil_usuario').value = perfil.usuario;
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

async function guardarPerfil(e) {
    e.preventDefault();
    
    const data = {
        nombres: document.getElementById('perfil_nombres').value,
        apellido_paterno: document.getElementById('perfil_apellido_paterno').value,
        apellido_materno: document.getElementById('perfil_apellido_materno').value,
        cargo: document.getElementById('perfil_cargo').value,
        usuario: document.getElementById('perfil_usuario').value,
        contrasena: document.getElementById('perfil_contrasena').value
    };
    
    try {
        showLoading(true);
        const result = await apiPut('/api/admin/perfil', data);
        if (result?.success) {
            showToast('Perfil actualizado', 'success');
            document.getElementById('perfil_contrasena').value = '';
        } else {
            showToast(result?.error || 'Error', 'error');
        }
    } catch (error) {
        showToast('Error', 'error');
    } finally {
        showLoading(false);
    }
}

// Incluir todas las funciones de supervisor
// (Las mismas funciones de supervisor.js: cargarUsuarios, guardarUsuario, etc.)

async function cargarUsuarios() {
    try {
        const usuarios = await apiGet('/api/supervisor/usuarios');
        const tbody = document.getElementById('usuariosBody');
        
        if (!usuarios || usuarios.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center">No hay usuarios</td></tr>';
            return;
        }
        
        tbody.innerHTML = usuarios.map(u => `
            <tr>
                <td>${escapeHtml(u.nombres)} ${escapeHtml(u.apellido_paterno)} ${escapeHtml(u.apellido_materno)}</td>
                <td>${escapeHtml(u.cargo)}</td>
                <td>${escapeHtml(u.ci)}</td>
                <td>${escapeHtml(u.email_corporativo)}</td>
                <td>${escapeHtml(u.usuario)}</td>
                <td><span class="badge badge-${u.rol === 'admin' ? 'danger' : u.rol === 'supervisor' ? 'warning' : 'primary'}">${u.rol}</span></td>
                <td><span class="badge badge-${u.habilitado ? 'success' : 'danger'}">${u.habilitado ? 'Activo' : 'Inactivo'}</span></td>
                <td class="actions">
                    <button class="btn btn-sm btn-outline" onclick="editarUsuario(${u.id})" title="Editar">Editar</button>
                    <button class="btn btn-sm btn-warning" onclick="abrirModalContrasena(${u.id})" title="Cambiar contraseña">Cambiar contraseña</button>
                    <button class="btn btn-sm btn-${u.habilitado ? 'danger' : 'success'}" onclick="toggleUsuario(${u.id}, ${!u.habilitado})">${u.habilitado ? 'Desactivar' : 'Activar'}</button>
                    <button class="btn btn-sm btn-danger" onclick="eliminarUsuario(${u.id})" title="Eliminar">Eliminar</button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Error:', error);
    }
}

function abrirModalUsuario() {
    document.getElementById('formUsuario').reset();
    document.getElementById('usuario_id').value = '';
    document.getElementById('modalUsuarioTitulo').textContent = 'Nuevo Usuario';
    document.getElementById('contrasena_input').required = true;
    document.getElementById('modalUsuario').classList.add('active');
}

function cerrarModalUsuario() {
    document.getElementById('modalUsuario').classList.remove('active');
}

async function editarUsuario(id) {
    try {
        const usuarios = await apiGet('/api/supervisor/usuarios');
        const usuario = usuarios.find(u => u.id === id);
        if (!usuario) return;
        
        document.getElementById('usuario_id').value = usuario.id;
        document.getElementById('nombres').value = usuario.nombres;
        document.getElementById('apellido_paterno').value = usuario.apellido_paterno;
        document.getElementById('apellido_materno').value = usuario.apellido_materno;
        document.getElementById('cargo').value = usuario.cargo;
        document.getElementById('ci').value = usuario.ci;
        document.getElementById('extension').value = usuario.extension || '';
        document.getElementById('email_corporativo').value = usuario.email_corporativo;
        document.getElementById('usuario_input').value = usuario.usuario;
        document.getElementById('rol').value = usuario.rol;
        
        document.getElementById('modalUsuarioTitulo').textContent = 'Editar Usuario';
        document.getElementById('contrasena_input').required = false;
        document.getElementById('modalUsuario').classList.add('active');
    } catch (error) {
        showToast('Error', 'error');
    }
}

async function guardarUsuario() {
    const id = document.getElementById('usuario_id').value;
    const data = {
        nombres: document.getElementById('nombres').value,
        apellido_paterno: document.getElementById('apellido_paterno').value,
        apellido_materno: document.getElementById('apellido_materno').value,
        cargo: document.getElementById('cargo').value,
        ci: document.getElementById('ci').value,
        extension: document.getElementById('extension').value,
        email_corporativo: document.getElementById('email_corporativo').value,
        usuario: document.getElementById('usuario_input').value,
        rol: document.getElementById('rol').value,
        habilitado: true
    };
    
    const contrasena = document.getElementById('contrasena_input').value;
    if (contrasena) {
        if (contrasena.length < 8) {
            showToast('Mínimo 8 caracteres', 'error');
            return;
        }
        data.contrasena = contrasena;
    } else if (!id) {
        showToast('Contraseña requerida', 'error');
        return;
    }
    
    try {
        showLoading(true);
        const result = id 
            ? await apiPut(`/api/supervisor/usuario/${id}`, data)
            : await apiPost('/api/supervisor/usuario', data);
        
        if (result?.success) {
            showToast(id ? 'Actualizado' : 'Creado', 'success');
            cerrarModalUsuario();
            cargarUsuarios();
            cargarSelectUsuarios();
        } else {
            showToast(result?.error || 'Error', 'error');
        }
    } catch (error) {
        showToast('Error', 'error');
    } finally {
        showLoading(false);
    }
}

async function toggleUsuario(id, habilitar) {
    try {
        const result = await apiPut(`/api/supervisor/usuario/${id}`, { habilitado: habilitar });
        if (result?.success) {
            showToast('Actualizado', 'success');
            cargarUsuarios();
        }
    } catch (error) {
        showToast('Error', 'error');
    }
}

async function eliminarUsuario(id) {
    const ok = await showConfirm('Eliminar', '¿Eliminar usuario?');
    if (!ok) return;
    
    try {
        const result = await apiDelete(`/api/supervisor/usuario/${id}`);
        if (result?.success) {
            showToast('Eliminado', 'success');
            cargarUsuarios();
            cargarSelectUsuarios();
        }
    } catch (error) {
        showToast('Error', 'error');
    }
}

function abrirModalContrasena(id) {
    document.getElementById('contrasena_usuario_id').value = id;
    document.getElementById('nueva_contrasena').value = '';
    document.getElementById('confirmar_contrasena').value = '';
    document.getElementById('modalContrasena').classList.add('active');
}

function cerrarModalContrasena() {
    document.getElementById('modalContrasena').classList.remove('active');
}

async function cambiarContrasena() {
    const id = document.getElementById('contrasena_usuario_id').value;
    const nueva = document.getElementById('nueva_contrasena').value;
    const confirmar = document.getElementById('confirmar_contrasena').value;
    
    if (nueva.length < 8) { showToast('Mínimo 8 caracteres', 'error'); return; }
    if (nueva !== confirmar) { showToast('No coinciden', 'error'); return; }
    
    try {
        const result = await apiPut(`/api/supervisor/usuario/${id}/contrasena`, { contrasena: nueva });
        if (result?.success) {
            showToast('Cambiada', 'success');
            cerrarModalContrasena();
        }
    } catch (error) {
        showToast('Error', 'error');
    }
}

async function cargarSelectUsuarios() {
    try {
        const usuarios = await apiGet('/api/supervisor/usuarios-rol/usuario');
        ['usuario_habilitar', 'filtro_usuario', 'form_usuario'].forEach(id => {
            const select = document.getElementById(id);
            if (!select) return;
            const first = select.options[0];
            select.innerHTML = '';
            select.appendChild(first);
            usuarios?.forEach(u => {
                const opt = document.createElement('option');
                opt.value = u.id;
                opt.textContent = `${u.nombres} ${u.apellido_paterno}`;
                select.appendChild(opt);
            });
        });
    } catch (error) {
        console.error('Error:', error);
    }
}

async function cargarHabilitaciones() {
    try {
        const data = await apiGet('/api/supervisor/habilitaciones');
        const tbody = document.getElementById('habilitacionesBody');
        
        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">Sin datos</td></tr>';
            return;
        }
        
        tbody.innerHTML = data.map(h => `
            <tr>
                <td>${escapeHtml(h.nombre_usuario)}</td>
                <td>${formatDate(h.fecha_inicio)}</td>
                <td>${formatDate(h.fecha_fin)}</td>
                <td>${escapeHtml(h.email_corporativo)}</td>
                <td><span class="badge badge-${h.habilitado ? 'success' : 'danger'}">${h.habilitado ? 'Activo' : 'Inactivo'}</span></td>
                <td class="actions">
                    <button class="btn btn-sm btn-info" onclick="copiarTexto(${h.id})" title="Copiar enlace">Copiar</button>
                    <button class="btn btn-sm btn-primary" onclick="abrirModalEditarFechas(${h.id}, '${h.fecha_inicio}', '${h.fecha_fin}')" title="Modificar fechas">Editar fechas</button>
                    <button class="btn btn-sm btn-${h.habilitado ? 'warning' : 'success'}" onclick="toggleHabilitacion(${h.id}, ${!h.habilitado})">${h.habilitado ? 'Desactivar' : 'Activar'}</button>
                    <button class="btn btn-sm btn-danger" onclick="eliminarHabilitacion(${h.id})">Eliminar</button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Error:', error);
    }
}

async function crearHabilitacion(e) {
    e.preventDefault();
    
    const data = {
        usuario_id: document.getElementById('usuario_habilitar').value,
        fecha_inicio: document.getElementById('fecha_inicio_hab').value,
        fecha_fin: document.getElementById('fecha_fin_hab').value
    };
    
    if (new Date(data.fecha_inicio) >= new Date(data.fecha_fin)) {
        showToast('Fecha fin debe ser mayor', 'error');
        return;
    }
    
    try {
        showLoading(true);
        const result = await apiPost('/api/supervisor/habilitacion', data);
        if (result?.success) {
            showToast('Creada', 'success');
            document.getElementById('formHabilitacion').reset();
            cargarHabilitaciones();
        } else {
            showToast(result?.error || 'Error', 'error');
        }
    } catch (error) {
        showToast('Error', 'error');
    } finally {
        showLoading(false);
    }
}

async function toggleHabilitacion(id, habilitar) {
    try {
        const result = await apiPut(`/api/supervisor/habilitacion/${id}`, { habilitado: habilitar });
        if (result?.success) {
            showToast('Actualizado', 'success');
            cargarHabilitaciones();
        }
    } catch (error) {
        showToast('Error', 'error');
    }
}

async function eliminarHabilitacion(id) {
    const ok = await showConfirm('Eliminar', '¿Eliminar?');
    if (!ok) return;
    
    try {
        const result = await apiDelete(`/api/supervisor/habilitacion/${id}`);
        if (result?.success) {
            showToast('Eliminado', 'success');
            cargarHabilitaciones();
        }
    } catch (error) {
        showToast('Error', 'error');
    }
}

async function copiarTexto(id) {
    try {
        const data = await apiGet(`/api/supervisor/habilitacion/${id}/texto`);
        if (data?.texto) await copyToClipboard(data.texto);
    } catch (error) {
        showToast('Error', 'error');
    }
}

async function filtrarRegistros() {
    const usuario = document.getElementById('filtro_usuario').value;
    const inicio = document.getElementById('filtro_fecha_inicio').value;
    const fin = document.getElementById('filtro_fecha_fin').value;
    
    let url = '/api/supervisor/registros?';
    if (usuario) url += `usuario_id=${usuario}&`;
    if (inicio)  url += `fecha_inicio=${inicio}&`;
    if (fin)     url += `fecha_fin=${fin}&`;
    
    try {
        showLoading(true);
        const data = await apiGet(url);
        const container = document.getElementById('registrosContainer');
        
        if (!data || data.length === 0) {
            container.innerHTML = '<div class="empty-state"><h3>Sin registros</h3></div>';
            return;
        }
        
        container.innerHTML = data.map(r => `
            <div class="card mb-2">
                <div class="card-header">
                    <div>
                        <h3 class="card-title">${escapeHtml(r.nombre_usuario)}</h3>
                        <small style="color:#666;">${r.ciudad_origen} → ${r.ciudad_destino} | ${formatDate(r.fecha_salida)} al ${formatDate(r.fecha_llegada)}</small>
                    </div>
                    <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
                        <span class="badge badge-success">${r.estado}</span>
                        <button class="btn btn-sm btn-outline" onclick="descargarPDF(${r.id})" title="Descargar PDF">Descargar PDF</button>
                        <button class="btn btn-sm btn-info" onclick="verAdjuntosAsignacion(${r.id})" title="Ver documentos adjuntos">Ver adjuntos</button>
                        <button class="btn btn-sm btn-warning" onclick="abrirModalEditar(${r.id})" title="Editar registro">Editar</button>
                    </div>
                </div>
                <div class="card-body" style="padding:10px 16px;">
                    <div style="display:flex;gap:20px;flex-wrap:wrap;">
                        <span><strong>Monto asignado:</strong> ${formatCurrency(r.monto_asignacion)}</span>
                        <span><strong>Gastos:</strong> ${r.gastos ? r.gastos.length : 0} ítem(s)</span>
                        <span><strong>Total gastado:</strong> ${formatCurrency(r.gastos ? r.gastos.reduce((s,g)=>s+parseFloat(g.monto||0),0) : 0)}</span>
                    </div>
                    ${r.gastos && r.gastos.length > 0 ? `
                    <div style="margin-top:8px;overflow-x:auto;">
                        <table class="table" style="font-size:0.8rem;min-width:500px;">
                            <thead>
                                <tr>
                                    <th>Nº</th><th>Tipo Gasto</th><th>Comprobante</th>
                                    <th>Nº Comp.</th><th>Monto</th><th>Observaciones</th><th>Doc.</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${r.gastos.map((g,i) => `
                                <tr>
                                    <td>${i+1}</td>
                                    <td>${escapeHtml(g.tipo_gasto)}</td>
                                    <td>${escapeHtml(g.tipo_comprobante)}</td>
                                    <td>${escapeHtml(g.numero_comprobante||'-')}</td>
                                    <td>${formatCurrency(g.monto)}</td>
                                    <td>${escapeHtml(g.observaciones||'-')}</td>
                                    <td>${g.nombre_archivo
                                        ? `<button class="btn btn-sm btn-outline" onclick="verDocumentoGasto(${g.id})" title="Ver adjunto">👁️</button>`
                                        : '<span style="color:#aaa;">–</span>'}</td>
                                </tr>`).join('')}
                            </tbody>
                        </table>
                    </div>` : ''}
                </div>
            </div>
        `).join('');
    } catch (error) {
        showToast('Error al cargar registros', 'error');
    } finally {
        showLoading(false);
    }
}

// ─── Ver todos los adjuntos de una asignación ─────────────────────────────
async function verAdjuntosAsignacion(asignacionId) {
    try {
        showLoading(true);
        const registros = await apiGet('/api/supervisor/registros?');
        const reg = registros.find(r => r.id === asignacionId);
        if (!reg) { showToast('No encontrado', 'error'); return; }

        const gastosCon = (reg.gastos || []).filter(g => g.nombre_archivo);
        if (gastosCon.length === 0) {
            showToast('Este registro no tiene documentos adjuntos', 'info');
            return;
        }

        // Abrir modal de adjuntos
        let modal = document.getElementById('modalAdjuntos');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'modalAdjuntos';
            modal.className = 'modal-overlay';
            modal.innerHTML = `
                <div class="modal" style="max-width:700px;">
                    <div class="modal-header">
                        <h3 class="modal-title">📎 Documentos Adjuntos</h3>
                        <button class="modal-close" onclick="document.getElementById('modalAdjuntos').classList.remove('active')">×</button>
                    </div>
                    <div class="modal-body" id="adjuntosBody" style="max-height:65vh;overflow-y:auto;"></div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="document.getElementById('modalAdjuntos').classList.remove('active')">Cerrar</button>
                    </div>
                </div>`;
            document.body.appendChild(modal);
        }

        const body = document.getElementById('adjuntosBody');
        body.innerHTML = gastosCon.map(g => `
            <div style="border:1px solid #ddd;border-radius:8px;padding:12px;margin-bottom:10px;">
                <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
                    <div>
                        <strong>${escapeHtml(g.tipo_gasto)}</strong> — ${escapeHtml(g.tipo_comprobante)}
                        ${g.numero_comprobante ? ` Nº ${escapeHtml(g.numero_comprobante)}` : ''}
                        <br><small style="color:#666;">Archivo: ${escapeHtml(g.nombre_archivo)}</small>
                    </div>
                    <button class="btn btn-sm btn-primary" onclick="verDocumentoGasto(${g.id})">Ver documento</button>
                </div>
            </div>
        `).join('');

        modal.classList.add('active');
    } catch(e) {
        showToast('Error al cargar adjuntos', 'error');
    } finally {
        showLoading(false);
    }
}

// ─── Ver documento adjunto ────────────────────────────────────────────────
async function verDocumentoGasto(gastoId) {
    try {
        const res = await fetch(`/api/documento/${gastoId}`,
            { headers: { 'Authorization': `Bearer ${getToken()}` } });
        if (!res.ok) { showToast('Sin documento adjunto', 'warning'); return; }
        const blob = await res.blob();
        window.open(URL.createObjectURL(blob), '_blank');
    } catch(e) { showToast('Error al cargar documento', 'error'); }
}

// ─── Abrir modal de edición ───────────────────────────────────────────────
async function abrirModalEditar(asignacionId) {
    try {
        showLoading(true);
        const registros = await apiGet('/api/supervisor/registros?');
        asignacionActual = registros.find(r => r.id === asignacionId);
        if (!asignacionActual) { showToast('No encontrado', 'error'); return; }

        document.getElementById('edit_asignacion_id').value    = asignacionActual.id;
        document.getElementById('edit_ciudad_origen').value    = asignacionActual.ciudad_origen;
        document.getElementById('edit_ciudad_destino').value   = asignacionActual.ciudad_destino;
        document.getElementById('edit_fecha_salida').value     = formatDateForInput(asignacionActual.fecha_salida);
        document.getElementById('edit_fecha_llegada').value    = formatDateForInput(asignacionActual.fecha_llegada);
        document.getElementById('edit_monto_asignacion').value = asignacionActual.monto_asignacion;

        const tbody = document.getElementById('editGastosBody');
        tbody.innerHTML = '';
        editContadorFilas = 0;

        if (asignacionActual.gastos && asignacionActual.gastos.length > 0) {
            asignacionActual.gastos.forEach(g => agregarFilaEdicion(g));
        } else {
            agregarFilaEdicion();
        }

        calcularTotalEdicion();
        document.getElementById('modalEditarAsignacion').classList.add('active');
    } catch(e) {
        console.error(e);
        showToast('Error al abrir edición', 'error');
    } finally {
        showLoading(false);
    }
}

function cerrarModalEditar() {
    document.getElementById('modalEditarAsignacion').classList.remove('active');
    asignacionActual = null;
}

// ─── Fila de edición (igual al supervisor) ───────────────────────────────
function agregarFilaEdicion(gasto = null) {
    editContadorFilas++;
    const tbody = document.getElementById('editGastosBody');
    const row = document.createElement('tr');
    row.dataset.gastoId = gasto?.id || '';
    row.innerHTML = `
        <td class="text-center">${editContadorFilas}</td>
        <td>
            <select name="edit_tipo_gasto" class="tipo-gasto" onchange="toggleHospedajeEdicion(this)" required>
                <option value="">Seleccionar...</option>
                <option value="PASAJE" ${gasto?.tipo_gasto==='PASAJE'?'selected':''}>PASAJE</option>
                <option value="HOSPEDAJE" ${gasto?.tipo_gasto==='HOSPEDAJE'?'selected':''}>HOSPEDAJE</option>
                <option value="OTROS SERVICIOS" ${gasto?.tipo_gasto==='OTROS SERVICIOS'?'selected':''}>OTROS SERVICIOS</option>
                <option value="COMBUSTIBLE" ${gasto?.tipo_gasto==='COMBUSTIBLE'?'selected':''}>COMBUSTIBLE</option>
                <option value="OTROS BIENES" ${gasto?.tipo_gasto==='OTROS BIENES'?'selected':''}>OTROS BIENES</option>
            </select>
        </td>
        <td>
            <div class="hospedaje-fields ${(gasto?.tipo_gasto==='HOSPEDAJE'||gasto?.tipo_gasto==='COMBUSTIBLE')?'visible':''}">
                <div style="margin-bottom:4px;">
                    <label style="font-size:0.72rem;font-weight:600;display:block;">Nombre Proveedor</label>
                    <input type="text" name="edit_nombre_proveedor" value="${escapeHtml(gasto?.nombre_proveedor_hospedaje||'')}" placeholder="Nombre" style="font-size:0.8rem;">
                </div>
                <div style="margin-bottom:4px;">
                    <label style="font-size:0.72rem;font-weight:600;display:block;">N° CI</label>
                    <input type="number" name="edit_ci_proveedor" value="${gasto?.ci_proveedor||''}" placeholder="CI" style="font-size:0.8rem;">
                </div>
                <div>
                    <label style="font-size:0.72rem;font-weight:600;display:block;">Departamento</label>
                    <select name="edit_ext_proveedor" style="font-size:0.8rem;width:100%;">
                        <option value="">Departamento...</option>
                        ${['LP:La Paz','SC:Santa Cruz','CB:Cochabamba','OR:Oruro','PT:Potosí','CH:Chuquisaca','TJ:Tarija','BE:Beni','PD:Pando']
                          .map(d=>{const[v,l]=d.split(':');return`<option value="${v}" ${gasto?.extension_proveedor===v?'selected':''}>${l}</option>`;}).join('')}
                    </select>
                </div>
            </div>
        </td>
        <td>
            <select name="edit_tipo_comprobante" onchange="toggleObservacionesEdicion(this)" required>
                <option value="">Seleccionar...</option>
                <option value="FACTURA" ${gasto?.tipo_comprobante==='FACTURA'?'selected':''}>FACTURA</option>
                <option value="RECIBO"  ${gasto?.tipo_comprobante==='RECIBO'?'selected':''}>RECIBO</option>
                <option value="NINGUNO" ${gasto?.tipo_comprobante==='NINGUNO'?'selected':''}>NINGUNO</option>
            </select>
            <div class="fecha-emision-wrap" style="display:${(gasto?.tipo_comprobante==='FACTURA'||gasto?.tipo_comprobante==='RECIBO')?'block':'none'};margin-top:4px;">
                <label style="font-size:0.72rem;font-weight:600;display:block;">Fecha Emisión</label>
                <input type="date" name="edit_fecha_emision_comprobante" value="${formatDateForInput(gasto?.fecha_emision_comprobante)||''}" style="font-size:0.8rem;">
            </div>
        </td>
        <td><input type="text" name="edit_numero_comprobante" value="${escapeHtml(gasto?.numero_comprobante||'')}" placeholder="Nº" style="font-size:0.8rem;"></td>
        <td><input type="number" name="edit_monto" step="0.01" min="0.01" value="${gasto?.monto||''}" oninput="calcularTotalEdicion()" required style="font-size:0.8rem;"></td>
        <td>
            <div class="doc-wrap">
                <label class="btn-adj" style="cursor:pointer;background:var(--color-secundario);color:white;padding:4px 8px;border-radius:4px;font-size:0.75rem;" onclick="this.nextElementSibling.click()">
                    📎 ${gasto?.nombre_archivo ? '✓ '+gasto.nombre_archivo.substring(0,10)+'...' : 'Adjuntar'}
                </label>
                <input type="file" name="edit_documento" accept="image/*,.pdf" style="display:none;" onchange="manejarAdjuntoEdicion(this)">
                <div class="doc-prev" style="display:${gasto?.nombre_archivo?'flex':'none'};align-items:center;gap:4px;margin-top:4px;">
                    <span class="doc-pdf" style="font-size:1.4rem;">📄</span>
                    ${gasto?.id ? `<button type="button" onclick="verDocumentoGasto(${gasto.id})" style="background:none;border:none;cursor:pointer;font-size:1rem;">🔍</button>` : ''}
                    <button type="button" onclick="quitarAdjEdicion(this)" style="background:none;border:none;cursor:pointer;font-size:1rem;">🗑️</button>
                </div>
            </div>
        </td>
        <td><textarea name="edit_observaciones" rows="2" style="font-size:0.8rem;text-transform:uppercase;" oninput="this.value=this.value.toUpperCase()" placeholder="Observaciones...">${escapeHtml(gasto?.observaciones||'')}</textarea></td>
        <td class="text-center"><button type="button" class="btn-eliminar-gasto" onclick="eliminarFilaEdicion(this)">ELIMINAR</button></td>
    `;
    tbody.appendChild(row);
    if (gasto?.tipo_comprobante) {
        const sel = row.querySelector('[name="edit_tipo_comprobante"]');
        if (sel) toggleObservacionesEdicion(sel);
    }
}

function eliminarFilaEdicion(btn) {
    if (document.querySelectorAll('#editGastosBody tr').length <= 1) {
        showToast('Mínimo un gasto requerido', 'warning');
        return;
    }
    btn.closest('tr').remove();
    document.querySelectorAll('#editGastosBody tr').forEach((f,i) => {
        f.querySelector('td:first-child').textContent = i + 1;
    });
    calcularTotalEdicion();
}

function toggleHospedajeEdicion(select) {
    const fields = select.closest('tr').querySelector('.hospedaje-fields');
    const activo = select.value === 'HOSPEDAJE' || select.value === 'COMBUSTIBLE';
    if (activo) { fields.classList.add('visible'); }
    else        { fields.classList.remove('visible'); fields.querySelectorAll('input,select').forEach(i=>i.value=''); }
}

function toggleObservacionesEdicion(select) {
    const row = select.closest('tr');
    const obs       = row.querySelector('[name="edit_observaciones"]');
    const numComp   = row.querySelector('[name="edit_numero_comprobante"]');
    const fechaWrap = row.querySelector('.fecha-emision-wrap');
    const fechaInp  = row.querySelector('[name="edit_fecha_emision_comprobante"]');
    if (select.value === 'NINGUNO') {
        obs.required=true; obs.style.borderColor='var(--color-error)'; obs.placeholder='OBLIGATORIO';
        numComp.required=false;
        if(fechaWrap) fechaWrap.style.display='none';
        if(fechaInp)  fechaInp.required=false;
    } else if (select.value === 'FACTURA' || select.value === 'RECIBO') {
        obs.required=false; obs.style.borderColor=''; obs.placeholder='Observaciones...';
        numComp.required=true;
        if(fechaWrap) fechaWrap.style.display='block';
        if(fechaInp)  fechaInp.required=true;
    } else {
        obs.required=false; obs.style.borderColor=''; obs.placeholder='Observaciones...';
        numComp.required=false;
        if(fechaWrap) fechaWrap.style.display='none';
        if(fechaInp)  fechaInp.required=false;
    }
}

function manejarAdjuntoEdicion(input) {
    const tipos=['image/jpeg','image/png','image/gif','image/webp','application/pdf'];
    const f=input.files[0]; if(!f) return;
    if(!tipos.includes(f.type)){showToast('Solo imágenes y PDF','error');input.value='';return;}
    if(f.size>5*1024*1024){showToast('Máximo 5MB','error');input.value='';return;}
    const wrap=input.closest('.doc-wrap');
    wrap.querySelector('.doc-prev').style.display='flex';
    wrap.querySelector('.btn-adj').textContent='✓ '+f.name.substring(0,12)+'...';
}

function quitarAdjEdicion(btn) {
    const wrap=btn.closest('.doc-wrap');
    wrap.querySelector('input[type=file]').value='';
    wrap.querySelector('.doc-prev').style.display='none';
    wrap.querySelector('.btn-adj').textContent='📎 Adjuntar';
}

function calcularTotalEdicion() {
    let total=0;
    document.querySelectorAll('[name="edit_monto"]').forEach(i=>{ total+=parseFloat(i.value)||0; });
    const el=document.getElementById('editTotalGastos');
    if(el) el.textContent=total.toFixed(2);
}

async function guardarCambiosAsignacion() {
    const asignacionId = document.getElementById('edit_asignacion_id').value;
    const monto = parseFloat(document.getElementById('edit_monto_asignacion').value);
    if (isNaN(monto)||monto<0) { showToast('Monto inválido','error'); return; }

    const gastos = [];
    for (const fila of document.querySelectorAll('#editGastosBody tr')) {
        const tg  = fila.querySelector('[name="edit_tipo_gasto"]').value;
        const tc  = fila.querySelector('[name="edit_tipo_comprobante"]').value;
        const mon = fila.querySelector('[name="edit_monto"]').value;
        if (!tg||!tc||!mon) { showToast('Complete todos los campos requeridos','error'); return; }
        gastos.push({
            id: fila.dataset.gastoId ? parseInt(fila.dataset.gastoId) : null,
            tipo_gasto:    tg,
            tipo_comprobante: tc,
            numero_comprobante: fila.querySelector('[name="edit_numero_comprobante"]')?.value||null,
            monto: mon,
            observaciones: fila.querySelector('[name="edit_observaciones"]')?.value||null,
            nombre_proveedor_hospedaje: fila.querySelector('[name="edit_nombre_proveedor"]')?.value||null,
            ci_proveedor:  fila.querySelector('[name="edit_ci_proveedor"]')?.value||null,
            extension_proveedor: fila.querySelector('[name="edit_ext_proveedor"]')?.value||null,
            fecha_emision_comprobante: fila.querySelector('[name="edit_fecha_emision_comprobante"]')?.value||null,
        });
    }

    const data = {
        ciudad_origen:    document.getElementById('edit_ciudad_origen').value,
        ciudad_destino:   document.getElementById('edit_ciudad_destino').value,
        fecha_salida:     document.getElementById('edit_fecha_salida').value,
        fecha_llegada:    document.getElementById('edit_fecha_llegada').value,
        monto_asignacion: monto,
        gastos
    };

    try {
        showLoading(true);
        const result = await apiPut(`/api/supervisor/asignacion/${asignacionId}`, data);
        if (result?.success) {
            showToast('¡Cambios guardados correctamente!','success');
            cerrarModalEditar();
            filtrarRegistros();
        } else {
            showToast(result?.error||'Error al guardar','error');
        }
    } catch(e) {
        console.error(e);
        showToast('Error de conexión','error');
    } finally {
        showLoading(false);
    }
}

async function generarReporte() {
    const inicio = document.getElementById('reporte_fecha_inicio').value;
    const fin = document.getElementById('reporte_fecha_fin').value;
    
    if (!inicio || !fin) { showToast('Seleccione fechas', 'error'); return; }
    
    try {
        showLoading(true);
        const response = await fetch(`/api/reporte/gastos?fecha_inicio=${inicio}&fecha_fin=${fin}`, {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        
        if (response.ok) {
            const blob = await response.blob();
            downloadBlob(blob, `REPORTE_${inicio}_${fin}.xlsx`);
            showToast('Generado', 'success');
        }
    } catch (error) {
        showToast('Error', 'error');
    } finally {
        showLoading(false);
    }
}

async function generarFormularios() {
    const usuario = document.getElementById('form_usuario').value;
    const inicio = document.getElementById('form_fecha_inicio').value;
    const fin = document.getElementById('form_fecha_fin').value;
    
    let url = '/api/reporte/formularios?';
    if (usuario) url += `usuario_id=${usuario}&`;
    if (inicio) url += `fecha_inicio=${inicio}&`;
    if (fin) url += `fecha_fin=${fin}&`;
    
    try {
        showLoading(true);
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        
        if (response.ok) {
            const blob = await response.blob();
            downloadBlob(blob, `FORMULARIOS_${new Date().toISOString().split('T')[0]}.xlsx`);
            showToast('Generado', 'success');
        }
    } catch (error) {
        showToast('Error', 'error');
    } finally {
        showLoading(false);
    }
}
// =====================================================
// EDITAR FECHAS DE HABILITACIÓN
// =====================================================

async function abrirModalEditarFechas(id, fechaInicio, fechaFin) {
    document.getElementById('editHabId').value = id;
    const fi = fechaInicio ? fechaInicio.split('T')[0] : '';
    const ff = fechaFin ? fechaFin.split('T')[0] : '';
    document.getElementById('editHabFechaInicio').value = fi;
    document.getElementById('editHabFechaFin').value = ff;
    document.getElementById('modalEditarFechas').classList.add('active');
}

function cerrarModalEditarFechas() {
    document.getElementById('modalEditarFechas').classList.remove('active');
}

async function guardarFechasHabilitacion() {
    const id = document.getElementById('editHabId').value;
    const fechaInicio = document.getElementById('editHabFechaInicio').value;
    const fechaFin = document.getElementById('editHabFechaFin').value;

    if (!fechaInicio || !fechaFin) {
        showToast('Ingrese ambas fechas', 'error');
        return;
    }
    if (new Date(fechaInicio) >= new Date(fechaFin)) {
        showToast('Fecha fin debe ser mayor a fecha inicio', 'error');
        return;
    }

    try {
        showLoading(true);
        const result = await apiPut(`/api/supervisor/habilitacion/${id}/fechas`, {
            fecha_inicio: fechaInicio,
            fecha_fin: fechaFin
        });
        if (result?.success) {
            showToast('Fechas actualizadas correctamente', 'success');
            cerrarModalEditarFechas();
            cargarHabilitaciones();
        } else {
            showToast(result?.error || 'Error al actualizar', 'error');
        }
    } catch (error) {
        showToast('Error de conexión', 'error');
    } finally {
        showLoading(false);
    }
}

// =====================================================
// DESCARGAR PDF - ADMIN
// =====================================================
async function descargarPDF(asignacionId) {
    try {
        showLoading(true);
        const response = await fetch('/api/generar-pdf', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify({ asignacion_id: asignacionId })
        });

        if (response.ok) {
            const blob = await response.blob();
            downloadBlob(blob, `descargo_${asignacionId}.pdf`);
            showToast('PDF descargado correctamente', 'success');
        } else {
            const err = await response.json().catch(() => ({}));
            showToast(err.error || 'Error al generar PDF', 'error');
        }
    } catch (error) {
        console.error('Error PDF:', error);
        showToast('Error al descargar PDF', 'error');
    } finally {
        showLoading(false);
    }
}
