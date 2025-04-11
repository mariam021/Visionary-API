import db from '../../../lib/db';
import { apiResponse, validateRequest } from '../../../lib/utils';
import { body, query } from 'express-validator';

export default async function handler(req, res) {
  const { id, contact_id } = req.query;

  try {
    switch (req.method) {
      // Create Phone Number
      case 'POST': {
        // Validate request
        const validators = [
          body('contact_id').isInt().toInt(),
          body('phone_number').trim().notEmpty(),
          body('phone_type').optional().isIn(['mobile', 'home', 'work']),
          body('is_primary').optional().isBoolean().toBoolean()
        ];
        
        const validation = await validateRequest(req, validators);
        if (!validation.valid) {
          const { status, body } = apiResponse(400, null, 'Validation error');
          return res.status(status).json({ ...body, errors: validation.errors });
        }
        
        const { contact_id, phone_number, phone_type = 'mobile', is_primary = false } = req.body;
        
        // Using transaction helper
        const result = await db.transaction(async (client) => {
          // If setting as primary, first unset any existing primary
          if (is_primary) {
            await client.query(
              `UPDATE contact_phone_numbers
               SET is_primary = false
               WHERE contact_id = $1`,
              [contact_id]
            );
          }
          
          // Insert new phone number
          const result = await client.query(
            `INSERT INTO contact_phone_numbers
             (contact_id, phone_number, phone_type, is_primary)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [contact_id, phone_number, phone_type, is_primary]
          );
          
          return result.rows[0];
        });
        
        const { status, body } = apiResponse(201, result, 'Phone number added successfully');
        return res.status(status).json(body);
      }
      
      // Get Phone Number(s)
      case 'GET': {
        if (id) {
          // Validate request
          const validators = [query('id').isInt().toInt()];
          const validation = await validateRequest(req, validators);
          
          if (!validation.valid) {
            const { status, body } = apiResponse(400, null, 'Invalid phone number ID');
            return res.status(status).json({ ...body, errors: validation.errors });
          }
          
          // Get single phone number
          const result = await db.query(
            `SELECT * FROM contact_phone_numbers WHERE id = $1`,
            [id]
          );
          
          if (result.rows.length === 0) {
            const { status, body } = apiResponse(404, null, 'Phone number not found');
            return res.status(status).json(body);
          }
          
          const { status, body } = apiResponse(200, result.rows[0]);
          return res.status(status).json(body);
        } else if (contact_id) {
          // Validate request
          const validators = [query('contact_id').isInt().toInt()];
          const validation = await validateRequest(req, validators);
          
          if (!validation.valid) {
            const { status, body } = apiResponse(400, null, 'Invalid contact ID');
            return res.status(status).json({ ...body, errors: validation.errors });
          }
          
          // Get all phone numbers for contact
          const result = await db.query(
            `SELECT * FROM contact_phone_numbers
             WHERE contact_id = $1
             ORDER BY is_primary DESC, phone_type ASC`,
            [contact_id]
          );
          
          const { status, body } = apiResponse(200, result.rows);
          return res.status(status).json(body);
        } else {
          const { status, body } = apiResponse(400, null, 'Must provide either id or contact_id');
          return res.status(status).json(body);
        }
      }
      
      // Update Phone Number
      case 'PUT': {
        // Validate request
        const validators = [
          query('id').isInt().toInt(),
          body('phone_number').optional().trim().notEmpty(),
          body('phone_type').optional().isIn(['mobile', 'home', 'work']),
          body('is_primary').optional().isBoolean().toBoolean()
        ];
        
        const validation = await validateRequest(req, validators);
        if (!validation.valid) {
          const { status, body } = apiResponse(400, null, 'Validation error');
          return res.status(status).json({ ...body, errors: validation.errors });
        }
        
        const { phone_number, phone_type, is_primary } = req.body;
        
        // Using transaction helper
        const result = await db.transaction(async (client) => {
          // If setting as primary, first unset any existing primary
          if (is_primary === true) {
            const current = await client.query(
              `SELECT contact_id FROM contact_phone_numbers WHERE id = $1`,
              [id]
            );
            
            if (current.rows.length > 0) {
              await client.query(
                `UPDATE contact_phone_numbers
                 SET is_primary = false
                 WHERE contact_id = $1 AND id != $2`,
                [current.rows[0].contact_id, id]
              );
            }
          }
          
          // Update phone number
          const result = await client.query(
            `UPDATE contact_phone_numbers SET
              phone_number = COALESCE($1, phone_number),
              phone_type = COALESCE($2, phone_type),
              is_primary = COALESCE($3, is_primary)
             WHERE id = $4
             RETURNING *`,
            [phone_number, phone_type, is_primary, id]
          );
          
          if (result.rows.length === 0) {
            throw new Error('Phone number not found');
          }
          
          return result.rows[0];
        }).catch(error => {
          if (error.message === 'Phone number not found') {
            const { status, body } = apiResponse(404, null, 'Phone number not found');
            return res.status(status).json(body);
          }
          throw error;
        });
        
        const { status, body } = apiResponse(200, result, 'Phone number updated successfully');
        return res.status(status).json(body);
      }
      
      // Delete Phone Number
      case 'DELETE': {
        // Validate request
        const validators = [query('id').isInt().toInt()];
        const validation = await validateRequest(req, validators);
        
        if (!validation.valid) {
          const { status, body } = apiResponse(400, null, 'Invalid phone number ID');
          return res.status(status).json({ ...body, errors: validation.errors });
        }
        
        const result = await db.query(
          `DELETE FROM contact_phone_numbers
           WHERE id = $1
           RETURNING id`,
          [id]
        );
        
        if (result.rows.length === 0) {
          const { status, body } = apiResponse(404, null, 'Phone number not found');
          return res.status(status).json(body);
        }
        
        const { status, body } = apiResponse(204, null, 'Phone number deleted successfully');
        return res.status(status).json(body);
      }
      
      default:
        res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
        const { status, body } = apiResponse(405, null, `Method ${req.method} Not Allowed`);
        return res.status(status).json(body);
    }
  } catch (error) {
    console.error('API Error:', error);
    const { status, body } = apiResponse(500, null, 'Internal server error');
    return res.status(status).json(body);
  }
}