import db from '../../lib/db';

export default async function handler(req, res) {
  switch (req.method) {
    case 'POST': // Create phone number
      try {
        const { contact_id, phone_number, phone_type, is_primary } = req.body;
        const result = await db.query(
          `INSERT INTO contact_phone_numbers
           (contact_id, phone_number, phone_type, is_primary)
           VALUES ($1, $2, $3, $4) RETURNING *`,
          [contact_id, phone_number, phone_type, is_primary]
        );
        res.status(201).json(result.rows[0]);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
      break;

    case 'GET': // Get phone numbers for contact
      try {
        const { contact_id } = req.query;
        const result = await db.query(
          'SELECT * FROM contact_phone_numbers WHERE contact_id = $1',
          [contact_id]
        );
        res.status(200).json(result.rows);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
      break;

    default:
      res.setHeader('Allow', ['GET', 'POST']);
      res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}