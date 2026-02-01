import rateLimit from 'express-rate-limit';

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: { code: 'RATE_LIMIT', message: 'Too many login attempts, try again later' } },
  standardHeaders: true,
  legacyHeaders: false,
});

export const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { error: { code: 'RATE_LIMIT', message: 'Too many requests' } },
  standardHeaders: true,
  legacyHeaders: false,
});

// Limiter para operações de execução no container
export const execLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: { code: 'RATE_LIMIT', message: 'Too many exec requests, try again later' } },
  standardHeaders: true,
  legacyHeaders: false,
});

// Limiter para auditoria/security
export const securityLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 2,
  message: { error: { code: 'RATE_LIMIT', message: 'Too many security audit requests' } },
  standardHeaders: true,
  legacyHeaders: false,
});
