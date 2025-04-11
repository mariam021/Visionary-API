import db from '../../../lib/db';
import { apiResponse, validateRequest } from '../../../lib/utils';
import { body, query } from 'express-validator';

export default async function handler(req, res) {
  const { id, user_id } = req.query;

  try {
    switch (req.method) {
      // Create Contact
      case 'POST': {
        // Validate request
        const validators = [
          body('user_id').isInt().toInt(),
          body('name').trim().notEmpty(),
          body('is_emergency').optional().isBoolean().toBoolean(),
          body('relationship').optional().trim(),
          body('image').optional().trim(),
          body('phone_numbers').optional().isArray()
        ];
        
        const validation = await validateRequest(req, validators);
        if (!validation.valid) {
          const { status, body } = apiResponse(400, null, 'Validation error');
          return res.status(status).json({ ...body, errors: validation.errors });
        }
        
        const { user_id, name, is_emergency = false, relationship, image, phone_numbers = [] } = req.body;
        
        // Using transaction helper from db.js
        const result = await db.transaction(async (client) => {
          // Insert contact
          const contactResult = await client.query(
            `INSERT INTO contacts
             (user_id, name, is_emergency, relationship, image)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [user_id, name, is_emergency, relationship, image]
          );
          
          const contact = contactResult.rows[0];
          
          // Insert phone numbers if provided
          if (phone_numbers.length > 0) {
            for (const phone of phone_numbers) {
              await client.query(
                `INSERT INTO contact_phone_numbers
                 (contact_id, phone_number, phone_type, is_primary)
                 VALUES ($1, $2, $3, $4)`,
                [contact.id, phone.phone_number, phone.phone_type || 'mobile', phone.is_primary || false]
              );
            }
          }
          
          // Get full contact with phones
          const phones = await client.query(
            'SELECT * FROM contact_phone_numbers WHERE contact_id = $1',
            [contact.id]
          );
          
          return {
            ...contact,
            phone_numbers: phones.rows
          };
        });
        
        const { status, body } = apiResponse(201, result, 'Contact created successfully');
        return res.status(status).json(body);
      }
      
      // Get Contact(s)
      case 'GET': {
        if (id) {
          // Validate request
          const validators = [query('id').isInt().toInt()];
          const validation = await validateRequest(req, validators);
          
          if (!validation.valid) {
            const { status, body } = apiResponse(400, null, 'Invalid contact ID');
            return res.status(status).json({ ...body, errors: validation.errors });
          }
          
          // Get single contact
          const contact = await db.query(
            `SELECT * FROM contacts WHERE id = $1`,
            [id]
          );
          
          if (contact.rows.length === 0) {
            const { status, body } = apiResponse(404, null, 'Contact not found');
            return res.status(status).json(body);
          }
          
          const phones = await db.query(
            `SELECT * FROM contact_phone_numbers WHERE contact_id = $1`,
            [id]
          );
          
          const { status, body } = apiResponse(200, {
            ...contact.rows[0],
            phone_numbers: phones.rows
          });
          
          return res.status(status).json(body);
        } else if (user_id) {
          // Validate request
          const validators = [query('user_id').isInt().toInt()];
          const validation = await validateRequest(req, validators);
          
          if (!validation.valid) {
            const { status, body } = apiResponse(400, null, 'Invalid user ID');
            return res.status(status).json({ ...body, errors: validation.errors });
          }
          
          // Get all contacts for user
          const contacts = await db.query(
            `SELECT * FROM contacts
             WHERE user_id = $1
             ORDER BY is_emergency DESC, name ASC`,
            [user_id]
          );
          
          const contactsWithPhones = await Promise.all(
            contacts.rows.map(async contact => {
              const phones = await db.query(
                `SELECT * FROM contact_phone_numbers
                 WHERE contact_id = $1`,
                [contact.id]
              );
              return { ...contact, phone_numbers: phones.rows };
            })
          );
          
          const { status, body } = apiResponse(200, contactsWithPhones);
          return res.status(status).json(body);
        } else {
          const { status, body } = apiResponse(400, null, 'Must provide either id or user_id');
          return res.status(status).json(body);
        }
      }
      
      // Update Contact
      case 'PUT': {
        // Validate request
        const validators = [
          query('id').isInt().toInt(),
          body('name').optional().trim().notEmpty(),
          body('is_emergency').optional().isBoolean().toBoolean(),
          body('relationship').optional().trim(),
          body('image').optional().trim()
        ];
        
        const validation = await validateRequest(req, validators);
        if (!validation.valid) {
          const { status, body } = apiResponse(400, null, 'Validation error');
          return res.status(status).json({ ...body, errors: validation.errors });
        }
        
        const { name, is_emergency, relationship, image } = req.body;
        
        const result = await db.query(
          `UPDATE contacts SET
            name = COALESCE($1, name),
            is_emergency = COALESCE($2, is_emergency),
            relationship = COALESCE($3, relationship),
            image = COALESCE($4, image),
            updated_at = NOW()
           WHERE id = $5
           RETURNING *`,
          [name, is_emergency, relationship, image, id]
        );
        
        if (result.rows.length === 0) {
          const { status, body } = apiResponse(404, null, 'Contact not found');
          return res.status(status).json(body);
        }
        
        const { status, body } = apiResponse(200, result.rows[0], 'Contact updated successfully');
        return res.status(status).json(body);
      }
      
      // Delete Contact
      case 'DELETE': {
        // Validate request
        const validators = [query('id').isInt().toInt()];
        const validation = await validateRequest(req, validators);
        
        if (!validation.valid) {
          const { status, body } = apiResponse(400, null, 'Invalid contact ID');
          return res.status(status).json({ ...body, errors: validation.errors });
        }
        
        // Using transaction helper
        await db.transaction(async (client) => {
          // Delete phone numbers first
          await client.query(
            `DELETE FROM contact_phone_numbers
             WHERE contact_id = $1`,
            [id]
          );
          
          // Then delete contact
          const result = await client.query(
            `DELETE FROM contacts
             WHERE id = $1
             RETURNING id`,
            [id]
          );
          
          if (result.rows.length === 0) {
            throw new Error('Contact not found');
          }
        }).catch(error => {
          if (error.message === 'Contact not found') {
            const { status, body } = apiResponse(404, null, 'Contact not found');
            return res.status(status).json(body);
          }
          throw error;
        });
        
        const { status, body } = apiResponse(204, null, 'Contact deleted successfully');
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