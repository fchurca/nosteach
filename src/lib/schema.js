import { SATS_MAX } from './constants.js';

export function validateCurso(data) {
  const errors = [];

  if (!data.titulo || typeof data.titulo !== 'string') {
    errors.push('Título es requerido');
  } else if (data.titulo.length > 100) {
    errors.push('Título debe tener máximo 100 caracteres');
  }

  if (!data.descripcion || typeof data.descripcion !== 'string') {
    errors.push('Descripción es requerida');
  } else if (data.descripcion.length > 500) {
    errors.push('Descripción debe tener máximo 500 caracteres');
  }

  if (typeof data.precio !== 'number' || data.precio < 0) {
    errors.push('Precio debe ser un número >= 0');
  } else if (data.precio > SATS_MAX) {
    errors.push('y cómo vas a pagar eso?');
  }

  if (!Array.isArray(data.modulos)) {
    errors.push('Módulos debe ser un array');
  } else {
    data.modulos.forEach((modulo, i) => {
      if (modulo.tipo === 'texto' && !modulo.contenido) {
        errors.push(`Módulo ${i + 1}: contenido es requerido para tipo texto`);
      }
      if (modulo.tipo === 'enlace' && !modulo.url) {
        errors.push(`Módulo ${i + 1}: URL es requerida para tipo enlace`);
      }
    });
  }

  if (!data.evaluacion || !Array.isArray(data.evaluacion.preguntas)) {
    errors.push('Evaluación con preguntas es requerida');
  } else {
    data.evaluacion.preguntas.forEach((preg, i) => {
      if (!preg.pregunta) {
        errors.push(`Pregunta ${i + 1}: texto es requerido`);
      }
      if (!Array.isArray(preg.opciones) || preg.opciones.length < 2) {
        errors.push(`Pregunta ${i + 1}: al menos 2 opciones son requeridas`);
      }
      if (typeof preg.correcta !== 'number') {
        errors.push(`Pregunta ${i + 1}: respuesta correcta es requerida`);
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export function validateEvaluacion(data) {
  const errors = [];

  if (!Array.isArray(data.respuestas)) {
    errors.push('Respuestas debe ser un array');
  }

  if (typeof data.timestamp !== 'number') {
    errors.push('Timestamp es requerido');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export function validatePrecioCustom(value) {
  if (value === null || value === undefined) {
    return { valid: true };
  }

  const num = Number(value);
  
  if (isNaN(num)) {
    return { valid: false, error: 'Debe ser un número' };
  }
  
  if (num < 0) {
    return { valid: false, error: 'No puede ser negativo' };
  }
  
  if (num > SATS_MAX) {
    return { valid: false, error: 'y cómo vas a pagar eso?' };
  }

  return { valid: true };
}
