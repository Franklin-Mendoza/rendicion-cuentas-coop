// =====================================================
// SISTEMA DE RENDICIÓN DE CUENTAS
// LA SAGRADA FAMILIA R.L. - COOPERATIVA DE AHORRO Y CRÉDITO
// VERSIÓN 3.0 - CON TODAS LAS MEJORAS
// =====================================================

require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const bodyParser = require('body-parser');
const multer = require('multer');
const PDFDocument = require('pdfkit');
const { PDFDocument: PDFLib, rgb: pdfRgb } = require('pdf-lib');
const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');
 
// MEJORA 3: Genera identificador único DDMMAAAAHHMISS
function generarIdentificadorUnico() {
    const n = new Date();
    const dd   = String(n.getDate()).padStart(2,'0');
    const mm   = String(n.getMonth()+1).padStart(2,'0');
    const aaaa = n.getFullYear();
    const hh   = String(n.getHours()).padStart(2,'0');
    const min  = String(n.getMinutes()).padStart(2,'0');
    const ss   = String(n.getSeconds()).padStart(2,'0');
    return `${dd}${mm}${aaaa}${hh}${min}${ss}`;
}

const app = express();
const PORT = process.env.PORT || 3000;

// =====================================================
// CONFIGURACIÓN DE MIDDLEWARE
// =====================================================

app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static('public'));

const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Tipo de archivo no permitido'), false);
        }
    }
});

// =====================================================
// CONFIGURACIÓN DE BASE DE DATOS
// =====================================================

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'password123',
    database: process.env.DB_NAME || 'rendicion_cuentas',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

let pool;

async function initializeDatabase() {
    try {
        pool = mysql.createPool(dbConfig);
        const connection = await pool.getConnection();
        console.log('✅ Conexión a base de datos establecida');

        // ── Migraciones automáticas ──────────────────────────────────────
        // Actualizar ENUM tipo_gasto para incluir COMBUSTIBLE y OTROS BIENES
        try {
            // Primero normalizar valores viejos 'OTROS' → 'OTROS SERVICIOS'
            await connection.execute(`
                UPDATE gastos SET tipo_gasto = 'OTROS SERVICIOS' WHERE tipo_gasto = 'OTROS'
            `);
            // Luego ampliar el ENUM
            await connection.execute(`
                ALTER TABLE gastos MODIFY COLUMN tipo_gasto 
                ENUM('PASAJE', 'HOSPEDAJE', 'OTROS SERVICIOS', 'COMBUSTIBLE', 'OTROS BIENES') NOT NULL
            `);
            console.log('✅ Migración: ENUM tipo_gasto actualizado (COMBUSTIBLE, OTROS BIENES)');
        } catch (e) {
            // Ya está actualizado — ignorar
        }

        // Renombrar fecha_hospedaje → fecha_emision_comprobante si aún no se hizo
        try {
            await connection.execute(`
                ALTER TABLE gastos CHANGE COLUMN fecha_hospedaje fecha_emision_comprobante DATE
            `);
            console.log('✅ Migración: fecha_hospedaje → fecha_emision_comprobante');
        } catch (e) {
            // Ya fue renombrada o no existe fecha_hospedaje — ignorar
        }

        // Agregar tipo_archivo si no existe
        try {
            await connection.execute(`
                ALTER TABLE gastos ADD COLUMN tipo_archivo VARCHAR(50)
            `);
            console.log('✅ Migración: columna tipo_archivo agregada a gastos');
        } catch (e) {
            // Ya existe — ignorar
        }

        // Agregar identificador_unico en asignaciones si no existe
        try {
            await connection.execute(`
                ALTER TABLE asignaciones ADD COLUMN identificador_unico VARCHAR(20)
            `);
            console.log('✅ Migración: columna identificador_unico agregada a asignaciones');
        } catch (e) {
            // Ya existe — ignorar
        }

        // Agregar es_revision en asignaciones si no existe
        try {
            await connection.execute(`
                ALTER TABLE asignaciones ADD COLUMN es_revision BOOLEAN DEFAULT FALSE
            `);
            console.log('✅ Migración: columna es_revision agregada a asignaciones');
        } catch (e) {
            // Ya existe — ignorar
        }

        // Agregar foto en usuarios si no existe
        try {
            await connection.execute(`
                ALTER TABLE usuarios ADD COLUMN foto LONGBLOB
            `);
            console.log('✅ Migración: columna foto agregada a usuarios');
        } catch (e) {
            // Ya existe — ignorar
        }
        // ── Fin migraciones ──────────────────────────────────────────────

        connection.release();
    } catch (error) {
        console.error('❌ Error de conexión a BD:', error.message);
        process.exit(1);
    }
}

// =====================================================
// MIDDLEWARE DE AUTENTICACIÓN
// =====================================================

const JWT_SECRET = process.env.JWT_SECRET || 'clave_secreta_sagrada_familia_2024';

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Token requerido' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Token inválido' });
        }
        req.user = user;
        next();
    });
}

function authorizeRoles(...roles) {
    return (req, res, next) => {
        if (!roles.includes(req.user.rol)) {
            return res.status(403).json({ error: 'Sin permisos' });
        }
        next();
    };
}

// =====================================================
// RUTAS DE AUTENTICACIÓN
// =====================================================

app.post('/api/login', async (req, res) => {
    try {
        const { usuario, contrasena } = req.body;

        if (!usuario || !contrasena) {
            return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
        }

        const [rows] = await pool.execute(
            'SELECT * FROM usuarios WHERE usuario = ? AND habilitado = TRUE',
            [usuario]
        );

        if (rows.length === 0) {
            console.log(`✗ Login fallido: usuario no encontrado`);
            return res.status(401).json({ error: 'Usuario o contraseña inválidos' });
        }

        const user = rows[0];
        const validPassword = await bcrypt.compare(contrasena, user.contrasena);

        if (!validPassword) {
            console.log(`✗ Login fallido: ${usuario}`);
            return res.status(401).json({ error: 'Usuario o contraseña inválidos' });
        }

        const token = jwt.sign(
            {
                id: user.id,
                usuario: user.usuario,
                nombres: user.nombres,
                apellido_paterno: user.apellido_paterno,
                apellido_materno: user.apellido_materno,
                rol: user.rol,
                cargo: user.cargo,
                ci: user.ci,
                extension: user.extension,
                email_corporativo: user.email_corporativo
            },
            JWT_SECRET,
            { expiresIn: '8h' }
        );

        console.log(`✓ Login exitoso: ${usuario}`);

        res.json({
            success: true,
            token,
            usuario: {
                id: user.id,
                nombres: user.nombres,
                apellido_paterno: user.apellido_paterno,
                apellido_materno: user.apellido_materno,
                nombre_completo: `${user.nombres} ${user.apellido_paterno} ${user.apellido_materno}`,
                rol: user.rol,
                cargo: user.cargo,
                email_corporativo: user.email_corporativo
            }
        });

    } catch (error) {
        console.error('Error en login:', error.message);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.post('/api/logout', (req, res) => {
    res.json({ success: true, message: 'Sesión cerrada' });
});

app.get('/api/usuario/perfil', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.execute(
            'SELECT id, nombres, apellido_paterno, apellido_materno, cargo, ci, extension, email_corporativo, usuario, rol FROM usuarios WHERE id = ?',
            [req.user.id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        res.json(rows[0]);
    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ error: 'Error interno' });
    }
});

// =====================================================
// RUTAS DE USUARIO
// =====================================================

app.get('/api/usuario/habilitacion', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `SELECT h.*, CONCAT(s.nombres, ' ', s.apellido_paterno) as supervisor_nombre
             FROM habilitaciones h
             INNER JOIN usuarios s ON h.supervisor_id = s.id
             WHERE h.usuario_id = ? AND h.habilitado = TRUE 
             AND CURDATE() BETWEEN h.fecha_inicio AND h.fecha_fin`,
            [req.user.id]
        );

        res.json({
            habilitado: rows.length > 0,
            habilitacion: rows.length > 0 ? rows[0] : null
        });
    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ error: 'Error interno' });
    }
});

// MEJORA 2: Obtener registros del usuario actual
app.get('/api/usuario/mis-registros', authenticateToken, async (req, res) => {
    try {
        const [registros] = await pool.execute(
            `SELECT a.*, 
                    CONCAT(u.nombres, ' ', u.apellido_paterno, ' ', u.apellido_materno) as nombre_usuario
             FROM asignaciones a
             INNER JOIN usuarios u ON a.usuario_id = u.id
             WHERE a.usuario_id = ?
             ORDER BY a.fecha_creacion DESC`,
            [req.user.id]
        );

        res.json(registros);
    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ error: 'Error interno' });
    }
});

