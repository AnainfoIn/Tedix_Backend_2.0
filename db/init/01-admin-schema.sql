-- Runs once, when the database volume is first created.
-- Creates the tables the admin panel needs, exactly as Rails defines them, so the app
-- can run on a fresh database. To work with real data instead, run
-- scripts/clone-rails-db.sh, which replaces everything with a copy of the Rails database.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS roles (
  id bigserial PRIMARY KEY,
  name character varying NOT NULL,
  created_at timestamp(6) without time zone NOT NULL,
  updated_at timestamp(6) without time zone NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS index_roles_on_name ON roles (name);

CREATE TABLE IF NOT EXISTS admin_users (
  id bigserial PRIMARY KEY,
  email character varying NOT NULL,
  encrypted_password character varying NOT NULL,
  reset_password_token character varying,
  reset_password_sent_at timestamp without time zone,
  remember_created_at timestamp without time zone,
  created_at timestamp(6) without time zone NOT NULL,
  updated_at timestamp(6) without time zone NOT NULL,
  role_id bigint NOT NULL,
  google_secret character varying,
  two_factor_enabled boolean DEFAULT false,
  mfa_secret character varying
);
CREATE UNIQUE INDEX IF NOT EXISTS index_admin_users_on_email ON admin_users (email);
CREATE UNIQUE INDEX IF NOT EXISTS index_admin_users_on_reset_password_token ON admin_users (reset_password_token);

-- Placeholder with the columns the admin API reads. A cloned Rails database brings the full table.
CREATE TABLE IF NOT EXISTS accounts (
  id bigserial PRIMARY KEY,
  email character varying,
  role_id integer,
  created_at timestamp(6) without time zone NOT NULL,
  updated_at timestamp(6) without time zone NOT NULL
);

INSERT INTO roles (name, created_at, updated_at)
SELECT name, now(), now() FROM (VALUES ('Admin'), ('Teacher'), ('Student')) AS r(name)
ON CONFLICT (name) DO NOTHING;
