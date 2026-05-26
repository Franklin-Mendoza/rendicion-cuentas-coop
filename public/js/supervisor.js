// =====================================================
// FUNCIONES DEL SUPERVISOR - LA SAGRADA FAMILIA R.L.
// =====================================================

let editContadorFilas = 0;
let asignacionActual = null;

document.addEventListener('DOMContentLoaded', function() {
    if (!checkPagePermission(['supervisor', 'admin'])) return;
    
    initUserInfo();
    cargarFotoSidebar();
    cargarUsuarios();
    cargarHabilitaciones();
    cargarSelectUsuarios();
    
    document.getElementById('formHabilitacion').addEventListener('submit', crearHabilitacion);
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
// GESTIÓN DE USUARIOS
// =====================================================

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
        document.getElementById('contrasena_input').placeholder = 'Dejar vacío para no cambiar';
        document.getElementById('modalUsuario').classList.add('active');
    } catch (error) {
        showToast('Error al cargar usuario', 'error');
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
            showToast('Contraseña mínimo 8 caracteres', 'error');
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
            showToast(id ? 'Usuario actualizado' : 'Usuario creado', 'success');
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
    const ok = await showConfirm('Confirmar', `¿${habilitar ? 'Habilitar' : 'Deshabilitar'} usuario?`);
    if (!ok) return;
    
    try {
        const result = await apiPut(`/api/supervisor/usuario/${id}`, { habilitado: habilitar });
        if (result?.success) {
            showToast('Usuario actualizado', 'success');
            cargarUsuarios();
        }
    } catch (error) {
        showToast('Error', 'error');
    }
}

async function eliminarUsuario(id) {
    const ok = await showConfirm('Eliminar', '¿Eliminar este usuario? Esta acción no se puede deshacer.');
    if (!ok) return;
    
    try {
        const result = await apiDelete(`/api/supervisor/usuario/${id}`);
        if (result?.success) {
            showToast('Usuario eliminado', 'success');
            cargarUsuarios();
            cargarSelectUsuarios();
        }
    } catch (error) {
        showToast('Error', 'error');
    }
}

// Contraseña
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
            showToast('Contraseña cambiada', 'success');
            cerrarModalContrasena();
        }
    } catch (error) {
        showToast('Error', 'error');
    }
}

// =====================================================
// HABILITACIONES
// =====================================================

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
                opt.textContent = `${u.nombres} ${u.apellido_paterno} ${u.apellido_materno}`;
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
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">Sin habilitaciones</td></tr>';
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
            showToast('Habilitación creada', 'success');
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
    const ok = await showConfirm('Eliminar', '¿Eliminar habilitación?');
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