// POST /api/asignacion - CON VALIDACIÓN DE MONTO >= 0
app.post('/api/asignacion', authenticateToken, (req, res, next) => {
    upload.any()(req, res, (err) => {
        if (err) {
            return res.status(400).json({ error: 'Error al procesar archivos: ' + err.message });
        }
        next();
    });
}, async (req, res) => {
    const connection = await pool.getConnection();
    
    try {
        await connection.beginTransaction();

        const { ciudad_origen, ciudad_destino, fecha_salida, fecha_llegada, monto_asignacion, gastos } = req.body;

        // Validar monto >= 0
        const montoNum = parseFloat(monto_asignacion);
        if (isNaN(montoNum) || montoNum < 0) {
            await connection.rollback();
            return res.status(400).json({ error: 'El monto de asignación debe ser 0 o mayor' });
        }

        if (!ciudad_origen || !ciudad_destino || !fecha_salida || !fecha_llegada) {
            await connection.rollback();
            return res.status(400).json({ error: 'Todos los campos son requeridos' });
        }

        let gastosArray = typeof gastos === 'string' ? JSON.parse(gastos) : gastos;

        if (!gastosArray || gastosArray.length === 0) {
            await connection.rollback();
            return res.status(400).json({ error: 'Debe registrar al menos un gasto' });
        }

        const idUnico = generarIdentificadorUnico();
        const [asignacionResult] = await connection.execute(
            `INSERT INTO asignaciones (usuario_id, ciudad_origen, ciudad_destino, fecha_salida, fecha_llegada, monto_asignacion, estado, identificador_unico)
             VALUES (?, ?, ?, ?, ?, ?, 'completada', ?)`,
            [req.user.id, ciudad_origen.toUpperCase(), ciudad_destino.toUpperCase(), fecha_salida, fecha_llegada, montoNum, idUnico]
        );

        const asignacionId = asignacionResult.insertId;

        for (let i = 0; i < gastosArray.length; i++) {
            const gasto = gastosArray[i];
            
            let documentoArchivo = null;
            let nombreArchivo = null;
            
            if (req.files) {
                const archivo = req.files.find(f => f.fieldname === `documento_${i}`);
                if (archivo) {
                    documentoArchivo = archivo.buffer;
                    nombreArchivo = archivo.originalname;
                }
            }

            const montoGasto = parseFloat(gasto.monto);
            if (isNaN(montoGasto)) {
                throw new Error(`Monto inválido en el gasto #${i + 1}`);
            }

            await connection.execute(
                `INSERT INTO gastos (asignacion_id, tipo_gasto, tipo_comprobante, numero_comprobante,
                    monto, documento_archivo, nombre_archivo, tipo_archivo, observaciones,
                    nombre_proveedor_hospedaje, ci_proveedor, extension_proveedor, fecha_emision_comprobante)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    asignacionId, gasto.tipo_gasto, gasto.tipo_comprobante,
                    gasto.numero_comprobante || null, parseFloat(gasto.monto),
                    documentoArchivo, nombreArchivo,
                    (req.files && req.files.find(f=>f.fieldname===`documento_${i}`))?.mimetype || null,
                    gasto.observaciones || null,
                    gasto.nombre_proveedor_hospedaje || null, gasto.ci_proveedor || null,
                    gasto.extension_proveedor || null, gasto.fecha_emision_comprobante || null
                ]
            );

        }

        await connection.execute(
            `UPDATE habilitaciones SET habilitado = FALSE 
             WHERE usuario_id = ? AND habilitado = TRUE 
             AND CURDATE() BETWEEN fecha_inicio AND fecha_fin`,
            [req.user.id]
        );

        await connection.commit();

        res.json({ success: true, asignacion_id: asignacionId, message: 'Asignación registrada' });

    } catch (error) {
        if (connection) await connection.rollback();
        
        console.error('❌ Error al registrar asignación:', error);
        
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ 
                error: 'Ya existe una asignación registrada para este usuario en las mismas fechas.' 
            });
        }
        
        res.status(500).json({ error: 'Error al registrar: ' + error.message });
    } finally {
        if (connection) connection.release();
    }
});

// =====================================================
// GENERAR PDF - MEJORA 3: REDISEÑO CON LOGO Y COLORES
// =====================================================

app.post('/api/generar-pdf', authenticateToken, async (req, res) => {
    try {
        const { asignacion_id } = req.body;

        const [asignaciones] = await pool.execute(
            `SELECT a.*, u.nombres, u.apellido_paterno, u.apellido_materno, u.cargo, u.ci, u.extension
             FROM asignaciones a
             INNER JOIN usuarios u ON a.usuario_id = u.id
             WHERE a.id = ?`,
            [asignacion_id]
        );

        if (asignaciones.length === 0) {
            return res.status(404).json({ error: 'Asignación no encontrada' });
        }

        const asignacion = asignaciones[0];

        const [gastos] = await pool.execute(
            'SELECT * FROM gastos WHERE asignacion_id = ? ORDER BY id',
            [asignacion_id]
        );

		const doc = new PDFDocument({ size: 'Letter', margins: { top: 50, bottom: 50, left: 50, right: 50 } });

        // Capturar el PDF en un buffer para poder fusionar con adjuntos
        const pdfChunks = [];
        doc.on('data', chunk => pdfChunks.push(chunk));

		// Logo (si existe)
		// Logo
		const logoPath = path.join(__dirname, 'Imagen', 'escudo.jpg');
		if (fs.existsSync(logoPath)) {
			doc.image(logoPath, 50, 15, { width: 60 });
		}
		
		
		
		
		
		
		
		
		
		
		
		
		

		// Encabezado institucional
		doc.fontSize(10).font('Helvetica-Bold').fillColor('#058538');
		doc.text('"LA SAGRADA FAMILIA" R.L.', 120, 35, { width: 400 });
		doc.fontSize(8).font('Helvetica').fillColor('#666666');
		doc.text('COOPERATIVA DE AHORRO Y CRÉDITO ABIERTA', 120, 48, { width: 400 });

		doc.moveDown(0.5);
		doc.y = 85;

		// Título principal - ANCHO COMPLETO
		doc.fontSize(11).font('Helvetica-Bold').fillColor('#058538');
		doc.text('FORMULARIO DE DESCARGO POR GASTOS DE PASAJES Y OTROS GASTOS', 50, doc.y, { width: 495, align: 'center' });

		doc.moveDown(0.5);
		doc.fillColor('#333333');
		
		
		
		
		

		// Línea divisoria después del título
		const yLinea = doc.y; // Guardar la posición Y actual
		doc.moveTo(50, yLinea).lineTo(545, yLinea)
		   .strokeColor('#058538').lineWidth(1).stroke();

		doc.moveDown(0.5); // Espacio después de la línea

        // Datos del usuario
        doc.fontSize(10).font('Helvetica');
        const nombreCompleto = `${asignacion.nombres} ${asignacion.apellido_paterno} ${asignacion.apellido_materno}`;
        /*
        doc.font('Helvetica-Bold').text('NOMBRE: ', { continued: true });
        doc.font('Helvetica').text(nombreCompleto);
        
        doc.font('Helvetica-Bold').text('CARGO: ', { continued: true });
        doc.font('Helvetica').text(`${asignacion.cargo}    `, { continued: true });
        doc.font('Helvetica-Bold').text('CI: ', { continued: true });
        doc.font('Helvetica').text(`${asignacion.ci}    `, { continued: true });
        doc.font('Helvetica-Bold').text('EXT: ', { continued: true });
        doc.font('Helvetica').text(asignacion.extension || 'N/A');
		*/
		
		// Primera línea: NOMBRE, CI y EXT
		// Guardar posición inicial
		let yInicial = doc.y;

		// Columna izquierda
		doc.font('Helvetica-Bold').text('NOMBRE: ', 50, yInicial, { continued: true });
		doc.font('Helvetica').text(nombreCompleto);

		doc.font('Helvetica-Bold').text('CARGO: ', 50, doc.y + 3, { continued: true });
		doc.font('Helvetica').text(asignacion.cargo);

		doc.font('Helvetica-Bold').text('CIUDAD ORIGEN: ', 50, doc.y + 3, { continued: true });
		doc.font('Helvetica').text(asignacion.ciudad_origen);

		doc.font('Helvetica-Bold').text('FECHA DE SALIDA: ', 50, doc.y + 3, { continued: true });
		const fechaSalida = new Date(asignacion.fecha_salida);
		doc.font('Helvetica').text(fechaSalida.toLocaleDateString('es-BO'));

		doc.font('Helvetica-Bold').text('DÍAS DE PERMANENCIA: ', 50, doc.y + 3, { continued: true });
		const fechaLlegada = new Date(asignacion.fecha_llegada);
		const diasPermanencia = Math.ceil((fechaLlegada - fechaSalida) / (1000 * 60 * 60 * 24));
		doc.font('Helvetica').text(`${diasPermanencia}`);

		// Columna derecha (a partir de la misma yInicial)
		doc.font('Helvetica-Bold').text('CI: ', 368, yInicial, { continued: true });
		doc.font('Helvetica').text(asignacion.ci);

		doc.font('Helvetica-Bold').text('EXT: ', 368, doc.y + 3, { continued: true });
		doc.font('Helvetica').text(asignacion.extension || 'N/A');

		doc.font('Helvetica-Bold').text('CIUDAD DESTINO: ', 368, doc.y + 3, { continued: true });
		doc.font('Helvetica').text(asignacion.ciudad_destino);

		doc.font('Helvetica-Bold').text('FECHA DE LLEGADA: ', 368, doc.y + 3, { continued: true });
		doc.font('Helvetica').text(fechaLlegada.toLocaleDateString('es-BO'));

		doc.font('Helvetica-Bold').text('MONTO ASIGNACIÓN: ', 368, doc.y + 3, { continued: true });
		doc.font('Helvetica').text(`${parseFloat(asignacion.monto_asignacion).toFixed(2)} Bs.`);
				
		
		
		
		////////

        doc.moveDown(1.5);

        // ─── TABLA DE GASTOS ───────────────────────────────────────
        const tableTop = doc.y;
        // Nº | DETALLE | TIPO COMPROBANTE (Nº) | MONTO GASTADO | OBSERVACIONES
        const colWidths = [25, 130, 145, 70, 125];
        const headers   = ['Nº', 'DETALLE', 'COMPROBANTE', 'MONTO\nGASTADO', 'OBSERVACIONES'];

        // Fila encabezado
        doc.rect(50, tableTop - 5, 495, 22).fill('#058538');
        doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#FFFFFF');

        let xPos = 52;
        headers.forEach((header, i) => {
            const lines = header.split('\n');
            if (lines.length > 1) {
                doc.text(lines[0], xPos, tableTop - 2, { width: colWidths[i] - 4, align: 'center' });
                doc.text(lines[1], xPos, tableTop + 6, { width: colWidths[i] - 4, align: 'center' });
            } else {
                doc.text(header, xPos, tableTop + 2, { width: colWidths[i] - 4, align: 'center' });
            }
            xPos += colWidths[i];
        });

        doc.fillColor('#333333');
        doc.y = tableTop + 20;
        doc.font('Helvetica').fontSize(8);

        let totalFactura = 0;
        let totalRecibo  = 0;
        let totalNinguno = 0;
        let totalReciboBien  = 0;  // COMBUSTIBLE/OTROS BIENES con RECIBO (8%)
        let totalNingunoBien = 0;  // COMBUSTIBLE/OTROS BIENES sin comprobante (8%)
        let totalGeneral = 0;

        gastos.forEach((gasto, index) => {
            const y = doc.y;
            xPos = 52;

            const rowH = 18;
            // Offset vertical para centrar texto de 8pt (~10px) dentro de rowH
            const textY = y + (rowH - 10) / 2 - 1;

            // Fondo alternado
            if (index % 2 === 0) {
                doc.rect(50, y, 495, rowH).fill('#f5f5f5');
            } else {
                doc.rect(50, y, 495, rowH).fill('#FFFFFF');
            }
            doc.fillColor('#333333');

            // Nº
            doc.font('Helvetica-Bold').fontSize(8);
            doc.text((index + 1).toString(), xPos, textY, { width: colWidths[0] - 2, align: 'center', lineBreak: false });
            xPos += colWidths[0];

            // DETALLE (tipo gasto + proveedor si hospedaje)
            doc.font('Helvetica').fontSize(8);
            let detalle = gasto.tipo_gasto;
            if (gasto.tipo_gasto === 'HOSPEDAJE' && gasto.nombre_proveedor_hospedaje) {
                detalle += ` - ${gasto.nombre_proveedor_hospedaje.substring(0, 20)}`;
            }
            doc.text(detalle.substring(0, 28), xPos, textY, { width: colWidths[1] - 4, align: 'left', lineBreak: false });
            xPos += colWidths[1];

            // COMPROBANTE: "FACTURA - 123456" / "RECIBO - 9898" / "NINGUNO"
            let comprobanteTexto = '';
            if (gasto.tipo_comprobante === 'FACTURA') {
                comprobanteTexto = `FACTURA${gasto.numero_comprobante ? ' - ' + gasto.numero_comprobante : ''}`;
                doc.fillColor('#058538').font('Helvetica-Bold');
            } else if (gasto.tipo_comprobante === 'RECIBO') {
                comprobanteTexto = `RECIBO${gasto.numero_comprobante ? ' - ' + gasto.numero_comprobante : ''}`;
                doc.fillColor('#FD9B00').font('Helvetica-Bold');
            } else {
                comprobanteTexto = 'NINGUNO';
                doc.fillColor('#dc3545').font('Helvetica-Bold');
            }
            doc.text(comprobanteTexto, xPos, textY, { width: colWidths[2] - 4, align: 'center', lineBreak: false });
            doc.fillColor('#333333').font('Helvetica');
            xPos += colWidths[2];

            // MONTO GASTADO
			doc.font('Helvetica-Bold').fontSize(8);
			doc.text(`${parseFloat(gasto.monto).toFixed(2)} Bs.`, xPos, textY, { 
				width: colWidths[3] - 4, 
				align: 'center'
			});
			doc.font('Helvetica');
			xPos += colWidths[3];

            // OBSERVACIONES (NINGUNA si vacío)
            const obsVal = (gasto.observaciones && gasto.observaciones.trim() !== '')
                ? gasto.observaciones.substring(0, 35)
                : 'NINGUNA';
            doc.fontSize(7.5).text(obsVal, xPos, textY, { width: colWidths[4] - 4, align: 'left', lineBreak: false });
            doc.fontSize(8);

            // Acumular totales
            const monto = parseFloat(gasto.monto);
            totalGeneral += monto;
            const esBien = (gasto.tipo_gasto === 'COMBUSTIBLE' || gasto.tipo_gasto === 'OTROS BIENES');
            if (gasto.tipo_comprobante === 'FACTURA')      totalFactura += monto;
            else if (gasto.tipo_comprobante === 'RECIBO')  { if (esBien) totalReciboBien += monto; else totalRecibo  += monto; }
            else if (gasto.tipo_comprobante === 'NINGUNO') { if (esBien) totalNingunoBien += monto; else totalNinguno += monto; }

            // Línea divisoria de fila
            doc.moveTo(50, y + rowH).lineTo(545, y + rowH)
               .strokeColor('#e0e0e0').lineWidth(0.5).stroke();
            doc.strokeColor('#000000').lineWidth(1);
            doc.y = y + rowH;
        });

        // Línea separadora gruesa
        doc.moveTo(50, doc.y + 2).lineTo(545, doc.y + 2)
           .strokeColor('#058538').lineWidth(2).stroke();
        doc.lineWidth(1).strokeColor('#000000');
        doc.moveDown(1);

        // ─── RESUMEN DE TOTALES ────────────────────────────────────
        const resumenX = 282; // columna derecha
        doc.fontSize(9).font('Helvetica-Bold');
		
		doc.moveDown(0.5);

        if (totalFactura > 0) {
            doc.fillColor('#058538')
               .text(`✓ Total FACTURAS:`, resumenX, doc.y, { continued: true })
               .font('Helvetica')
               .text(`  ${totalFactura.toFixed(2)} Bs.`);
            doc.font('Helvetica').fontSize(7.5).fillColor('#666666');
            doc.text(`   (Sin retención — importe íntegro)`, resumenX, doc.y);
            doc.moveDown(0.4);
        }
		
		doc.moveDown(0.5);

        if (totalRecibo > 0) {
            doc.font('Helvetica-Bold').fontSize(9).fillColor('#FD9B00')
               .text(`✓ Total RECIBOS (Servicios):   `, resumenX, doc.y, { continued: true })
               .font('Helvetica')
               .text(`  ${totalRecibo.toFixed(2)} Bs.`);
            doc.font('Helvetica').fontSize(7.5).fillColor('#666666');
            const ret16r = totalRecibo * 0.16;
            const net84r = totalRecibo * 0.84;
			doc.moveDown(0.2);
            doc.text(`   Retención 16% \n   (RC-IVA 13% + IT 3%):   ${ret16r.toFixed(2)} Bs.`, resumenX, doc.y);
			doc.moveDown(0.3);
            doc.text(`   Importe a pagar (84%):   ${net84r.toFixed(2)} Bs.`, resumenX, doc.y);
            doc.moveDown(0.4);
        }
		
		doc.moveDown(0.5);

        if (totalReciboBien > 0) {
            doc.font('Helvetica-Bold').fontSize(9).fillColor('#FD9B00')
               .text(`✓ Total RECIBOS (Bienes):   `, resumenX, doc.y, { continued: true })
               .font('Helvetica')
               .text(`  ${totalReciboBien.toFixed(2)} Bs.`);
            doc.font('Helvetica').fontSize(7.5).fillColor('#666666');
            const ret8rb = totalReciboBien * 0.08;
            const net92rb = totalReciboBien * 0.92;
			doc.moveDown(0.2);
            doc.text(`   Retención 8% \n   (IUE 5% + IT 3%):   ${ret8rb.toFixed(2)} Bs.`, resumenX, doc.y);
			doc.moveDown(0.3);
            doc.text(`   Importe a pagar (92%):   ${net92rb.toFixed(2)} Bs.`, resumenX, doc.y);
            doc.moveDown(0.4);
        }
		
		doc.moveDown(0.5);

        if (totalNinguno > 0) {
            doc.font('Helvetica-Bold').fontSize(9).fillColor('#dc3545')
               .text(`✓ Total SIN COMPROBANTE (Servicios):`, resumenX, doc.y, { continued: true })
               .font('Helvetica')
               .text(`  ${totalNinguno.toFixed(2)} Bs.`);
            doc.font('Helvetica').fontSize(7.5).fillColor('#666666');
            const ret16n = totalNinguno * 0.16;
            const net84n = totalNinguno * 0.84;
			doc.moveDown(0.2);
            doc.text(`   Retención 16% \n   (RC-IVA 13% + IT 3%):    ${ret16n.toFixed(2)} Bs.`, resumenX, doc.y);
			doc.moveDown(0.3);
            doc.text(`   Importe a pagar (84%):   ${net84n.toFixed(2)} Bs.`, resumenX, doc.y);
            doc.moveDown(0.4);
        }
		
		doc.moveDown(0.5);

        if (totalNingunoBien > 0) {
            doc.font('Helvetica-Bold').fontSize(9).fillColor('#dc3545')
               .text(`✓ Total SIN COMPROBANTE (Bienes):`, resumenX, doc.y, { continued: true })
               .font('Helvetica')
               .text(`  ${totalNingunoBien.toFixed(2)} Bs.`);
            doc.font('Helvetica').fontSize(7.5).fillColor('#666666');
            const ret8nb = totalNingunoBien * 0.08;
            const net92nb = totalNingunoBien * 0.92;
			doc.moveDown(0.2);
            doc.text(`   Retención 8% \n   (IUE 5% + IT 3%):    ${ret8nb.toFixed(2)} Bs.`, resumenX, doc.y);
			doc.moveDown(0.3);
            doc.text(`   Importe a pagar (92%):   ${net92nb.toFixed(2)} Bs.`, resumenX, doc.y);
            doc.moveDown(0.4);
        }

        // Total general con fondo
		// Línea arriba
		const yLineaTotal = doc.y;
		doc.moveTo(50, yLineaTotal).lineTo(545, yLineaTotal)
		   .strokeColor('#e0e0e0').lineWidth(0.5).stroke();

		// Texto TOTAL GASTOS debajo de la línea
		doc.fontSize(9).font('Helvetica-Bold').fillColor('#000000');
		doc.text(`TOTAL GASTOS: ${totalGeneral.toFixed(2)} Bs.`, 545 - 150, yLineaTotal + 5, { align: 'right' });

		doc.strokeColor('#000000').lineWidth(1);
		doc.y = yLineaTotal + 12;












		// =====================================================
		// RESUMEN FINANCIERO - VERSIÓN MEJORADA
		// =====================================================
		doc.moveDown(1);

		const montoAsignacion = parseFloat(asignacion.monto_asignacion);
		const totalGastos = totalGeneral;
		const diferencia = montoAsignacion - totalGastos;

		// Configuración de posición
		const resumenXPos = 282; // Columna derecha
		const margenIzquierdo = 50;

		// MONTO DE ASIGNACIÓN (alineado a la derecha)
		doc.text(`MONTO DE ASIGNACIÓN: ${montoAsignacion.toFixed(2)} Bs.`, resumenXPos, doc.y, { align: 'right' });
		doc.moveDown(0.3);

		// Línea separadora
		doc.moveTo(margenIzquierdo, doc.y).lineTo(545, doc.y)
		   .strokeColor('#e0e0e0').lineWidth(0.5).stroke();
		doc.moveDown(0.5);

		// TÍTULO LIQUIDAR (en la misma fila)
		const liquidarX = 480;
		const liquidarY = doc.y;

		doc.fontSize(9).font('Helvetica-Bold').fillColor('#333333');
		doc.text('LIQUIDAR: ', 465, liquidarY, { continued: true });
		doc.text(`${Math.abs(diferencia).toFixed(2)} Bs.`, liquidarX, liquidarY);

		doc.y = liquidarY + 10;

		// Mensaje según el caso
		doc.fontSize(9).font('Helvetica');
		if (diferencia === 0) {
			doc.fillColor('#058538');
			doc.text('Los fondos concilian correctamente', margenIzquierdo, doc.y);
		} else if (diferencia > 0) {
			doc.fillColor('#058538');
			doc.text('✓ Reintegrar el sobrante a la entidad financiera', margenIzquierdo, doc.y);
			doc.fillColor('#666666');
			doc.fontSize(8);
			doc.text(`(El monto asignado excede los gastos realizados por ${diferencia.toFixed(2)} Bs.)`, margenIzquierdo, doc.y + 12);
		} else {
			doc.fillColor('#dc3545');
			doc.text('⚠ Gastos que superan el presupuesto asignado', margenIzquierdo, doc.y);
			doc.fillColor('#666666');
			doc.fontSize(8);
			doc.text(`(El gasto excede la asignación en ${Math.abs(diferencia).toFixed(2)} Bs., debe justificar el excedente)`, margenIzquierdo, doc.y + 12);
		}

		doc.fillColor('#333333');
		doc.fontSize(10);
		doc.moveDown(2);
		
		
		
		
		

        // =====================================================
        // SECCIÓN DE FIRMAS - MEJORA 3
        // =====================================================
		// =====================================================
		// SECCIÓN DE FIRMAS - POSICIÓN FIJA
		// =====================================================

		// Posiciones fijas desde el final
		const pageHeight = 810; // Alto A4
		const yFirmas = pageHeight - 120; // 150 puntos desde el final
		const yUsuario = pageHeight - 86;
		const yIdUnico = pageHeight - 78;

		// Firmas
		doc.fontSize(8);
		doc.text('_________________________', 50, yFirmas, { width: 150, align: 'center' });
		doc.text('FIRMA DEL DECLARANTE', 50, yFirmas + 12, { width: 150, align: 'center' });
		doc.text('_________________________', 220, yFirmas, { width: 150, align: 'center' });
		doc.text('FIRMA DE CONTABILIDAD', 220, yFirmas + 12, { width: 150, align: 'center' });
		doc.text('_________________________', 390, yFirmas, { width: 150, align: 'center' });
		doc.text('FIRMA DEL INMEDIATO', 390, yFirmas + 12, { width: 150, align: 'center' });
		doc.text('SUPERIOR', 390, yFirmas + 22, { width: 150, align: 'center' });

		// Usuario y fecha
		doc.fontSize(7).font('Helvetica');
		doc.text(`Usuario: ${nombreCompleto}`, 50, yUsuario);
		doc.text(`Fecha: ${new Date().toLocaleDateString('es-BO')}`, 470, yUsuario);

		// ID Único
		doc.fontSize(7).fillColor('#999999');
		doc.text(`ID Único: ${asignacion.identificador_unico || 'N/A'}`, 50, yIdUnico);
		doc.fillColor('#333333').fontSize(8);

		await pool.execute('UPDATE asignaciones SET pdf_generado = TRUE WHERE id = ?', [asignacion_id]);

		// Esperar a que el PDF del formulario termine de generarse en buffer
		const formularioPdfBuffer = await new Promise((resolve, reject) => {
			doc.on('end', () => resolve(Buffer.concat(pdfChunks)));
			doc.on('error', reject);
			doc.end();
		});

		// =====================================================
		// FUSIONAR FORMULARIO + ADJUNTOS DE LOS GASTOS
		// =====================================================
		// Obtener solo los gastos que tienen adjunto
		const gastosConAdjunto = gastos.filter(g => g.documento_archivo && g.documento_archivo.length > 0);

		if (gastosConAdjunto.length === 0) {
			// Sin adjuntos: enviar directamente el formulario
			res.setHeader('Content-Type', 'application/pdf');
			res.setHeader('Content-Disposition', `attachment; filename=descargo_${asignacion_id}.pdf`);
			res.send(formularioPdfBuffer);
			return;
		}

		// Con adjuntos: usar pdf-lib para combinar todo
		const pdfFinal = await PDFLib.create();

		// 1) Copiar páginas del formulario principal
		const formularioDoc = await PDFLib.load(formularioPdfBuffer);
		const formularioPaginas = await pdfFinal.copyPages(formularioDoc, formularioDoc.getPageIndices());
		formularioPaginas.forEach(p => pdfFinal.addPage(p));

		// 2) Agregar cada adjunto como página(s) adicional(es)
		for (let i = 0; i < gastosConAdjunto.length; i++) {
			const gasto = gastosConAdjunto[i];
			const tipoArchivo = (gasto.tipo_archivo || '').toLowerCase();
			const adjuntoBuffer = Buffer.isBuffer(gasto.documento_archivo)
				? gasto.documento_archivo
				: Buffer.from(gasto.documento_archivo);

			try {
				if (tipoArchivo === 'application/pdf') {
					// PDF: copiar sus páginas directamente
					const adjuntoDoc = await PDFLib.load(adjuntoBuffer);
					const adjuntoPaginas = await pdfFinal.copyPages(adjuntoDoc, adjuntoDoc.getPageIndices());
					adjuntoPaginas.forEach(p => pdfFinal.addPage(p));
				} else if (tipoArchivo === 'image/jpeg' || tipoArchivo === 'image/jpg') {
					// Imagen JPEG: incrustar en página nueva tamaño Letter
					const imgEmbedJpg = await pdfFinal.embedJpg(adjuntoBuffer);
					const { width: imgWj, height: imgHj } = imgEmbedJpg.scale(1);
					const pageWj = 612, pageHj = 792; // Letter en puntos
					const margenJ = 40;
					const maxWj = pageWj - margenJ * 2;
					const maxHj = pageHj - margenJ * 2 - 30;
					const escalaJ = Math.min(maxWj / imgWj, maxHj / imgHj, 1);
					const drawWj = imgWj * escalaJ;
					const drawHj = imgHj * escalaJ;
					const xImgJ = (pageWj - drawWj) / 2;
					const yImgJ = margenJ + 20 + (maxHj - drawHj) / 2;
					const paginaJ = pdfFinal.addPage([pageWj, pageHj]);
					paginaJ.drawImage(imgEmbedJpg, { x: xImgJ, y: yImgJ, width: drawWj, height: drawHj });
					paginaJ.drawText(`Adjunto ${i + 1}: ${gasto.nombre_archivo || 'imagen.jpg'}`, {
						x: margenJ, y: margenJ,
						size: 8,
						color: pdfRgb(0.4, 0.4, 0.4)
					});
				} else if (tipoArchivo === 'image/png') {
					// Imagen PNG
					const imgEmbedPng = await pdfFinal.embedPng(adjuntoBuffer);
					const { width: imgWp, height: imgHp } = imgEmbedPng.scale(1);
					const pageWp = 612, pageHp = 792;
					const margenP = 40;
					const maxWp = pageWp - margenP * 2;
					const maxHp = pageHp - margenP * 2 - 30;
					const escalaP = Math.min(maxWp / imgWp, maxHp / imgHp, 1);
					const drawWp = imgWp * escalaP;
					const drawHp = imgHp * escalaP;
					const xImgP = (pageWp - drawWp) / 2;
					const yImgP = margenP + 20 + (maxHp - drawHp) / 2;
					const paginaP = pdfFinal.addPage([pageWp, pageHp]);
					paginaP.drawImage(imgEmbedPng, { x: xImgP, y: yImgP, width: drawWp, height: drawHp });
					paginaP.drawText(`Adjunto ${i + 1}: ${gasto.nombre_archivo || 'imagen.png'}`, {
						x: margenP, y: margenP,
						size: 8,
						color: pdfRgb(0.4, 0.4, 0.4)
					});
				}
				// GIF u otros tipos no soportados: ignorar silenciosamente
			} catch (adjErr) {
				console.error(`Error al procesar adjunto gasto ${gasto.id}:`, adjErr.message);
				// Continuar con los demás adjuntos aunque uno falle
			}
		}

		// Serializar y enviar el PDF final combinado
		const pdfFinalBytes = await pdfFinal.save();
		res.setHeader('Content-Type', 'application/pdf');
		res.setHeader('Content-Disposition', `attachment; filename=descargo_${asignacion_id}.pdf`);
		res.send(Buffer.from(pdfFinalBytes));

    } catch (error) {
        console.error('Error PDF:', error.message);
        res.status(500).json({ error: 'Error al generar PDF' });
    }
});

// =====================================================
// RUTAS DE SUPERVISOR
// =====================================================

app.get('/api/supervisor/usuarios', authenticateToken, authorizeRoles('supervisor', 'admin'), async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `SELECT id, nombres, apellido_paterno, apellido_materno, cargo, ci, extension, 
                    email_corporativo, usuario, rol, habilitado, fecha_creacion
             FROM usuarios WHERE rol != 'admin' OR ? = 'admin' ORDER BY nombres`,
            [req.user.rol]
        );
        res.json(rows);
    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ error: 'Error' });
    }
});

app.get('/api/supervisor/usuarios-rol/:rol', authenticateToken, authorizeRoles('supervisor', 'admin'), async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `SELECT id, nombres, apellido_paterno, apellido_materno, cargo, ci, extension, 
                    email_corporativo, usuario, rol, habilitado
             FROM usuarios WHERE rol = ? AND habilitado = TRUE ORDER BY nombres`,
            [req.params.rol]
        );
        res.json(rows);
    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ error: 'Error' });
    }
});

app.post('/api/supervisor/usuario', authenticateToken, authorizeRoles('supervisor', 'admin'), async (req, res) => {
    try {
        const { nombres, apellido_paterno, apellido_materno, cargo, ci, extension,
                email_corporativo, usuario, contrasena, rol } = req.body;

        if (!nombres || !apellido_paterno || !apellido_materno || !cargo || !ci || 
            !email_corporativo || !usuario || !contrasena) {
            return res.status(400).json({ error: 'Campos requeridos' });
        }

        if (contrasena.length < 8) {
            return res.status(400).json({ error: 'Contraseña mínimo 8 caracteres' });
        }

        const [existing] = await pool.execute(
            'SELECT id FROM usuarios WHERE ci = ? OR email_corporativo = ? OR usuario = ?',
            [ci, email_corporativo, usuario]
        );

        if (existing.length > 0) {
            return res.status(400).json({ error: 'Usuario, CI o email ya existe' });
        }

        const hashedPassword = await bcrypt.hash(contrasena, 10);

        const [result] = await pool.execute(
            `INSERT INTO usuarios (nombres, apellido_paterno, apellido_materno, cargo, ci, extension,
                                   email_corporativo, usuario, contrasena, rol)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [nombres, apellido_paterno, apellido_materno, cargo, ci, extension || null,
             email_corporativo, usuario, hashedPassword, rol || 'usuario']
        );

        res.json({ success: true, id: result.insertId });
    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ error: 'Error' });
    }
});

