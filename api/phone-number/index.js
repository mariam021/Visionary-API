import db from '../../lib/db.js';
import { asyncHandler, apiResponse, validateRequest } from '../../lib/utils.js';
import { body, param, query } from 'express-validator';

export default asyncHandler(async (req, res) => {
  const { id, contact_id } = req.query;

  switch (req.method) {
    // Create Phone Number
    case 'POST':
      await validateRequest([
        body('contact_id').isInt().toInt(),
        body('phone_number').trim().notEmpty(),
        body('phone_type').optional().isIn(['mobile', 'home', 'work']).default('mobile'),
        body('is_primary').optional().isBoolean().default(false)
      ])(req, res, async () => {
        const { contact_id, phone_number, phone_type = 'mobile', is_primary = false } = req.body;

        // Start transaction
        await db.query('BEGIN');

        try {
          // If setting as primary, first unset any existing primary
          if (is_primary) {
            await db.query(
              `UPDATE contact_phone_numbers
               SET is_primary = false
               WHERE contact_id = $1`,
              [contact_id]
            );
          }

          // Insert new phone number
          const result = await db.query(
            `INSERT INTO contact_phone_numbers
             (contact_id, phone_number, phone_type, is_primary)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [contact_id, phone_number, phone_type, is_primary]
          );

          await db.query('COMMIT');
          apiResponse(res, 201, result.rows[0], 'Phone number added successfully');
        } catch (error) {
          await db.query('ROLLBACK');
          throw error;
        }
      });
      break;

    // Get Phone Number(s)
    case 'GET':
      if (id) {
        // Single phone number
        await validateRequest([
          query('id').isInt().toInt()
        ])(req, res, async () => {
          const result = await db.query(
            `SELECT * FROM contact_phone_numbers WHERE id = $1`,
            [id]
          );

          if (result.rows.length === 0) {
            return apiResponse(res, 404, null, 'Phone number not found');
          }

          apiResponse(res, 200, result.rows[0]);
        });
      } else if (contact_id) {
        // All phone numbers for contact
        await validateRequest([
          query('contact_id').isInt().toInt()
        ])(req, res, async () => {
          const result = await db.query(
            `SELECT * FROM contact_phone_numbers
             WHERE contact_id = $1
             ORDER BY is_primary DESC, phone_type ASC`,
            [contact_id]
          );

          apiResponse(res, 200, result.rows);
        });
      } else {
        apiResponse(res, 400, null, 'Must provide either id or contact_id');
      }
      break;

    // Update Phone Number
    case 'PUT':
      await validateRequest([
        body('id').isInt().toInt(),
        body('phone_number').optional().trim().notEmpty(),
        body('phone_type').optional().isIn(['mobile', 'home', 'work']),
        body('is_primary').optional().isBoolean()
      ])(req, res, async () => {
        const { id } = req.query;
        const { phone_number, phone_type, is_primary } = req.body;

        // Start transaction
        await db.query('BEGIN');

        try {
          // If setting as primary, first unset any existing primary
          if (is_primary === true) {
            const current = await db.query(
              `SELECT contact_id FROM contact_phone_numbers WHERE id = $1`,
              [id]
            );

            if (current.rows.length > 0) {
              await db.query(
                `UPDATE contact_phone_numbers
                 SET is_primary = false
                 WHERE contact_id = $1 AND id != $2`,
                [current.rows[0].contact_id, id]
              );
            }
          }

          // Update phone number
          const result = await db.query(
            `UPDATE contact_phone_numbers SET
              phone_number = COALESCE($1, phone_number),
              phone_type = COALESCE($2, phone_type),
              is_primary = COALESCE($3, is_primary)
             WHERE id = $4
             RETURNING *`,
            [phone_number, phone_type, is_primary, id]
          );

          if (result.rows.length === 0) {
            await db.query('ROLLBACK');
            return apiResponse(res, 404, null, 'Phone number not found');
          }

          await db.query('COMMIT');
          apiResponse(res, 200, result.rows[0], 'Phone number updated successfully');
        } catch (error) {
          await db.query('ROLLBACK');
          throw error;
        }
      });
      break;

    // Delete Phone Number
    case 'DELETE':
      await validateRequest([
        query('id').isInt().toInt()
      ])(req, res, async () => {
        const result = await db.query(
          `DELETE FROM contact_phone_numbers
           WHERE id = $1
           RETURNING id`,
          [id]
        );

        if (result.rows.length === 0) {
          return apiResponse(res, 404, null, 'Phone number not found');
        }

        apiResponse(res, 204, null, 'Phone number deleted successfully');
      });
      break;

    default:
      res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
      apiResponse(res, 405, null, `Method ${req.method} Not Allowed`);
  }
});