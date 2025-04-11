import db from '../../../lib/db';
import { apiResponse, validateRequest, generateToken } from '../../../lib/utils';
import { body } from 'express-validator';
import bcrypt from 'bcryptjs';

export default async function handler(req, res) {
  // Only allow POST method for login
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    const { status, body } = apiResponse(405, null, `Method ${req.method} Not Allowed`);
    return res.status(status).json(body);
  }

  try {
    // Validate request
    const validators = [
      body('name').trim().notEmpty().withMessage('Username is required'),
      body('password').notEmpty().withMessage('Password is required')
    ];
    
    const validation = await validateRequest(req, validators);
    if (!validation.valid) {
      const { status, body } = apiResponse(400, null, 'Validation error');
      return res.status(status).json({ ...body, errors: validation.errors });
    }

    const { name, password } = req.body;

    // 1. Find user by username
    const userResult = await db.query(
      'SELECT * FROM users WHERE name = $1',
      [name]
    );

    if (userResult.rows.length === 0) {
      // Don't reveal whether user exists for security
      const { status, body } = apiResponse(401, null, 'Invalid credentials');
      return res.status(status).json(body);
    }

    const user = userResult.rows[0];

    // 2. Compare passwords
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      const { status, body } = apiResponse(401, null, 'Invalid credentials');
      return res.status(status).json(body);
    }

    // 3. Generate JWT token
    const token = generateToken({ 
      userId: user.id,
      // Add any additional claims you need
      role: user.role // Example, if you have roles
    });

    // 4. Prepare user data to return (exclude sensitive fields)
    const userData = {
      id: user.id,
      name: user.name,
      age: user.age,
      phone_number: user.phone_number,
      image: user.image,
      // Include any other non-sensitive fields
      is_verified: user.is_verified // Example field
    };

    // 5. Set HTTP-only cookie for enhanced security (optional)
    res.setHeader('Set-Cookie', [
      `token=${token}; HttpOnly; Path=/; Max-Age=${60 * 60 * 24 * 7}; SameSite=Strict${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`
    ]);

    // 6. Return success response
    const { status, body } = apiResponse(200, {
      user: userData,
      token // Also return token in body for clients that need it
    }, 'Login successful');

    return res.status(status).json(body);

  } catch (error) {
    console.error('Login error:', error);
    const { status, body } = apiResponse(500, null, 'Internal server error');
    return res.status(status).json(body);
  }
}