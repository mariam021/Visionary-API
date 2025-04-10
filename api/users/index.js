import db from '../../lib/db';
import { asyncHandler, apiResponse, validateRequest } from '../../lib/utils';
import { body, param } from 'express-validator';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

export default asyncHandler(async (req, res) => {
  const { id } = req.query;

  switch (req.method) {
    // Register User
    case 'POST':
      await validateRequest([
        body('name').trim().notEmpty(),
        body('password').isLength({ min: 6 }),
        body('age').optional().isInt({ min: 1 }),
        body('mac').optional().isMACAddress(),
        body('phone_number').optional().isMobilePhone(),
        body('image').optional().isURL()
      ])(req, res, async () => {
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
        const token = jwt.sign(
          { userId: result.rows[0].id },
          process.env.JWT_SECRET,
          { expiresIn: '1h' }
        );

        apiResponse(res, 201, {
          user: result.rows[0],
          token
        }, 'User registered successfully');
      });
      break;

    // Get User
    case 'GET':
      await validateRequest([
        param('id').isInt().toInt()
      ])(req, res, async () => {
        const result = await db.query(
          `SELECT id, name, age, mac, phone_number, image
           FROM users WHERE id = $1`,
          [id]
        );

        if (result.rows.length === 0) {
          return apiResponse(res, 404, null, 'User not found');
        }

        apiResponse(res, 200, result.rows[0]);
      });
      break;

    // Update User
    case 'PUT':
      await validateRequest([
        param('id').isInt().toInt(),
        body('name').optional().trim().notEmpty(),
        body('password').optional().isLength({ min: 6 }),
        body('age').optional().isInt({ min: 1 }),
        body('mac').optional().isMACAddress(),
        body('phone_number').optional().isMobilePhone(),
        body('image').optional().isURL()
      ])(req, res, async () => {
        const { name, password, age, mac, phone_number, image } = req.body;
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

        // Add other fields similarly...

        if (updates.length === 0) {
          return apiResponse(res, 400, null, 'No valid fields to update');
        }

        values.push(id);
        const query = `
          UPDATE users SET
            ${updates.join(', ')},
            updated_at = NOW()
          WHERE id = $${counter}
          RETURNING id, name, age, mac, phone_number, image
        `;

        const result = await db.query(query, values);

        if (result.rows.length === 0) {
          return apiResponse(res, 404, null, 'User not found');
        }

        apiResponse(res, 200, result.rows[0], 'User updated successfully');
      });
      break;

    // Delete User
    case 'DELETE':
      await validateRequest([
        param('id').isInt().toInt()
      ])(req, res, async () => {
        // First delete related contacts and phone numbers
        await db.query('DELETE FROM contacts WHERE user_id = $1', [id]);

        // Then delete the user
        const result = await db.query(
          'DELETE FROM users WHERE id = $1 RETURNING id',
          [id]
        );

        if (result.rows.length === 0) {
          return apiResponse(res, 404, null, 'User not found');
        }

        apiResponse(res, 204, null, 'User deleted successfully');
      });
      break;

    default:
      res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
      apiResponse(res, 405, null, `Method ${req.method} Not Allowed`);
  }
});