app.put('/api/supervisor/usuario/:id', authenticateToken, authorizeRoles('supervisor', 'admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const { nombres, apellido_paterno, apellido_materno, cargo, ci, extension,
                email_corporativo, usuario, rol, habilitado } = req.body;

        await pool.execute(
            `UPDATE usuarios SET nombres = ?, apellido_paterno = ?, apellido_materno = ?, 
                cargo = ?, ci = ?, extension = ?, email_corporativo = ?, 
                usuario = ?, rol = ?, habilitado = ? WHERE id = ?`,
            [nombres, apellido_paterno, apellido_materno, cargo, ci, extension,
             email_corporativo, usuario, rol, habilitado, id]
        );

        res.json({ success: true });
    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ error: 'Error' });
    }
});

app.put('/api/supervisor/usuario/:id/contrasena', authenticateToken, authorizeRoles('supervisor', 'admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const { contrasena } = req.body;

        if (!contrasena || contrasena.length < 8) {
            return res.status(400).json({ error: 'Contraseña mínimo 8 caracteres' });
        }

        const hashedPassword = await bcrypt.hash(contrasena, 10);
        await pool.execute('UPDATE usuarios SET contrasena = ? WHERE id = ?', [hashedPassword, id]);

        res.json({ success: true });
    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ error: 'Error' });
    }
});

