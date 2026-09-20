-- Create users table
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  bio TEXT,
  profile_pic VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create posts table
CREATE TABLE posts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create likes table
CREATE TABLE likes (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, post_id)
);

-- Create comments table
CREATE TABLE comments (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create follows table
CREATE TABLE follows (
  id SERIAL PRIMARY KEY,
  follower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  following_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(follower_id, following_id)
);

-- Create indexes for faster queries
CREATE INDEX idx_posts_user_id ON posts(user_id);
CREATE INDEX idx_likes_user_id ON likes(user_id);
CREATE INDEX idx_likes_post_id ON likes(post_id);
CREATE INDEX idx_comments_user_id ON comments(user_id);
CREATE INDEX idx_comments_post_id ON comments(post_id);
CREATE INDEX idx_follows_follower ON follows(follower_id);
CREATE INDEX idx_follows_following ON follows(following_id);

-- Insert sample users
INSERT INTO users (username, email, password_hash, bio) VALUES
('alice', 'alice@example.com', '$2a$10$hash1', 'Love coding and coffee ☕'),
('bob', 'bob@example.com', '$2a$10$hash2', 'Tech enthusiast 🚀'),
('charlie', 'charlie@example.com', '$2a$10$hash3', 'Designer and creator 🎨');

-- Insert sample posts
INSERT INTO posts (user_id, title, content) VALUES
(1, 'My First Social Media Post', 'I just launched this social media app on Kubernetes!'),
(2, 'Kubernetes is Amazing', 'Learning containers and orchestration is so cool'),
(1, 'JavaScript Tips', 'Arrow functions make code cleaner and more readable');

-- Insert sample likes
INSERT INTO likes (user_id, post_id) VALUES
(2, 1),
(3, 1),
(1, 2);

-- Insert sample comments
INSERT INTO comments (user_id, post_id, content) VALUES
(2, 1, 'Awesome work! 🎉'),
(3, 2, 'I agree, Kubernetes is powerful!'),
(1, 2, 'Great post!');

-- Insert sample follows
INSERT INTO follows (follower_id, following_id) VALUES
(1, 2),
(2, 3),
(3, 1);
