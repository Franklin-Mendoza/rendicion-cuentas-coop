// =====================================================
// GENERADOR DE PDF (Cliente)
// =====================================================

// Este archivo contiene funciones auxiliares para la generación de PDF
// La generación principal se hace en el servidor

async function generarYDescargarPDF(asignacionId) {
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
        
        if (!response.ok) {
            throw new Error('Error al generar PDF');
        }
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `descargo_${asignacionId}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        showToast('PDF descargado correctamente', 'success');
        return true;
    } catch (error) {
        console.error('Error:', error);
        showToast('Error al generar el PDF', 'error');
        return false;
    } finally {
        showLoading(false);
    }
}

// Previsualizar PDF en nueva ventana
async function previsualizarPDF(asignacionId) {
    try {
        const response = await fetch('/api/generar-pdf', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify({ asignacion_id: asignacionId })
        });
        
        if (!response.ok) {
            throw new Error('Error');
        }
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        window.open(url, '_blank');
    } catch (error) {
        showToast('Error al previsualizar', 'error');
    }
}