app.delete('/api/supervisor/usuario/:id', authenticateToken, authorizeRoles('supervisor', 'admin'), async (req, res) => {
    try {
        const { id } = req.params;

        if (parseInt(id) === req.user.id) {
            return res.status(400).json({ error: 'No puede eliminarse a sí mismo' });
        }

        await pool.execute('DELETE FROM usuarios WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ error: 'Error' });
    }
});

// =====================================================
// HABILITACIONES
// =====================================================

app.get('/api/supervisor/habilitaciones', authenticateToken, authorizeRoles('supervisor', 'admin'), async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `SELECT h.*, 
                    CONCAT(u.nombres, ' ', u.apellido_paterno, ' ', u.apellido_materno) as nombre_usuario,
                    u.email_corporativo,
                    CONCAT(s.nombres, ' ', s.apellido_paterno) as nombre_supervisor
             FROM habilitaciones h
             INNER JOIN usuarios u ON h.usuario_id = u.id
             INNER JOIN usuarios s ON h.supervisor_id = s.id
             ORDER BY h.fecha_creacion DESC`
        );
        res.json(rows);
    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ error: 'Error' });
    }
});

app.post('/api/supervisor/habilitacion', authenticateToken, authorizeRoles('supervisor', 'admin'), async (req, res) => {
    try {
        const { usuario_id, fecha_inicio, fecha_fin } = req.body;

        if (!usuario_id || !fecha_inicio || !fecha_fin) {
            return res.status(400).json({ error: 'Campos requeridos' });
        }

        const [existing] = await pool.execute(
            `SELECT id FROM habilitaciones WHERE usuario_id = ? AND habilitado = TRUE 
             AND ((fecha_inicio BETWEEN ? AND ?) OR (fecha_fin BETWEEN ? AND ?))`,
            [usuario_id, fecha_inicio, fecha_fin, fecha_inicio, fecha_fin]
        );

        if (existing.length > 0) {
            return res.status(400).json({ error: 'Ya existe habilitación en ese período' });
        }

        const [result] = await pool.execute(
            `INSERT INTO habilitaciones (usuario_id, supervisor_id, fecha_inicio, fecha_fin)
             VALUES (?, ?, ?, ?)`,
            [usuario_id, req.user.id, fecha_inicio, fecha_fin]
        );

        res.json({ success: true, id: result.insertId });
    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ error: 'Error' });
    }
});

