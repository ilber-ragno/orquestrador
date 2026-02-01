import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../utils/logger.js';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorHandler(err: Error & { status?: number; statusCode?: number; type?: string; expose?: boolean; code?: string; meta?: any }, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    logger.warn({ err: { code: err.code, message: err.message }, correlationId: req.correlationId }, err.message);
    return res.status(err.statusCode).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
  }

  // Zod validation errors
  if (err instanceof ZodError) {
    logger.warn({ correlationId: req.correlationId, issues: err.issues }, 'Validation error');
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Dados inválidos', details: err.issues },
    });
  }

  // Prisma errors
  if (err.constructor?.name === 'PrismaClientKnownRequestError') {
    const prismaErr = err as any;
    if (prismaErr.code === 'P2002') {
      const fields = prismaErr.meta?.target?.join?.(', ') || 'campo';
      logger.warn({ correlationId: req.correlationId }, `Unique constraint violation: ${fields}`);
      return res.status(409).json({
        error: { code: 'CONFLICT', message: `Registro já existe (${fields})` },
      });
    }
    if (prismaErr.code === 'P2025') {
      logger.warn({ correlationId: req.correlationId }, 'Record not found');
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Registro não encontrado' },
      });
    }
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    logger.warn({ correlationId: req.correlationId }, `JWT error: ${err.message}`);
    return res.status(401).json({
      error: { code: 'AUTH_ERROR', message: 'Token inválido ou expirado' },
    });
  }

  // Handle body-parser SyntaxError (malformed JSON)
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    logger.warn({ correlationId: req.correlationId }, 'Invalid JSON in request body');
    return res.status(400).json({
      error: { code: 'INVALID_JSON', message: 'JSON malformado no corpo da requisição' },
    });
  }

  logger.error({ err, correlationId: req.correlationId }, 'Unhandled error');
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
  });
}
