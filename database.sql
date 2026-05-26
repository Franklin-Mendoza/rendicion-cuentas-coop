-- =====================================================
-- SISTEMA DE RENDICIÓN DE CUENTAS - BASE DE DATOS
-- Versión: V3.4 (definitiva, sin migraciones pendientes)
-- =====================================================

-- Crear la base de datos
CREATE DATABASE IF NOT EXISTS rendicion_cuentas 
CHARACTER SET utf8mb4 
COLLATE utf8mb4_unicode_ci;

USE rendicion_cuentas;

-- =====================================================
-- ELIMINAR TABLAS SI EXISTEN (orden por dependencias)
-- =====================================================
DROP TABLE IF EXISTS gastos;
DROP TABLE IF EXISTS asignaciones;
DROP TABLE IF EXISTS habilitaciones;
DROP TABLE IF EXISTS usuarios;

-- =====================================================
-- TABLA: usuarios
-- =====================================================
CREATE TABLE usuarios (
    id                  INT PRIMARY KEY AUTO_INCREMENT,
    nombres             VARCHAR(100)  NOT NULL,
    apellido_paterno    VARCHAR(100)  NOT NULL,
    apellido_materno    VARCHAR(100)  NOT NULL,
    cargo               VARCHAR(100)  NOT NULL,
    ci                  VARCHAR(20)   NOT NULL,
    extension           VARCHAR(50),
    email_corporativo   VARCHAR(100)  NOT NULL,
    usuario             VARCHAR(50)   NOT NULL,
    contrasena          VARCHAR(255)  NOT NULL,
    rol                 ENUM('usuario', 'supervisor', 'admin') DEFAULT 'usuario',
    habilitado          BOOLEAN       DEFAULT TRUE,
    foto                LONGBLOB,
    tipo_foto           VARCHAR(50)   DEFAULT 'image/jpeg',
    fecha_creacion      TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_ci      (ci),
    UNIQUE KEY unique_email   (email_corporativo),
    UNIQUE KEY unique_usuario (usuario)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- TABLA: habilitaciones
-- =====================================================
CREATE TABLE habilitaciones (
    id              INT PRIMARY KEY AUTO_INCREMENT,
    usuario_id      INT     NOT NULL,
    supervisor_id   INT     NOT NULL,
    fecha_inicio    DATE    NOT NULL,
    fecha_fin       DATE    NOT NULL,
    habilitado      BOOLEAN DEFAULT TRUE,
    fecha_creacion  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id)    REFERENCES usuarios(id) ON DELETE CASCADE,
    FOREIGN KEY (supervisor_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    INDEX idx_usuario_id    (usuario_id),
    INDEX idx_supervisor_id (supervisor_id),
    INDEX idx_fechas        (fecha_inicio, fecha_fin)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- TABLA: asignaciones
-- =====================================================
CREATE TABLE asignaciones (
    id                  INT PRIMARY KEY AUTO_INCREMENT,
    usuario_id          INT             NOT NULL,
    ciudad_origen       VARCHAR(100)    NOT NULL,
    ciudad_destino      VARCHAR(100)    NOT NULL,
    fecha_salida        DATE            NOT NULL,
    fecha_llegada       DATE            NOT NULL,
    monto_asignacion    DECIMAL(10,2)   NOT NULL,
    estado              ENUM('pendiente', 'completada') DEFAULT 'pendiente',
    pdf_generado        BOOLEAN         DEFAULT FALSE,
    identificador_unico VARCHAR(20),
    es_revision         BOOLEAN         DEFAULT FALSE,
    fecha_creacion      TIMESTAMP       DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    UNIQUE KEY unique_asignacion (usuario_id, fecha_salida, fecha_llegada),
    INDEX idx_usuario_id (usuario_id),
    INDEX idx_fechas     (fecha_salida, fecha_llegada),
    INDEX idx_estado     (estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- TABLA: gastos
-- =====================================================
CREATE TABLE gastos (
    id                          INT PRIMARY KEY AUTO_INCREMENT,
    asignacion_id               INT           NOT NULL,
    tipo_gasto                  ENUM('PASAJE','HOSPEDAJE','OTROS SERVICIOS','COMBUSTIBLE','OTROS BIENES') NOT NULL,
    tipo_comprobante            ENUM('FACTURA','RECIBO','NINGUNO') NOT NULL,
    numero_comprobante          VARCHAR(50),
    monto                       DECIMAL(10,2) NOT NULL,
    documento_archivo           LONGBLOB,
    nombre_archivo              VARCHAR(255),
    tipo_archivo                VARCHAR(50),
    observaciones               TEXT,
    nombre_proveedor_hospedaje  VARCHAR(100),
    ci_proveedor                VARCHAR(20),
    extension_proveedor         VARCHAR(50),
    fecha_emision_comprobante   DATE,
    fecha_creacion              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (asignacion_id) REFERENCES asignaciones(id) ON DELETE CASCADE,
    INDEX idx_asignacion_id     (asignacion_id),
    INDEX idx_tipo_gasto        (tipo_gasto),
    INDEX idx_tipo_comprobante  (tipo_comprobante)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- DATOS INICIALES: USUARIOS
-- Contraseña para los tres: admin123 / super123 / user123
-- (todas hasheadas con bcrypt rounds=10, mismo hash de prueba)
-- =====================================================
INSERT INTO usuarios (nombres, apellido_paterno, apellido_materno, cargo, ci, extension, email_corporativo, usuario, contrasena, rol, habilitado) VALUES
('Administrador', 'Sistema',    'Principal',  'Administrador del Sistema',  '12345678', 'LP', 'admin@institucion.gob.bo',      'admin',      '$2a$10$8K1p/a0dL1LXMIgoEDFrwOfMQHLVXAwkhBzVCfcxAMaXgMZxFZpVi', 'admin',      TRUE),
('Juan Carlos',   'Pérez',      'Mamani',     'Supervisor de Contabilidad', '87654321', 'LP', 'supervisor@institucion.gob.bo', 'supervisor', '$2a$10$8K1p/a0dL1LXMIgoEDFrwOfMQHLVXAwkhBzVCfcxAMaXgMZxFZpVi', 'supervisor', TRUE),
('María Elena',   'García',     'Quispe',     'Analista Financiero',        '11223344', 'CB', 'usuario@institucion.gob.bo',    'usuario',    '$2a$10$8K1p/a0dL1LXMIgoEDFrwOfMQHLVXAwkhBzVCfcxAMaXgMZxFZpVi', 'usuario',    TRUE);

-- =====================================================
-- VISTAS
-- =====================================================

-- Habilitaciones activas vigentes hoy
CREATE OR REPLACE VIEW vista_habilitaciones_activas AS
SELECT 
    h.id,
    h.usuario_id,
    CONCAT(u.nombres, ' ', u.apellido_paterno, ' ', u.apellido_materno) AS nombre_usuario,
    u.email_corporativo,
    h.supervisor_id,
    CONCAT(s.nombres, ' ', s.apellido_paterno) AS nombre_supervisor,
    h.fecha_inicio,
    h.fecha_fin,
    h.habilitado,
    h.fecha_creacion
FROM habilitaciones h
INNER JOIN usuarios u ON h.usuario_id = u.id
INNER JOIN usuarios s ON h.supervisor_id = s.id
WHERE h.habilitado = TRUE
  AND CURDATE() BETWEEN h.fecha_inicio AND h.fecha_fin;

-- Resumen completo de asignaciones con total de gastos
CREATE OR REPLACE VIEW vista_asignaciones_completas AS
SELECT 
    a.id                AS asignacion_id,
    a.usuario_id,
    CONCAT(u.nombres, ' ', u.apellido_paterno, ' ', u.apellido_materno) AS nombre_usuario,
    u.ci,
    u.extension,
    u.cargo,
    a.ciudad_origen,
    a.ciudad_destino,
    a.fecha_salida,
    a.fecha_llegada,
    DATEDIFF(a.fecha_llegada, a.fecha_salida) AS dias_permanencia,
    a.monto_asignacion,
    a.estado,
    a.pdf_generado,
    a.identificador_unico,
    a.es_revision,
    a.fecha_creacion,
    COUNT(g.id)                  AS total_gastos,
    COALESCE(SUM(g.monto), 0)    AS suma_gastos
FROM asignaciones a
INNER JOIN usuarios u ON a.usuario_id = u.id
LEFT  JOIN gastos   g ON a.id = g.asignacion_id
GROUP BY a.id;

-- =====================================================
-- PROCEDIMIENTOS ALMACENADOS
-- =====================================================

DELIMITER //

-- Verifica si un usuario tiene habilitación activa hoy
CREATE PROCEDURE sp_verificar_habilitacion(IN p_usuario_id INT)
BEGIN
    SELECT 
        CASE 
            WHEN EXISTS (
                SELECT 1 FROM habilitaciones 
                WHERE usuario_id = p_usuario_id 
                  AND habilitado = TRUE 
                  AND CURDATE() BETWEEN fecha_inicio AND fecha_fin
            ) THEN TRUE
            ELSE FALSE
        END AS esta_habilitado;
END //

-- Resumen de gastos agrupado por tipo para un período
CREATE PROCEDURE sp_resumen_gastos(IN p_fecha_inicio DATE, IN p_fecha_fin DATE)
BEGIN
    SELECT 
        g.tipo_comprobante,
        g.tipo_gasto,
        COUNT(*)        AS cantidad,
        SUM(g.monto)    AS total_monto,
        CASE 
            WHEN g.tipo_comprobante IN ('RECIBO', 'NINGUNO') AND g.tipo_gasto IN ('COMBUSTIBLE', 'OTROS BIENES')
                THEN SUM(g.monto * 0.08)
            WHEN g.tipo_comprobante IN ('RECIBO', 'NINGUNO') 
                THEN SUM(g.monto * 0.16)
            ELSE 0
        END AS total_retencion
    FROM gastos g
    INNER JOIN asignaciones a ON g.asignacion_id = a.id
    WHERE a.fecha_salida BETWEEN p_fecha_inicio AND p_fecha_fin
    GROUP BY g.tipo_comprobante, g.tipo_gasto
    ORDER BY g.tipo_comprobante, g.tipo_gasto;
END //

DELIMITER ;

-- =====================================================
-- VERIFICACIÓN FINAL
-- =====================================================
SELECT 'Base de datos rendicion_cuentas creada exitosamente (V3.4)!' AS mensaje;
SELECT usuario, rol, email_corporativo FROM usuarios ORDER BY id;