app.put('/api/supervisor/habilitacion/:id', authenticateToken, authorizeRoles('supervisor', 'admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const { habilitado } = req.body;

        await pool.execute('UPDATE habilitaciones SET habilitado = ? WHERE id = ?', [habilitado, id]);
        res.json({ success: true });
    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ error: 'Error' });
    }
});

// PUT /api/supervisor/habilitacion/:id/fechas - Modificar fechas
app.put('/api/supervisor/habilitacion/:id/fechas', authenticateToken, authorizeRoles('supervisor', 'admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const { fecha_inicio, fecha_fin } = req.body;

        if (!fecha_inicio || !fecha_fin) {
            return res.status(400).json({ error: 'Fechas requeridas' });
        }
        if (new Date(fecha_inicio) >= new Date(fecha_fin)) {
            return res.status(400).json({ error: 'Fecha fin debe ser mayor a fecha inicio' });
        }

        await pool.execute(
            'UPDATE habilitaciones SET fecha_inicio = ?, fecha_fin = ? WHERE id = ?',
            [fecha_inicio, fecha_fin, id]
        );
        res.json({ success: true, message: 'Fechas actualizadas' });
    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ error: 'Error al actualizar fechas' });
    }
});

app.delete('/api/supervisor/habilitacion/:id', authenticateToken, authorizeRoles('supervisor', 'admin'), async (req, res) => {
    try {
        await pool.execute('DELETE FROM habilitaciones WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ error: 'Error' });
    }
});

app.get('/api/supervisor/habilitacion/:id/texto', authenticateToken, authorizeRoles('supervisor', 'admin'), async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `SELECT h.*, CONCAT(u.nombres, ' ', u.apellido_paterno, ' ', u.apellido_materno) as nombre_usuario
             FROM habilitaciones h
             INNER JOIN usuarios u ON h.usuario_id = u.id
             WHERE h.id = ?`,
            [req.params.id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'No encontrado' });
        }

        const h = rows[0];
        const fechaInicio = new Date(h.fecha_inicio).toLocaleDateString('es-BO');
        const fechaFin = new Date(h.fecha_fin).toLocaleDateString('es-BO');

        const texto = `Estimado/a ${h.nombre_usuario}:

A través del presente correo, se le envía el formulario de rendición de cuentas, el cual estará habilitado desde el ${fechaInicio} hasta el ${fechaFin}.

Para su comodidad, el enlace de acceso se encuentra adjunto:
http://localhost:${PORT}/usuario/formulario.html

Le agradeceremos completar correctamente el formulario dentro del plazo establecido.

Saludos cordiales.

"LA SAGRADA FAMILIA" R.L.
COOPERATIVA DE AHORRO Y CRÉDITO ABIERTA`;

        res.json({ texto });
    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ error: 'Error' });
    }
});

// =====================================================
// REGISTROS
// =====================================================

app.get('/api/supervisor/registros', authenticateToken, authorizeRoles('supervisor', 'admin'), async (req, res) => {
    try {
        const { usuario_id, fecha_inicio, fecha_fin } = req.query;

        let query = `
            SELECT a.*, 
                   CONCAT(u.nombres, ' ', u.apellido_paterno, ' ', u.apellido_materno) as nombre_usuario,
                   u.ci, u.extension, u.cargo
            FROM asignaciones a
            INNER JOIN usuarios u ON a.usuario_id = u.id
            WHERE 1=1
        `;
        const params = [];

        if (usuario_id) {
            query += ' AND a.usuario_id = ?';
            params.push(usuario_id);
        }
        if (fecha_inicio) {
            query += ' AND a.fecha_salida >= ?';
            params.push(fecha_inicio);
        }
        if (fecha_fin) {
            query += ' AND a.fecha_llegada <= ?';
            params.push(fecha_fin);
        }

        query += ' ORDER BY a.fecha_creacion DESC';

        const [asignaciones] = await pool.execute(query, params);

        for (let asignacion of asignaciones) {
            const [gastos] = await pool.execute(
                'SELECT * FROM gastos WHERE asignacion_id = ? ORDER BY id',
                [asignacion.id]
            );
            asignacion.gastos = gastos;
        }

        res.json(asignaciones);
    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ error: 'Error' });
    }
});

