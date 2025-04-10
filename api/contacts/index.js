import db from '../../lib/db';
import { asyncHandler, apiResponse, validateRequest } from '../../lib/utils';
import { body, param, query } from 'express-validator';

export default asyncHandler(async (req, res) => {
  const { id, user_id } = req.query;

  switch (req.method) {
    // Create Contact
    case 'POST':
      await validateRequest([
        body('user_id').isInt().toInt(),
        body('name').trim().notEmpty(),
        body('is_emergency').optional().isBoolean(),
        body('relationship').optional().trim(),
        body('image').optional().trim(),
        body('phone_numbers').optional().isArray()
      ])(req, res, async () => {
        const { user_id, name, is_emergency = false, relationship, image, phone_numbers = [] } = req.body;

        // Start transaction
        await db.query('BEGIN');

        try {
          // Insert contact
          const contactResult = await db.query(
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
              await db.query(
                `INSERT INTO contact_phone_numbers
                 (contact_id, phone_number, phone_type, is_primary)
                 VALUES ($1, $2, $3, $4)`,
                [contact.id, phone.phone_number, phone.phone_type || 'mobile', phone.is_primary || false]
              );
            }
          }

          await db.query('COMMIT');

          // Get full contact with phones
          const phones = await db.query(
            'SELECT * FROM contact_phone_numbers WHERE contact_id = $1',
            [contact.id]
          );

          apiResponse(res, 201, {
            ...contact,
            phone_numbers: phones.rows
          }, 'Contact created successfully');
        } catch (error) {
          await db.query('ROLLBACK');
          throw error;
        }
      });
      break;

    // Get Contact(s)
    case 'GET':
      if (id) {
        // Single contact
        await validateRequest([
          query('id').isInt().toInt()
        ])(req, res, async () => {
          const contact = await db.query(
            `SELECT * FROM contacts WHERE id = $1`,
            [id]
          );

          if (contact.rows.length === 0) {
            return apiResponse(res, 404, null, 'Contact not found');
          }

          const phones = await db.query(
            `SELECT * FROM contact_phone_numbers WHERE contact_id = $1`,
            [id]
          );

          apiResponse(res, 200, {
            ...contact.rows[0],
            phone_numbers: phones.rows
          });
        });
      } else if (user_id) {
        // All contacts for user
        await validateRequest([
          query('user_id').isInt().toInt()
        ])(req, res, async () => {
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

          apiResponse(res, 200, contactsWithPhones);
        });
      } else {
        apiResponse(res, 400, null, 'Must provide either id or user_id');
      }
      break;

    // Update Contact
    case 'PUT':
      await validateRequest([
        param('id').isInt().toInt(),
        body('name').optional().trim().notEmpty(),
        body('is_emergency').optional().isBoolean(),
        body('relationship').optional().trim(),
        body('image').optional().trim()
      ])(req, res, async () => {
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
          return apiResponse(res, 404, null, 'Contact not found');
        }

        apiResponse(res, 200, result.rows[0], 'Contact updated successfully');
      });
      break;

    // Delete Contact
    case 'DELETE':
      await validateRequest([
        param('id').isInt().toInt()
      ])(req, res, async () => {
        // Start transaction
        await db.query('BEGIN');

        try {
          // Delete phone numbers first
          await db.query(
            `DELETE FROM contact_phone_numbers
             WHERE contact_id = $1`,
            [id]
          );

          // Then delete contact
          const result = await db.query(
            `DELETE FROM contacts
             WHERE id = $1
             RETURNING id`,
            [id]
          );

          if (result.rows.length === 0) {
            await db.query('ROLLBACK');
            return apiResponse(res, 404, null, 'Contact not found');
          }

          await db.query('COMMIT');
          apiResponse(res, 204, null, 'Contact deleted successfully');
        } catch (error) {
          await db.query('ROLLBACK');
          throw error;
        }
      });
      break;

    default:
      res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
      apiResponse(res, 405, null, `Method ${req.method} Not Allowed`);
  }
});