const express = require('express');
const { Pool } = require('pg');
const redis = require('redis');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Database Connection
const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
});

console.log('Database pool created');
console.log('Connecting to:', process.env.DB_HOST);

// Redis Connection - FIXED for redis v4
const redisClient = redis.createClient({
  socket: {
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT),
  }
});

redisClient.on('error', (err) => console.log('Redis error:', err));
redisClient.on('connect', () => console.log('Redis connected!'));

(async () => {
  await redisClient.connect();
})();

// JWT Verification Middleware
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// ==================== AUTH ENDPOINTS ====================

app.post('/api/auth/signup', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const result = await pool.query(
      'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username, email',
      [username, email, hashedPassword]
    );
    
    res.json({ user: result.rows[0] });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);
    
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const token = jwt.sign(
      { userId: user.id, username: user.username },
      process.env.JWT_SECRET
    );
    
    res.json({ token, user: { id: user.id, username: user.username, email: user.email } });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ==================== USER ENDPOINTS ====================

app.get('/api/users/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, email, bio, profile_pic, created_at FROM users WHERE id = $1',
      [req.params.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/users/:id', verifyToken, async (req, res) => {
  try {
    if (req.user.userId !== parseInt(req.params.id)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    const { bio, profile_pic } = req.body;
    
    const result = await pool.query(
      'UPDATE users SET bio = $1, profile_pic = $2 WHERE id = $3 RETURNING id, username, bio, profile_pic',
      [bio, profile_pic, req.params.id]
    );
    
    res.json(result.rows[0]);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/users/search', async (req, res) => {
  try {
    const { q } = req.query;
    
    const result = await pool.query(
      'SELECT id, username, bio, profile_pic FROM users WHERE username ILIKE $1 LIMIT 20',
      [`%${q}%`]
    );
    
    res.json(result.rows);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ==================== POST ENDPOINTS ====================

app.get('/api/posts/feed', verifyToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const result = await pool.query(
      `SELECT p.id, p.title, p.content, p.created_at, u.id as user_id, u.username,
              (SELECT COUNT(*) FROM likes WHERE post_id = p.id) as like_count,
              (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comment_count
       FROM posts p
       JOIN users u ON p.user_id = u.id
       WHERE p.user_id IN (SELECT following_id FROM follows WHERE follower_id = $1)
       ORDER BY p.created_at DESC
       LIMIT 50`,
      [userId]
    );
    
    res.json(result.rows);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/posts/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.id, p.title, p.content, p.created_at, u.id as user_id, u.username,
              (SELECT COUNT(*) FROM likes WHERE post_id = p.id) as like_count
       FROM posts p
       JOIN users u ON p.user_id = u.id
       WHERE p.id = $1`,
      [req.params.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/posts', verifyToken, async (req, res) => {
  try {
    const { title, content } = req.body;
    const userId = req.user.userId;
    
    const result = await pool.query(
      'INSERT INTO posts (user_id, title, content) VALUES ($1, $2, $3) RETURNING id, title, content, created_at',
      [userId, title, content]
    );
    
    res.json(result.rows[0]);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/posts/:id', verifyToken, async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = req.user.userId;
    
    const post = await pool.query('SELECT user_id FROM posts WHERE id = $1', [postId]);
    if (post.rows[0].user_id !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    await pool.query('DELETE FROM posts WHERE id = $1', [postId]);
    
    res.json({ message: 'Post deleted' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ==================== LIKE ENDPOINTS ====================

app.post('/api/posts/:id/like', verifyToken, async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = req.user.userId;
    
    await pool.query(
      'INSERT INTO likes (user_id, post_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [userId, postId]
    );
    
    res.json({ message: 'Liked' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/posts/:id/like', verifyToken, async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = req.user.userId;
    
    await pool.query(
      'DELETE FROM likes WHERE user_id = $1 AND post_id = $2',
      [userId, postId]
    );
    
    res.json({ message: 'Unliked' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ==================== COMMENT ENDPOINTS ====================

app.post('/api/posts/:id/comments', verifyToken, async (req, res) => {
  try {
    const { content } = req.body;
    const postId = req.params.id;
    const userId = req.user.userId;
    
    const result = await pool.query(
      'INSERT INTO comments (user_id, post_id, content) VALUES ($1, $2, $3) RETURNING id, content, created_at',
      [userId, postId, content]
    );
    
    res.json(result.rows[0]);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/posts/:id/comments', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.id, c.content, c.created_at, u.id as user_id, u.username
       FROM comments c
       JOIN users u ON c.user_id = u.id
       WHERE c.post_id = $1
       ORDER BY c.created_at DESC`,
      [req.params.id]
    );
    
    res.json(result.rows);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ==================== FOLLOW ENDPOINTS ====================

app.post('/api/users/:id/follow', verifyToken, async (req, res) => {
  try {
    const followingId = parseInt(req.params.id);
    const followerId = req.user.userId;
    
    if (followingId === followerId) {
      return res.status(400).json({ error: 'Cannot follow yourself' });
    }
    
    await pool.query(
      'INSERT INTO follows (follower_id, following_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [followerId, followingId]
    );
    
    res.json({ message: 'Followed' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/users/:id/follow', verifyToken, async (req, res) => {
  try {
    const followingId = parseInt(req.params.id);
    const followerId = req.user.userId;
    
    await pool.query(
      'DELETE FROM follows WHERE follower_id = $1 AND following_id = $2',
      [followerId, followingId]
    );
    
    res.json({ message: 'Unfollowed' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/users/:id/followers', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.username, u.bio, u.profile_pic
       FROM users u
       JOIN follows f ON u.id = f.follower_id
       WHERE f.following_id = $1`,
      [req.params.id]
    );
    
    res.json(result.rows);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/users/:id/following', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.username, u.bio, u.profile_pic
       FROM users u
       JOIN follows f ON u.id = f.following_id
       WHERE f.follower_id = $1`,
      [req.params.id]
    );
    
    res.json(result.rows);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ==================== HEALTH CHECK ====================

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// ==================== START SERVER ====================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Social Media API running on port ${PORT}`);
  console.log(`📊 Database: ${process.env.DB_HOST}`);
  console.log(`⚡ Redis: ${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`);
});