app.put('/api/supervisor/asignacion/:id', authenticateToken, authorizeRoles('supervisor', 'admin'), async (req, res) => {
    const connection = await pool.getConnection();
    
    try {
        await connection.beginTransaction();

        const { id } = req.params;
        const { ciudad_origen, ciudad_destino, fecha_salida, fecha_llegada, monto_asignacion, gastos } = req.body;

        const montoNum = parseFloat(monto_asignacion);
        if (isNaN(montoNum) || montoNum < 0) {
            return res.status(400).json({ error: 'El monto debe ser 0 o mayor' });
        }

        const nuevoId = generarIdentificadorUnico();
        await connection.execute(
            `UPDATE asignaciones SET ciudad_origen = ?, ciudad_destino = ?,
             fecha_salida = ?, fecha_llegada = ?, monto_asignacion = ?,
             identificador_unico = ? WHERE id = ?`,
            [ciudad_origen.toUpperCase(), ciudad_destino.toUpperCase(),
             fecha_salida, fecha_llegada, montoNum, nuevoId, id]
        );

        if (gastos && Array.isArray(gastos)) {
            const [gastosActuales] = await connection.execute(
                'SELECT id FROM gastos WHERE asignacion_id = ?', [id]
            );
            const idsActuales = gastosActuales.map(g => g.id);
            const idsEnviados = gastos.filter(g => g.id).map(g => g.id);

            for (const idActual of idsActuales) {
                if (!idsEnviados.includes(idActual)) {
                    await connection.execute('DELETE FROM gastos WHERE id = ?', [idActual]);
                }
            }

            for (const gasto of gastos) {
                if (gasto.id) {
                    await connection.execute(
                        `UPDATE gastos SET tipo_gasto = ?, tipo_comprobante = ?, numero_comprobante = ?,
                         monto = ?, observaciones = ?, nombre_proveedor_hospedaje = ?,
                         ci_proveedor = ?, extension_proveedor = ? WHERE id = ?`,
                        [gasto.tipo_gasto, gasto.tipo_comprobante, gasto.numero_comprobante || null,
                         parseFloat(gasto.monto), gasto.observaciones || null,
                         gasto.nombre_proveedor_hospedaje || null, gasto.ci_proveedor || null,
                         gasto.extension_proveedor || null, gasto.id]
                    );
                } else {
                    await connection.execute(
                        `INSERT INTO gastos (asignacion_id, tipo_gasto, tipo_comprobante, numero_comprobante,
                         monto, observaciones, nombre_proveedor_hospedaje, ci_proveedor, extension_proveedor)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [id, gasto.tipo_gasto, gasto.tipo_comprobante, gasto.numero_comprobante || null,
                         parseFloat(gasto.monto), gasto.observaciones || null,
                         gasto.nombre_proveedor_hospedaje || null, gasto.ci_proveedor || null,
                         gasto.extension_proveedor || null]
                    );
                }
            }
        }

        await connection.commit();
        res.json({ success: true, message: 'Asignación actualizada' });

    } catch (error) {
        await connection.rollback();
        console.error('Error:', error.message);
        res.status(500).json({ error: 'Error al actualizar' });
    } finally {
        connection.release();
    }
});

// =====================================================
// REPORTES
// =====================================================

// MEJORA 5: Servir documento adjunto de un gasto
app.get('/api/documento/:id', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.execute(
            'SELECT documento_archivo, nombre_archivo, tipo_archivo FROM gastos WHERE id = ?',
            [req.params.id]
        );
        if (!rows.length || !rows[0].documento_archivo) {
            return res.status(404).json({ error: 'Documento no encontrado' });
        }
        res.setHeader('Content-Type', rows[0].tipo_archivo || 'application/octet-stream');
        res.setHeader('Content-Disposition',
            `inline; filename="${rows[0].nombre_archivo || 'documento'}"`);
        res.send(rows[0].documento_archivo);
    } catch(err) { res.status(500).json({ error: 'Error' }); }
});
 
// RUTA: Foto de usuario
app.get('/api/usuario/:id/foto', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.execute(
            'SELECT foto, tipo_foto FROM usuarios WHERE id = ?',
            [req.params.id]
        );
        if (!rows.length || !rows[0].foto) {
            const def = path.join(__dirname, 'public', 'Imagen', 'loguin.jpg');
            if (fs.existsSync(def)) {
                res.setHeader('Content-Type', 'image/jpeg');
                return res.send(fs.readFileSync(def));
            }
            return res.status(404).json({ error: 'Sin foto' });
        }
        res.setHeader('Content-Type', rows[0].tipo_foto || 'image/jpeg');
        res.send(rows[0].foto);
    } catch(err) {
        console.error('Error foto:', err.message);
        res.status(500).json({ error: 'Error al obtener foto' });
    }
});

app.get('/api/reporte/gastos', authenticateToken, authorizeRoles('supervisor', 'admin'), async (req, res) => {

    try {
        const { fecha_inicio, fecha_fin } = req.query;

        if (!fecha_inicio || !fecha_fin) {
            return res.status(400).json({ error: 'Fechas requeridas' });
        }

        const [gastos] = await pool.execute(
            `SELECT g.*, a.ciudad_origen, a.ciudad_destino, a.fecha_salida, a.fecha_llegada,
                    u.nombres, u.apellido_paterno, u.apellido_materno, u.ci, u.extension
             FROM gastos g
             INNER JOIN asignaciones a ON g.asignacion_id = a.id
             INNER JOIN usuarios u ON a.usuario_id = u.id
             WHERE a.fecha_salida >= ? AND a.fecha_llegada <= ?
             ORDER BY a.fecha_salida, u.nombres`,
            [fecha_inicio, fecha_fin]
        );

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Cuadro Detallado');

        // Estilos corporativos
        const headerStyle = {
            font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 },
            fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF058538' } },
            alignment: { horizontal: 'center', vertical: 'middle' },
            border: { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }
        };

        // Logo (filas 1-4)
        try {
            const logoPath = path.join(__dirname, 'Imagen', 'logo vertical.png');
            if (fs.existsSync(logoPath)) {
                const logoId = workbook.addImage({ filename: logoPath, extension: 'png' });
                worksheet.addImage(logoId, { tl:{col:0,row:0}, ext:{width:360,height:75} });
            }
        } catch(e) { console.log('Logo no cargado:', e.message); }
        worksheet.getRow(1).height = 20;
        worksheet.getRow(2).height = 20;
        worksheet.getRow(3).height = 20;
        worksheet.getRow(4).height = 15;
 
        // Fila 5: Título
		worksheet.mergeCells('A2:M2');
		const titleCell = worksheet.getCell('A2');
		const textoTitulo = 'CUADRO DETALLADO DE GASTOS';
		titleCell.value = textoTitulo;
		titleCell.font = { bold: true, size: 13, color: { argb: 'FF000000' } }; // Letras negras
		titleCell.fill = undefined; // Sin relleno
		titleCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

		// Calcular altura automática
		const lineasTitulo = Math.ceil(textoTitulo.length / 45); // 45 caracteres por línea aproximado
		worksheet.getRow(2).height = lineasTitulo * 18; // 18 puntos por línea
 
        // Fila 6: Período
		// Período - Ajuste manual según longitud
		worksheet.mergeCells('A3:M3');
		const periodoCell = worksheet.getCell('A3');
		const textoPeriodo = `Período: ${fecha_inicio} al ${fecha_fin}`;
		periodoCell.value = textoPeriodo;
		periodoCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
		periodoCell.font = { italic: true, size: 11 };

		// Calcular altura aproximada (cada 50 caracteres aproximadamente es una línea)
		const lineas = Math.ceil(textoPeriodo.length / 50);
		worksheet.getRow(3).height = lineas * 15; // 15 puntos por línea
 
 
 
 
 
 
 
 
		// ── Fila 5: Encabezados 13 columnas ──────────────────────────
		// Columnas: Nº | NOMBRES | C.I. | EXT | COMPROBANTE | TIPO GASTO
		//           IMPORTE | RC-IVA 13% | IUE 5% | IT 3% | RETENCIÓN TOTAL
		//           FECHA SALIDA | FECHA LLEGADA
		//
		// Reglas de retención:
		//   FACTURA  → todo 0
		//   RECIBO/NINGUNO + SERVICIOS (PASAJE, HOSPEDAJE, OTROS SERVICIOS)
		//              → RC-IVA 13% | IUE 0% | IT 3%
		//   RECIBO/NINGUNO + BIENES (COMBUSTIBLE, OTROS BIENES)
		//              → RC-IVA 0%  | IUE 5% | IT 3%
		const headers = [
			'Nº', 'NOMBRES', 'C.I.', 'EXT', 'COMPROBANTE',
			'TIPO GASTO', 'IMPORTE',
			'RETENCIÓN RC - IVA 13%',
			'RETENCIÓN IUE 5%',
			'RETENCIÓN IT 3%',
			'RETENCIÓN TOTAL',
			'FECHA SALIDA', 'FECHA LLEGADA'
		];
		const NUM_COLS = 13;
		const headerRow = worksheet.getRow(5);
		headers.forEach((header, i) => {
			const cell = headerRow.getCell(i + 1);
			cell.value = header;
			cell.style = headerStyle;
			cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
		});
		headerRow.height = 40;

		// Anchos de columna (13 columnas)
		const colWidths = [5, 33, 12, 7, 15, 15, 13, 16, 14, 13, 16, 13, 13];
		for (let i = 0; i < NUM_COLS; i++) {
			worksheet.getColumn(i + 1).width = colWidths[i];
		}

		let totalImporte  = 0;
		let totalRetIva   = 0;   // RC-IVA 13% (servicios)
		let totalRetIue   = 0;   // IUE    5%  (bienes)
		let totalRetIt    = 0;   // IT     3%  (todos excepto factura)
		let totalRetTotal = 0;
		let rowIndex = 6;

		gastos.forEach((gasto, index) => {
			const row = worksheet.getRow(rowIndex++);
			const nombreCompleto = `${gasto.nombres} ${gasto.apellido_paterno} ${gasto.apellido_materno}`;
			const monto = parseFloat(gasto.monto);

			const esFactura  = gasto.tipo_comprobante === 'FACTURA';
			const esBien     = (gasto.tipo_gasto === 'COMBUSTIBLE' || gasto.tipo_gasto === 'OTROS BIENES');
			const esServicio = !esBien;

			// RC-IVA 13%: aplica solo a SERVICIOS con RECIBO o NINGUNO
			const retIva  = (!esFactura && esServicio) ? monto * 0.13 : 0;
			// IUE 5%: aplica solo a BIENES con RECIBO o NINGUNO
			const retIue  = (!esFactura && esBien)     ? monto * 0.05 : 0;
			// IT 3%: aplica a todos excepto FACTURA
			const retIt   = !esFactura                 ? monto * 0.03 : 0;
			const retTotal = retIva + retIue + retIt;

			row.getCell(1).value  = index + 1;
			row.getCell(2).value  = nombreCompleto;
			row.getCell(3).value  = gasto.ci;
			row.getCell(4).value  = gasto.extension || '';
			row.getCell(5).value  = gasto.tipo_comprobante;
			row.getCell(6).value  = gasto.tipo_gasto;
			row.getCell(7).value  = monto;     row.getCell(7).numFmt  = '#,##0.00';
			row.getCell(8).value  = retIva;    row.getCell(8).numFmt  = '#,##0.00';
			row.getCell(9).value  = retIue;    row.getCell(9).numFmt  = '#,##0.00';
			row.getCell(10).value = retIt;     row.getCell(10).numFmt = '#,##0.00';
			row.getCell(11).value = retTotal;  row.getCell(11).numFmt = '#,##0.00';
			row.getCell(12).value = new Date(gasto.fecha_salida).toLocaleDateString('es-BO');
			row.getCell(13).value = new Date(gasto.fecha_llegada).toLocaleDateString('es-BO');

			// Resaltar en amarillo las celdas IUE cuando aplica (igual que imagen 2)

			// Estilos de fila
			for (let i = 1; i <= NUM_COLS; i++) {
				const cell = row.getCell(i);
				cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
				cell.border = {
					top:    { style: 'thin' }, left:   { style: 'thin' },
					bottom: { style: 'thin' }, right:  { style: 'thin' }
				};
				// Fila alterna gris claro (solo si no tiene relleno amarillo)
				if (index % 2 === 0 && !cell.fill?.fgColor) {
					cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
				}
			}
			row.height = 14;

			totalImporte  += monto;
			totalRetIva   += retIva;
			totalRetIue   += retIue;
			totalRetIt    += retIt;
			totalRetTotal += retTotal;
		});









        // ── Fila TOTALES con fondo naranja ──────────────────────────
		const totalRow = worksheet.getRow(rowIndex);

		totalRow.getCell(6).value = 'TOTALES:';
		totalRow.getCell(6).font  = { bold: true };
		totalRow.getCell(6).alignment = { horizontal: 'left', vertical: 'middle' };

		totalRow.getCell(7).value  = { formula: `SUM(G6:G${rowIndex - 1})` };
		totalRow.getCell(7).numFmt = '#,##0.00';
		totalRow.getCell(8).value  = { formula: `SUM(H6:H${rowIndex - 1})` };
		totalRow.getCell(8).numFmt = '#,##0.00';
		totalRow.getCell(9).value  = { formula: `SUM(I6:I${rowIndex - 1})` };
		totalRow.getCell(9).numFmt = '#,##0.00';
		totalRow.getCell(10).value = { formula: `SUM(J6:J${rowIndex - 1})` };
		totalRow.getCell(10).numFmt = '#,##0.00';
		totalRow.getCell(11).value = { formula: `SUM(K6:K${rowIndex - 1})` };
		totalRow.getCell(11).numFmt = '#,##0.00';

		// Fondo naranja en columnas 6 a 11
		for (let i = 6; i <= 11; i++) {
			const cell = totalRow.getCell(i);
			cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF9703' } };
			cell.font = { bold: true };
			cell.alignment = { horizontal: 'left', vertical: 'middle' };
		}
		totalRow.height = 18;

		// Anchos finales de columna (13 columnas)
		worksheet.columns = [
			{ width: 5 },     // A: Nº
			{ width: 33.14 }, // B: NOMBRES
			{ width: 12 },    // C: C.I.
			{ width: 7 },     // D: EXT
			{ width: 15 },    // E: COMPROBANTE
			{ width: 15 },    // F: TIPO GASTO
			{ width: 13 },    // G: IMPORTE
			{ width: 18 },    // H: RC-IVA 13%
			{ width: 14 },    // I: IUE 5%
			{ width: 13 },    // J: IT 3%
			{ width: 16 },    // K: RETENCIÓN TOTAL
			{ width: 13 },    // L: FECHA SALIDA
			{ width: 13 }     // M: FECHA LLEGADA
		];

		res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
		res.setHeader('Content-Disposition', `attachment; filename=CUADRO_GASTOS_${fecha_inicio}_${fecha_fin}.xlsx`);

		await workbook.xlsx.write(res);
		res.end();
				
		
		
		
		

    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ error: 'Error al generar reporte' });
    }
});

// =====================================================
// MEJORA 1: FORMULARIOS DE RETENCIÓN - NUEVO FORMATO
// =====================================================

app.get('/api/reporte/formularios', authenticateToken, authorizeRoles('supervisor', 'admin'), async (req, res) => {
    try {
        const { usuario_id, fecha_inicio, fecha_fin } = req.query;

        let query = `
            SELECT g.*, a.ciudad_origen, a.ciudad_destino, a.fecha_salida, a.fecha_llegada,
                   u.nombres, u.apellido_paterno, u.apellido_materno, u.ci, u.extension
            FROM gastos g
            INNER JOIN asignaciones a ON g.asignacion_id = a.id
            INNER JOIN usuarios u ON a.usuario_id = u.id
            WHERE g.tipo_comprobante IN ('RECIBO', 'NINGUNO')
        `;
        const params = [];

        if (usuario_id) {
            query += ' AND a.usuario_id = ?';
            params.push(usuario_id);
        }
        if (fecha_inicio) {
            query += ' AND a.fecha_salida >= ?';
            params.push(fecha_inicio);
        }
        if (fecha_fin) {
            query += ' AND a.fecha_llegada <= ?';
            params.push(fecha_fin);
        }

        query += ' ORDER BY g.tipo_gasto, g.id';

        const [gastos] = await pool.execute(query, params);

        if (gastos.length === 0) {
            return res.status(404).json({ error: 'No hay gastos RECIBO/NINGUNO en el período seleccionado' });
        }

        const workbook = new ExcelJS.Workbook();

        // Contadores para nombres de hojas
        const contadores = { PASAJE: 0, HOSPEDAJE: 0, 'OTROS SERVICIOS': 0, COMBUSTIBLE: 0, 'OTROS BIENES': 0 };

        // Colores corporativos
        const COLOR_VERDE = 'FF375623';
        const COLOR_AMARILLO = 'FFFFFFE6';
        const COLOR_BLANCO = 'FFFFFFFF';

        for (const gasto of gastos) {
            contadores[gasto.tipo_gasto]++;
            const sufijo = contadores[gasto.tipo_gasto] > 1 ? `_${contadores[gasto.tipo_gasto]}` : '';
            const nombreHoja = `RETENCION_DE_${gasto.tipo_gasto}${sufijo}`.substring(0, 31);

            const ws = workbook.addWorksheet(nombreHoja);

            // Cálculos - tasa diferenciada según categoría
            const importeNeto = parseFloat(gasto.monto);
            const esBienForm = (gasto.tipo_gasto === 'COMBUSTIBLE' || gasto.tipo_gasto === 'OTROS BIENES');
            // Servicios: RC-IVA 13% + IT 3% = 16% | Bienes: IUE 5% + IT 3% = 8%
            const tasaImpuesto = esBienForm ? 0.05 : 0.13;
            const rcIva = importeNeto * tasaImpuesto;
            const it = importeNeto * 0.03;
            const gastoConRetencion = importeNeto + rcIva + it;

            // Configurar anchos de columna
            ws.getColumn('A').width = 6;   // 1.61cm aprox
            ws.getColumn('B').width = 18;
            ws.getColumn('C').width = 22;
            ws.getColumn('D').width = 15;
            ws.getColumn('E').width = 18;

            // Intentar agregar logo
            const logoPath = path.join(__dirname, 'public', 'Imagen', 'logo vertical.png');
            if (fs.existsSync(logoPath)) {
                try {
                    const imageId = workbook.addImage({
                        filename: logoPath,
                        extension: 'png'
                    });
                    ws.addImage(imageId, {
                        tl: { col: 0, row: 0 },
                        ext: { width: 260, height: 50 }
                    });
                } catch (imgError) {
                    console.log('No se pudo agregar imagen:', imgError.message);
                }
            }

            // Fila 3: Título
			ws.mergeCells('B3:E3');
			const tituloCell = ws.getCell('B3');
			tituloCell.value = 'RETENCIÓN DE SERVICIOS';
			tituloCell.font = { bold: true, size: 14, color: { argb: 'FF000000' } };
			tituloCell.fill = undefined; // Sin fondo
			tituloCell.alignment = { horizontal: 'center', vertical: 'middle' };
			tituloCell.border = undefined; // Sin borde
			ws.getRow(2).height = 25;

            // Fila 5: Encabezados de cálculos
			// Definir el nuevo color verde
			const COLOR_VERDE_NUEVO = 'FF057F35'; // Color #057F35 en formato ARGB

			// Configurar ancho solo para columna C
			ws.getColumn('C').width = 26;

			const headerStyle = {
				font: { bold: true, color: { argb: COLOR_BLANCO }, size: 12 },
				fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_VERDE_NUEVO } }, // Nuevo color
				alignment: { horizontal: 'center', vertical: 'middle' },
				border: {
					top: { style: 'thin', color: { argb: 'FF000000' } },
					left: { style: 'thin', color: { argb: 'FF000000' } },
					bottom: { style: 'thin', color: { argb: 'FF000000' } },
					right: { style: 'thin', color: { argb: 'FF000000' } }
				}
			};

			// Fila 5: Encabezados
			ws.getCell('B5').value = 'IMPORTE NETO';
			ws.getCell('B5').style = headerStyle;
			ws.getCell('C5').value = esBienForm ? 'GASTO C/RETENCIÓN 8%' : 'GASTO C/RETENCIÓN 16%';
			ws.getCell('C5').style = headerStyle;
			ws.getCell('D5').value = esBienForm ? 'IUE 5%' : 'RC-IVA 13%';
			ws.getCell('D5').style = headerStyle;
			ws.getCell('E5').value = 'IT 3%';
			ws.getCell('E5').style = headerStyle;

            // Fila 6: Valores calculados
			const valueStyle = {
				font: { size: 12 }, // Tamaño 12
				alignment: { horizontal: 'center', vertical: 'middle' },
				border: {
					top: { style: 'thin', color: { argb: 'FF000000' } },
					left: { style: 'thin', color: { argb: 'FF000000' } },
					bottom: { style: 'thin', color: { argb: 'FF000000' } },
					right: { style: 'thin', color: { argb: 'FF000000' } }
				},
				numFmt: '#,##0.00'
			};

			ws.getCell('B6').value = importeNeto;
			ws.getCell('B6').style = valueStyle;
			ws.getCell('C6').value = gastoConRetencion;
			ws.getCell('C6').style = valueStyle;
			ws.getCell('C6').font = { bold: true, size: 12 }; // También tamaño 12
			ws.getCell('D6').value = rcIva;
			ws.getCell('D6').style = valueStyle;
			ws.getCell('E6').value = it;
			ws.getCell('E6').style = valueStyle;

            // Fila 8: DESCRIPCION
			ws.mergeCells('B8:E9');
			const descCell = ws.getCell('B8');
			descCell.value = 'DESCRIPCIÓN';
			descCell.font = { bold: true, size: 14, color: { argb: 'FF000000' } }; // Letra negra tamaño 14
			descCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF9703' } }; // Fondo naranja #FF9703
			descCell.alignment = { horizontal: 'center', vertical: 'middle' };
			descCell.border = {
				top: { style: 'thin', color: { argb: 'FF000000' } },
				left: { style: 'thin', color: { argb: 'FF000000' } },
				bottom: { style: 'thin', color: { argb: 'FF000000' } },
				right: { style: 'thin', color: { argb: 'FF000000' } }
			};

            // Estilos para labels y valores
			// Estilos para labels y valores
			const labelStyle = {
				font: { bold: true },
				alignment: { horizontal: 'right', vertical: 'middle' },
				fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } }, // Relleno gris #D9D9D9
				border: undefined // Sin borde
			};

			const dataStyle = {
				alignment: { horizontal: 'left', vertical: 'middle' }
				// Sin fill ni border en celdas de datos
			};

            // Determinar datos según tipo de gasto
            let nombrePersona, ciPersona, extPersona, fecha, detalle;
            const nombreUsuario = `${gasto.nombres} ${gasto.apellido_paterno} ${gasto.apellido_materno}`;

            if (gasto.tipo_gasto === 'HOSPEDAJE') {
                nombrePersona = gasto.nombre_proveedor_hospedaje || nombreUsuario;
                ciPersona = gasto.ci_proveedor || gasto.ci;
                extPersona = gasto.extension_proveedor || gasto.extension || '';
                fecha = gasto.fecha_hospedaje ? new Date(gasto.fecha_hospedaje) : new Date(gasto.fecha_salida);
                
                if (gasto.tipo_comprobante === 'RECIBO') {
                    detalle = `R-${gasto.numero_comprobante || 'S/N'}, HOSPEDAJE, ${nombrePersona}, ${nombreUsuario}`;
                } else {
                    detalle = `HOSPEDAJE, ${nombrePersona}, ${nombreUsuario}`;
                }
            } else if (gasto.tipo_gasto === 'PASAJE') {
                nombrePersona = nombreUsuario;
                ciPersona = gasto.ci;
                extPersona = gasto.extension || '';
                fecha = new Date(gasto.fecha_salida);
                
                if (gasto.tipo_comprobante === 'RECIBO') {
                    detalle = `R-${gasto.numero_comprobante || 'S/N'}, PASAJE, ${gasto.ciudad_origen}, ${gasto.ciudad_destino}, ${nombreUsuario}`;
                } else {
                    detalle = `PASAJE, ${gasto.ciudad_origen}, ${gasto.ciudad_destino}, ${nombreUsuario}`;
                }
            } else { // OTROS SERVICIOS / COMBUSTIBLE / OTROS BIENES
                nombrePersona = nombreUsuario;
                ciPersona = gasto.ci;
                extPersona = gasto.extension || '';
                fecha = new Date(gasto.fecha_salida);
                
                const tipoLabel = gasto.tipo_gasto; // 'OTROS SERVICIOS', 'COMBUSTIBLE' o 'OTROS BIENES'
                const obs = gasto.observaciones || 'Gastos varios';
                if (gasto.tipo_comprobante === 'RECIBO') {
                    detalle = `R-${gasto.numero_comprobante || 'S/N'}, ${tipoLabel}, ${obs}, ${nombreUsuario}`;
                } else {
                    detalle = `${tipoLabel}, ${obs}, ${nombreUsuario}`;
                }
            }

            // Fila 11: NOMBRE Y AP
            ws.getCell('B11').value = 'NOMBRE Y AP:';
            ws.getCell('B11').style = labelStyle;
            ws.mergeCells('C11:E11');
            ws.getCell('C11').value = nombrePersona;
            ws.getCell('C11').style = dataStyle;

            // Fila 13: CI y EXT
            ws.getCell('B13').value = 'C.I.:';
            ws.getCell('B13').style = labelStyle;
            ws.getCell('C13').value = ciPersona;
            ws.getCell('C13').style = dataStyle;
            ws.getCell('D13').value = 'EXT.:';
            ws.getCell('D13').style = labelStyle;
            ws.getCell('E13').value = extPersona;
            ws.getCell('E13').style = dataStyle;

            // Fila 15: IMPORTE NETO y FECHA
            ws.getCell('B15').value = 'IMPORTE NETO:';
            ws.getCell('B15').style = labelStyle;
            ws.getCell('C15').value = importeNeto;
            ws.getCell('C15').style = { ...dataStyle, numFmt: '#,##0.00' };
            ws.getCell('D15').value = 'FECHA:';
            ws.getCell('D15').style = labelStyle;
            ws.getCell('E15').value = fecha.toLocaleDateString('es-BO');
            ws.getCell('E15').style = dataStyle;

            // Fila 17: DETALLE
            ws.getCell('B17').value = 'DETALLE:';
            ws.getCell('B17').style = labelStyle;
            ws.mergeCells('C17:E17');
            ws.getCell('C17').value = detalle;
            ws.getCell('C17').style = { ...dataStyle, alignment: { horizontal: 'left', vertical: 'middle', wrapText: true } };
            ws.getRow(17).height = 30;

            // Fila 30-31: Firmas
			ws.getCell('B30').value = '------------------------------';
			ws.getCell('B30').alignment = { horizontal: 'center' };
			ws.getCell('B30').font = { bold: true, size: 12 }; // Negrita tamaño 12

			ws.getCell('B31').value = 'FIRMA';
			ws.getCell('B31').alignment = { horizontal: 'center' };
			ws.getCell('B31').font = { bold: true, size: 12 }; // Negrita tamaño 12

			ws.getCell('E30').value = '------------------------------';
			ws.getCell('E30').alignment = { horizontal: 'center' };
			ws.getCell('E30').font = { bold: true, size: 12 }; // Negrita tamaño 12

			ws.getCell('E31').value = 'FIRMA';
			ws.getCell('E31').alignment = { horizontal: 'center' };
			ws.getCell('E31').font = { bold: true, size: 12 }; // Negrita tamaño 12
        }

        // Nombre del archivo
        const primerGasto = gastos[0];
        const nombreUsuario = `${primerGasto.nombres}_${primerGasto.apellido_paterno}`.replace(/\s/g, '_');
        const nombreArchivo = `RETENCION_${nombreUsuario}_${fecha_inicio || 'todos'}_${fecha_fin || 'todos'}.xlsx`;

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=${nombreArchivo}`);

        await workbook.xlsx.write(res);
        res.end();

    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ error: 'Error al generar formularios' });
    }
});

// =====================================================
// RUTAS DE ADMIN
// =====================================================

app.get('/api/admin/estadisticas', authenticateToken, authorizeRoles('admin'), async (req, res) => {
    try {
        const [totalUsuarios] = await pool.execute('SELECT COUNT(*) as total FROM usuarios WHERE rol = "usuario"');
        const [usuariosHabilitados] = await pool.execute(
            `SELECT COUNT(DISTINCT h.usuario_id) as total FROM habilitaciones h
             WHERE h.habilitado = TRUE AND CURDATE() BETWEEN h.fecha_inicio AND h.fecha_fin`
        );
        const [asignacionesCompletadas] = await pool.execute('SELECT COUNT(*) as total FROM asignaciones WHERE estado = "completada"');
        const [totalGastos] = await pool.execute('SELECT COUNT(*) as total FROM gastos');
        const [gastoMensual] = await pool.execute(
            `SELECT COALESCE(SUM(monto), 0) as total FROM gastos g
             INNER JOIN asignaciones a ON g.asignacion_id = a.id
             WHERE MONTH(a.fecha_salida) = MONTH(CURRENT_DATE()) AND YEAR(a.fecha_salida) = YEAR(CURRENT_DATE())`
        );
        const [totalSupervisores] = await pool.execute('SELECT COUNT(*) as total FROM usuarios WHERE rol = "supervisor"');

        res.json({
            total_usuarios: totalUsuarios[0].total,
            usuarios_habilitados: usuariosHabilitados[0].total,
            asignaciones_completadas: asignacionesCompletadas[0].total,
            total_gastos: totalGastos[0].total,
            gasto_mensual: parseFloat(gastoMensual[0].total),
            total_supervisores: totalSupervisores[0].total
        });
    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ error: 'Error' });
    }
});

