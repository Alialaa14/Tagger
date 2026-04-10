import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import mongoSanitize from 'express-mongo-sanitize';
import hpp from 'hpp';
import compression from 'compression';
import { ENV } from '../utils/ENV.js';

// const mongoSanitizeCompatible = (options = {}) => (req, res, next) => {
//   ['body', 'params', 'headers'].forEach((key) => {
//     if (req[key]) {
//       req[key] = mongoSanitize.sanitize(req[key], options);
//     }
//   });

//   if (req.query) {
//     mongoSanitize.sanitize(req.query, options);
//   }

//   next();
// };

// Rate limiting
export const limiter = rateLimit({
  windowMs: (ENV.RATE_LIMIT_WINDOW || 15) * 60 * 1000, // 15 minutes
  max: ENV.RATE_LIMIT_MAX_REQUESTS || 100, // limit each IP to 100 requests per windowMs
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// More strict rate limiting for auth routes
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs for auth routes
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Security middleware configuration
export const securityMiddleware = [
  // Set security headers
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https:", "http:"],
        scriptSrc: ["'self'"],
        connectSrc: ["'self'", "ws:", "wss:"],
      },
    },
  }),

  // Rate limiting
  limiter,

  // Data sanitization against NoSQL query injection
//   mongoSanitizeCompatible(),

  // Prevent parameter pollution
  hpp(),

  // Compress responses
  compression(),
];