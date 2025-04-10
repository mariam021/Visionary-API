import { validationResult } from 'express-validator';
import jwt from 'jsonwebtoken';

// Validates request using express-validator rules
export const validateRequest = (validations) => {
  return async (req, res, next) => {
    for (const validation of validations) {
      const result = await validation.run(req);
      if (result.errors.length) break;
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return apiResponse(res, 400, null, 'Validation error', errors.array());
    }

    if (typeof next === 'function') {
      next();
    } else {
      return next();
    }
  };
};

// Standard API response formatter
export const apiResponse = (res, status, data, message = '', errors = null) => {
  const response = { success: status >= 200 && status < 300 };
  if (message) response.message = message;
  if (data) response.data = data;
  if (errors) response.errors = errors;

  return res.status(status).json(response);
};

// Error handler middleware
export const errorHandler = (err, req, res, next) => {
  console.error('API Error:', err);

  const status = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  apiResponse(res, status, null, message);
};

// Sanitize phone number format
export const sanitizePhoneNumber = (phone) => {
  if (!phone) return null;
  return phone.replace(/[^\d+]/g, '');
};

// Pagination helper
export const paginateResults = (results, page = 1, limit = 10) => {
  const startIndex = (page - 1) * limit;
  const endIndex = page * limit;

  const paginated = results.slice(startIndex, endIndex);

  return {
    data: paginated,
    currentPage: page,
    totalPages: Math.ceil(results.length / limit),
    totalItems: results.length
  };
};

// JWT token generator
export const generateToken = (payload, expiresIn = '1h') => {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });
};

// Async middleware wrapper
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next || ((err) => {
    console.error('Unhandled error in async handler:', err);
    apiResponse(res, 500, null, 'Internal Server Error');
  }));
};