app.put('/api/admin/perfil', authenticateToken, authorizeRoles('admin'), async (req, res) => {
    try {
        const { nombres, apellido_paterno, apellido_materno, cargo, usuario, contrasena } = req.body;

        let query = `UPDATE usuarios SET nombres = ?, apellido_paterno = ?, apellido_materno = ?, cargo = ?, usuario = ?`;
        const params = [nombres, apellido_paterno, apellido_materno, cargo, usuario];

        if (contrasena && contrasena.length >= 8) {
            const hashedPassword = await bcrypt.hash(contrasena, 10);
            query += ', contrasena = ?';
            params.push(hashedPassword);
        }

        query += ' WHERE id = ?';
        params.push(req.user.id);

        await pool.execute(query, params);
        res.json({ success: true });
    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ error: 'Error' });
    }
});
// Genera identificador único: DDMMAAAAHHMMMSS
function generarIdentificadorUnico() {
    const ahora = new Date();
    const pad = n => String(n).padStart(2, '0');
    return pad(ahora.getDate()) +
           pad(ahora.getMonth() + 1) +
           ahora.getFullYear() +
           pad(ahora.getHours()) +
           pad(ahora.getMinutes()) +
           pad(ahora.getSeconds());
}
// =====================================================
// RUTAS ESTÁTICAS
// =====================================================

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/usuario/*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', req.path));
});

app.get('/supervisor/*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', req.path));
});

app.get('/admin/*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', req.path));
});

// =====================================================
// MANEJO DE ERRORES
// =====================================================

app.use((err, req, res, next) => {
    console.error('❌ Error Interno:', err.message);
    
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'El archivo es demasiado grande (máximo 10MB)' });
    }
    
    if (err.message === 'Tipo de archivo no permitido') {
        return res.status(400).json({ error: err.message });
    }

    res.status(500).json({ error: 'Error interno: ' + err.message });
});

// =====================================================
// INICIAR SERVIDOR
// =====================================================

initializeDatabase().then(() => {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   🏛️  "LA SAGRADA FAMILIA" R.L.                              ║
║   COOPERATIVA DE AHORRO Y CRÉDITO ABIERTA                    ║
║                                                               ║
║   🚀 Sistema de Rendición de Cuentas v3.0                    ║
║   Servidor: http://localhost:${PORT}                            ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
        `);
    });
});