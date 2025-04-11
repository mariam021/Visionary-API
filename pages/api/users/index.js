import db from '../../../lib/db';
import { apiResponse, validateRequest, generateToken } from '../../../lib/utils';
import { body, query } from 'express-validator';
import bcrypt from 'bcryptjs';

export default async function handler(req, res) {
  const { id } = req.query;

  try {
    switch (req.method) {
      // Register User
      case 'POST': {
        // Validate request
        const validators = [
          body('name').trim().notEmpty(),
          body('password').isLength({ min: 6 }),
          body('age').optional().isInt({ min: 1 }).toInt(),
          body('mac').optional().isMACAddress(),
          body('phone_number').optional().isMobilePhone(),
          body('image').optional().isURL()
        ];
        
        const validation = await validateRequest(req, validators);
        if (!validation.valid) {
          const { status, body } = apiResponse(400, null, 'Validation error');
          return res.status(status).json({ ...body, errors: validation.errors });
        }
        
        const { name, password, age, mac, phone_number, image } = req.body;
        
        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        
        const result = await db.query(
          `INSERT INTO users
           (name, password, age, mac, phone_number, image)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id, name, age, mac, phone_number, image`,
          [name, hashedPassword, age, mac, phone_number, image]
        );
        
        // Generate JWT
        const token = generateToken({ userId: result.rows[0].id });
        
        const { status, body } = apiResponse(201, {
          user: result.rows[0],
          token
        }, 'User registered successfully');
        
        return res.status(status).json(body);
      }
      
      // Get User
      case 'GET': {
        // Validate request
        const validators = [query('id').isInt().toInt()];
        const validation = await validateRequest(req, validators);
        
        if (!validation.valid) {
          const { status, body } = apiResponse(400, null, 'Invalid user ID');
          return res.status(status).json({ ...body, errors: validation.errors });
        }
        
        const result = await db.query(
          `SELECT id, name, age, mac, phone_number, image
           FROM users WHERE id = $1`,
          [id]
        );
        
        if (result.rows.length === 0) {
          const { status, body } = apiResponse(404, null, 'User not found');
          return res.status(status).json(body);
        }
        
        const { status, body } = apiResponse(200, result.rows[0]);
        return res.status(status).json(body);
      }
      
      // Update User
      case 'PUT': {
        // Validate request
        const validators = [
          query('id').isInt().toInt(),
          body('name').optional().trim().notEmpty(),
          body('password').optional().isLength({ min: 6 }),
          body('age').optional().isInt({ min: 1 }).toInt(),
          body('mac').optional().isMACAddress(),
          body('phone_number').optional().isMobilePhone(),
          body('image').optional().isURL()
        ];
        
        const validation = await validateRequest(req, validators);
        if (!validation.valid) {
          const { status, body } = apiResponse(400, null, 'Validation error');
          return res.status(status).json({ ...body, errors: validation.errors });
        }
        
        const { name, password, age, mac, phone_number, image } = req.body;
        
        // Build dynamic query
        let updates = [];
        let values = [];
        let counter = 1;
        
        if (name) {
          updates.push(`name = $${counter}`);
          values.push(name);
          counter++;
        }
        
        if (password) {
          const hashedPassword = await bcrypt.hash(password, 10);
          updates.push(`password = $${counter}`);
          values.push(hashedPassword);
          counter++;
        }
        
        if (age !== undefined) {
          updates.push(`age = $${counter}`);
          values.push(age);
          counter++;
        }
        
        if (mac) {
          updates.push(`mac = $${counter}`);
          values.push(mac);
          counter++;
        }
        
        if (phone_number) {
          updates.push(`phone_number = $${counter}`);
          values.push(phone_number);
          counter++;
        }
        
        if (image) {
          updates.push(`image = $${counter}`);
          values.push(image);
          counter++;
        }
        
        if (updates.length === 0) {
          const { status, body } = apiResponse(400, null, 'No valid fields to update');
          return res.status(status).json(body);
        }
        
        updates.push(`updated_at = NOW()`);
        
        values.push(id);
        const query = `
          UPDATE users SET
            ${updates.join(', ')}
          WHERE id = $${counter}
          RETURNING id, name, age, mac, phone_number, image
        `;
        
        const result = await db.query(query, values);
        
        if (result.rows.length === 0) {
          const { status, body } = apiResponse(404, null, 'User not found');
          return res.status(status).json(body);
        }
        
        const { status, body } = apiResponse(200, result.rows[0], 'User updated successfully');
        return res.status(status).json(body);
      }
      
      // Delete User
      case 'DELETE': {
        // Validate request
        const validators = [query('id').isInt().toInt()];
        const validation = await validateRequest(req, validators);
        
        if (!validation.valid) {
          const { status, body } = apiResponse(400, null, 'Invalid user ID');
          return res.status(status).json({ ...body, errors: validation.errors });
        }
        
        // Using transaction helper
        await db.transaction(async (client) => {
          // First delete related contacts (which will cascade to phone numbers if set up properly in DB)
          await client.query('DELETE FROM contacts WHERE user_id = $1', [id]);
          
          // Then delete the user
          const result = await client.query(
            'DELETE FROM users WHERE id = $1 RETURNING id',
            [id]
          );
          
          if (result.rows.length === 0) {
            throw new Error('User not found');
          }
        }).catch(error => {
          if (error.message === 'User not found') {
            const { status, body } = apiResponse(404, null, 'User not found');
            return res.status(status).json(body);
          }
          throw error;
        });
        
        const { status, body } = apiResponse(204, null, 'User deleted successfully');
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