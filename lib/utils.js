import { validationResult } from 'express-validator';
import jwt from 'jsonwebtoken';

/**
 * Format consistent API responses
 */
export function apiResponse(status, data = null, message = '') {
  const success = status >= 200 && status < 300;
  
  const response = { success };
  
  if (message) response.message = message;
  if (data) response.data = data;
  
  return { status, body: response };
}

/**
 * Validate request using express-validator
 */
export async function validateRequest(req, validators) {
  // Run all validators
  await Promise.all(validators.map(validator => validator.run(req)));
  
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return {
      valid: false,
      errors: errors.array()
    };
  }
  
  return { valid: true };
}

/**
 * JWT token generator
 */
export function generateToken(payload, expiresIn = '1h') {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });
}

/**
 * Format a phone number
 */
export function sanitizePhoneNumber(phone) {
  if (!phone) return null;
  return phone.replace(/[^\d+]/g, '');
}

/**
 * Paginate results
 */
export function paginateResults(results, page = 1, limit = 10) {
  const startIndex = (page - 1) * limit;
  const endIndex = page * limit;
  
  const paginated = results.slice(startIndex, endIndex);
  
  return {
    data: paginated,
    currentPage: page,
    totalPages: Math.ceil(results.length / limit),
    totalItems: results.length
  };
}