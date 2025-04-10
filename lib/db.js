import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

export default {
  async query(text, params) {
    try {
      const res = await pool.query(text, params);
      return res;
    } catch (err) {
      console.error('Database error:', err);
      throw err;
    }
  }
};