async function abrirModalEditarFechas(id, fechaInicio, fechaFin) {
    // Rellenar modal con datos actuales
    document.getElementById('editHabId').value = id;
    // Convertir fecha a formato YYYY-MM-DD para el input type=date
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

async function copiarTexto(id) {
    try {
        const data = await apiGet(`/api/supervisor/habilitacion/${id}/texto`);
        if (data?.texto) await copyToClipboard(data.texto);
    } catch (error) {
        showToast('Error', 'error');
    }
}

// =====================================================
// REGISTROS
// =====================================================

async function filtrarRegistros() {
    const usuarioId = document.getElementById('filtro_usuario').value;
    const fechaInicio = document.getElementById('filtro_fecha_inicio').value;
    const fechaFin = document.getElementById('filtro_fecha_fin').value;
    
    let url = '/api/supervisor/registros?';
    if (usuarioId) url += `usuario_id=${usuarioId}&`;
    if (fechaInicio) url += `fecha_inicio=${fechaInicio}&`;
    if (fechaFin) url += `fecha_fin=${fechaFin}&`;
    
    try {
        showLoading(true);
        const registros = await apiGet(url);
        const container = document.getElementById('registrosContainer');
        
        if (!registros || registros.length === 0) {
            container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📭</div><h3>No se encontraron registros</h3></div>`;
            return;
        }
        
        container.innerHTML = registros.map(r => {
            const totalGastos = r.gastos?.reduce((sum, g) => sum + parseFloat(g.monto), 0) || 0;
            const diferencia = parseFloat(r.monto_asignacion) - totalGastos;
            const colorDif = diferencia >= 0 ? 'var(--color-primario)' : 'var(--color-error)';
            const textoDif = diferencia >= 0 ? `RENDIR: ${diferencia.toFixed(2)} Bs.` : `REPONER: ${Math.abs(diferencia).toFixed(2)} Bs.`;
            
            return `
            <div class="card mb-2">
                <div class="card-header">
                    <h3 class="card-title">${escapeHtml(r.nombre_usuario)}</h3>
                    <div>
                        <span class="badge badge-success">${r.estado}</span>
                        <span class="badge" style="background:${colorDif};color:white;">${textoDif}</span>
                    </div>
                </div>
                <div class="card-body">
                    <div class="form-row mb-2">
                        <div><strong>Origen:</strong> ${escapeHtml(r.ciudad_origen)}</div>
                        <div><strong>Destino:</strong> ${escapeHtml(r.ciudad_destino)}</div>
                        <div><strong>Salida:</strong> ${formatDate(r.fecha_salida)}</div>
                        <div><strong>Llegada:</strong> ${formatDate(r.fecha_llegada)}</div>
                        <div><strong>Monto:</strong> ${formatCurrency(r.monto_asignacion)}</div>
                    </div>
                    
                    ${r.gastos && r.gastos.length > 0 ? `
                        <h4 class="mt-2 mb-1">Gastos:</h4>
                        <div class="table-container">
                            <table class="table">
                                <thead>
									<tr><th>Tipo</th><th>Comprobante</th><th>Nº</th><th>Monto</th><th>Obs.</th><th>Doc.</th></tr>
                                </thead>
                                <tbody>
                                    ${r.gastos.map(g => `
                                        <tr>
                                            <td>${g.tipo_gasto}${g.tipo_gasto === 'HOSPEDAJE' && g.nombre_proveedor_hospedaje ? ' - ' + escapeHtml(g.nombre_proveedor_hospedaje) : ''}</td>
                                            <td>${g.tipo_comprobante}</td>
                                            <td>${g.numero_comprobante || '-'}</td>
                                            <td>${formatCurrency(g.monto)}</td>
                                            <td>${escapeHtml(g.observaciones || '-')}</td>
                                            <td>${g.nombre_archivo
                                                ? `<button class="btn btn-sm btn-outline"
                                                    onclick="verDocumentoGasto(${g.id})">👁️</button>`
                                                : '-'}</td>
                                        </tr>
                                    `).join('')}
                                    <tr style="font-weight:bold;background:var(--color-fondo-alt);">
                                        <td colspan="3" class="text-right">TOTAL:</td>
                                        <td>${formatCurrency(totalGastos)}</td>
                                        <td></td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    ` : '<p class="text-muted">Sin gastos</p>'}
                </div>
                <div class="card-footer d-flex gap-2">
                    <button class="btn btn-primary btn-sm" onclick="descargarPDF(${r.id})">Descargar PDF</button>
                    <button class="btn btn-warning btn-sm" onclick="abrirModalEditar(${r.id})">Editar</button>
                </div>
            </div>
        `}).join('');
    } catch (error) {
        console.error('Error:', error);
        showToast('Error al cargar', 'error');
    } finally {
        showLoading(false);
    }
}

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
            showToast('PDF descargado', 'success');
        } else {
            showToast('Error', 'error');
        }
    } catch (error) {
        showToast('Error', 'error');
    } finally {
        showLoading(false);
    }
}

// =====================================================
// MODAL EDITAR ASIGNACIÓN
// =====================================================

async function abrirModalEditar(asignacionId) {
    try {
        showLoading(true);
        
        const registros = await apiGet(`/api/supervisor/registros?`);
        asignacionActual = registros.find(r => r.id === asignacionId);
        
        if (!asignacionActual) {
            showToast('No encontrado', 'error');
            return;
        }
        
        document.getElementById('edit_asignacion_id').value = asignacionActual.id;
        document.getElementById('edit_ciudad_origen').value = asignacionActual.ciudad_origen;
        document.getElementById('edit_ciudad_destino').value = asignacionActual.ciudad_destino;
        document.getElementById('edit_fecha_salida').value = formatDateForInput(asignacionActual.fecha_salida);
        document.getElementById('edit_fecha_llegada').value = formatDateForInput(asignacionActual.fecha_llegada);
        document.getElementById('edit_monto_asignacion').value = asignacionActual.monto_asignacion;
        
        const tbody = document.getElementById('editGastosBody');
        tbody.innerHTML = '';
        editContadorFilas = 0;
        
        if (asignacionActual.gastos && asignacionActual.gastos.length > 0) {
            asignacionActual.gastos.forEach(gasto => agregarFilaEdicion(gasto));
        } else {
            agregarFilaEdicion();
        }
        
        calcularTotalEdicion();
        document.getElementById('modalEditarAsignacion').classList.add('active');
        
    } catch (error) {
        console.error('Error:', error);
        showToast('Error', 'error');
    } finally {
        showLoading(false);
    }
}

function cerrarModalEditar() {
    document.getElementById('modalEditarAsignacion').classList.remove('active');
    asignacionActual = null;
}

function agregarFilaEdicion(gasto = null) {
    editContadorFilas++;
    const tbody = document.getElementById('editGastosBody');
    
    const row = document.createElement('tr');
    row.dataset.gastoId = gasto?.id || '';
    row.innerHTML = `
        <td class="text-center">${editContadorFilas}</td>
        <td>
            <select name="edit_tipo_gasto" onchange="toggleHospedajeEdicion(this)" required>
                <option value="">...</option>
                <option value="PASAJE" ${gasto?.tipo_gasto === 'PASAJE' ? 'selected' : ''}>PASAJE</option>
                <option value="HOSPEDAJE" ${gasto?.tipo_gasto === 'HOSPEDAJE' ? 'selected' : ''}>HOSPEDAJE</option>
                <option value="OTROS SERVICIOS" ${gasto?.tipo_gasto === 'OTROS SERVICIOS' ? 'selected' : ''}>OTROS SERVICIOS</option>
                <option value="COMBUSTIBLE" ${gasto?.tipo_gasto === 'COMBUSTIBLE' ? 'selected' : ''}>COMBUSTIBLE</option>
                <option value="OTROS BIENES" ${gasto?.tipo_gasto === 'OTROS BIENES' ? 'selected' : ''}>OTROS BIENES</option>
            </select>
        </td>
        <td>
            <div class="hospedaje-fields ${gasto?.tipo_gasto === 'HOSPEDAJE' ? 'visible' : ''}">
                <input type="text" name="edit_nombre_proveedor" placeholder="Nombre" value="${gasto?.nombre_proveedor_hospedaje || ''}" style="margin-bottom:3px;font-size:0.8rem;">
                <input type="text" name="edit_ci_proveedor" placeholder="CI" value="${gasto?.ci_proveedor || ''}" style="margin-bottom:3px;font-size:0.8rem;">
                <select name="edit_ext_proveedor" style="margin-bottom:3px;font-size:0.8rem;">
                    <option value="">-- Dpto --</option>
                    <option value="LP" ${(gasto?.extension_proveedor||'')==='LP'?'selected':''}>La Paz (LP)</option>
                    <option value="SC" ${(gasto?.extension_proveedor||'')==='SC'?'selected':''}>Santa Cruz (SC)</option>
                    <option value="CB" ${(gasto?.extension_proveedor||'')==='CB'?'selected':''}>Cochabamba (CB)</option>
                    <option value="OR" ${(gasto?.extension_proveedor||'')==='OR'?'selected':''}>Oruro (OR)</option>
                    <option value="PT" ${(gasto?.extension_proveedor||'')==='PT'?'selected':''}>Potosí (PT)</option>
                    <option value="CH" ${(gasto?.extension_proveedor||'')==='CH'?'selected':''}>Chuquisaca (CH)</option>
                    <option value="TJ" ${(gasto?.extension_proveedor||'')==='TJ'?'selected':''}>Tarija (TJ)</option>
                    <option value="BE" ${(gasto?.extension_proveedor||'')==='BE'?'selected':''}>Beni (BE)</option>
                    <option value="PD" ${(gasto?.extension_proveedor||'')==='PD'?'selected':''}>Pando (PD)</option>
                </select>
                <input type="date" name="edit_fecha_hospedaje" value="${formatDateForInput(gasto?.fecha_hospedaje) || ''}" style="font-size:0.8rem;">
            </div>
        </td>
        <td>
            <select name="edit_tipo_comprobante" required>
                <option value="">...</option>
                <option value="FACTURA" ${gasto?.tipo_comprobante === 'FACTURA' ? 'selected' : ''}>FACTURA</option>
                <option value="RECIBO" ${gasto?.tipo_comprobante === 'RECIBO' ? 'selected' : ''}>RECIBO</option>
                <option value="NINGUNO" ${gasto?.tipo_comprobante === 'NINGUNO' ? 'selected' : ''}>NINGUNO</option>
            </select>
        </td>
        <td><input type="text" name="edit_numero_comprobante" value="${gasto?.numero_comprobante || ''}"></td>
        <td><input type="number" name="edit_monto" step="0.01" min="0.01" value="${gasto?.monto || ''}" oninput="calcularTotalEdicion()" required></td>
        <td><textarea name="edit_observaciones" rows="2" style="font-size:0.8rem;text-transform:uppercase;" oninput="this.value=this.value.toUpperCase()">${escapeHtml(gasto?.observaciones || '')}</textarea></td>
		<td class="text-center"><button type="button" class="btn-eliminar-gasto" onclick="eliminarFilaEdicion(this)">ELIMINAR GASTO</button></td>
    `;
    
    tbody.appendChild(row);
}

function eliminarFilaEdicion(btn) {
    if (document.querySelectorAll('#editGastosBody tr').length <= 1) {
        showToast('Mínimo un gasto', 'warning');
        return;
    }
    btn.closest('tr').remove();
    renumerarFilasEdicion();
    calcularTotalEdicion();
}

function renumerarFilasEdicion() {
    document.querySelectorAll('#editGastosBody tr').forEach((fila, i) => {
        fila.querySelector('td:first-child').textContent = i + 1;
    });
}

function toggleHospedajeEdicion(select) {
    const fields = select.closest('tr').querySelector('.hospedaje-fields');
    const val = select.value;
    if (val === 'HOSPEDAJE' || val === 'COMBUSTIBLE') {
        fields.classList.add('visible');
    } else {
        fields.classList.remove('visible');
        // Clear fields when hidden
        if (fields) fields.querySelectorAll('input, select').forEach(el => { if (el.tagName !== 'SELECT') el.value = ''; });
    }
}

function calcularTotalEdicion() {
    let total = 0;
    document.querySelectorAll('[name="edit_monto"]').forEach(input => {
        total += parseFloat(input.value) || 0;
    });
    document.getElementById('editTotalGastos').textContent = total.toFixed(2);
}

async function guardarCambiosAsignacion() {
    const asignacionId = document.getElementById('edit_asignacion_id').value;
    
    const monto = parseFloat(document.getElementById('edit_monto_asignacion').value);
    if (isNaN(monto) || monto < 0) {
        showToast('Monto debe ser 0 o mayor', 'error');
        return;
    }
    
    const gastos = [];
    const filas = document.querySelectorAll('#editGastosBody tr');
    
    for (const fila of filas) {
        const tipoGasto = fila.querySelector('[name="edit_tipo_gasto"]').value;
        const tipoComprobante = fila.querySelector('[name="edit_tipo_comprobante"]').value;
        const montoGasto = fila.querySelector('[name="edit_monto"]').value;
        
        if (!tipoGasto || !tipoComprobante || !montoGasto) {
            showToast('Complete todos los campos', 'error');
            return;
        }
        
        gastos.push({
            id: fila.dataset.gastoId ? parseInt(fila.dataset.gastoId) : null,
            tipo_gasto: tipoGasto,
            tipo_comprobante: tipoComprobante,
            numero_comprobante: fila.querySelector('[name="edit_numero_comprobante"]').value,
            monto: montoGasto,
            observaciones: fila.querySelector('[name="edit_observaciones"]').value,
            nombre_proveedor_hospedaje: fila.querySelector('[name="edit_nombre_proveedor"]').value,
            ci_proveedor: fila.querySelector('[name="edit_ci_proveedor"]').value,
            extension_proveedor: fila.querySelector('[name="edit_ext_proveedor"]').value,
            fecha_hospedaje: fila.querySelector('[name="edit_fecha_hospedaje"]').value
        });
    }
    
    const data = {
        ciudad_origen: document.getElementById('edit_ciudad_origen').value,
        ciudad_destino: document.getElementById('edit_ciudad_destino').value,
        fecha_salida: document.getElementById('edit_fecha_salida').value,
        fecha_llegada: document.getElementById('edit_fecha_llegada').value,
        monto_asignacion: monto,
        gastos: gastos
    };
    
    try {
        showLoading(true);
        const result = await apiPut(`/api/supervisor/asignacion/${asignacionId}`, data);
        
        if (result?.success) {
            showToast('¡Guardado!', 'success');
            cerrarModalEditar();
            filtrarRegistros();
        } else {
            showToast(result?.error || 'Error', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error', 'error');
    } finally {
        showLoading(false);
    }
}

// =====================================================
// REPORTES
// =====================================================

async function generarReporte() {
    const fechaInicio = document.getElementById('reporte_fecha_inicio').value;
    const fechaFin = document.getElementById('reporte_fecha_fin').value;
    
    if (!fechaInicio || !fechaFin) {
        showToast('Seleccione fechas', 'error');
        return;
    }
    
    try {
        showLoading(true);
        const response = await fetch(`/api/reporte/gastos?fecha_inicio=${fechaInicio}&fecha_fin=${fechaFin}`, {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        
        if (response.ok) {
            const blob = await response.blob();
            downloadBlob(blob, `CUADRO_GASTOS_${fechaInicio}_${fechaFin}.xlsx`);
            showToast('Generado', 'success');
        } else {
            const data = await response.json();
            showToast(data.error || 'Error', 'error');
        }
    } catch (error) {
        showToast('Error', 'error');
    } finally {
        showLoading(false);
    }
}

// MEJORA 7: Ver documento adjunto
async function verDocumentoGasto(gastoId) {
    try {
        const res = await fetch(`/api/documento/${gastoId}`,
            { headers: { 'Authorization': `Bearer ${getToken()}` } });
        if (!res.ok) { showToast('Sin documento adjunto', 'warning'); return; }
        const blob = await res.blob();
        window.open(URL.createObjectURL(blob), '_blank');
    } catch(e) { showToast('Error al cargar documento', 'error'); }
}
 
async function generarFormularios() {
    const usuarioId = document.getElementById('form_usuario').value;
    const fechaInicio = document.getElementById('form_fecha_inicio').value;
    const fechaFin = document.getElementById('form_fecha_fin').value;
    
    let url = '/api/reporte/formularios?';
    if (usuarioId) url += `usuario_id=${usuarioId}&`;
    if (fechaInicio) url += `fecha_inicio=${fechaInicio}&`;
    if (fechaFin) url += `fecha_fin=${fechaFin}&`;
    
    try {
        showLoading(true);
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        
        if (response.ok) {
            const blob = await response.blob();
            downloadBlob(blob, `RETENCION_${new Date().toISOString().split('T')[0]}.xlsx`);
            showToast('Generado', 'success');
        } else {
            const data = await response.json();
            showToast(data.error || 'Error', 'error');
        }
    } catch (error) {
        showToast('Error', 'error');
    } finally {
        showLoading(false);
    }
}