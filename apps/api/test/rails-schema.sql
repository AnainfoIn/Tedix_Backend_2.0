-- The Rails tables the e2e tests need, as Rails creates them (db/schema.rb plus later migrations).
-- Only for a throwaway test database; never run against a shared database.
DROP TABLE IF EXISTS admin_users, accounts, roles CASCADE;

CREATE TABLE roles (
  id bigserial PRIMARY KEY,
  name character varying NOT NULL,
  created_at timestamp(6) without time zone NOT NULL,
  updated_at timestamp(6) without time zone NOT NULL
);
CREATE UNIQUE INDEX index_roles_on_name ON roles (name);

CREATE TABLE admin_users (
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
CREATE UNIQUE INDEX index_admin_users_on_email ON admin_users (email);
CREATE UNIQUE INDEX index_admin_users_on_reset_password_token ON admin_users (reset_password_token);

-- Trimmed: only the columns the admin API touches.
CREATE TABLE accounts (
  id bigserial PRIMARY KEY,
  email character varying,
  role_id integer,
  created_at timestamp(6) without time zone NOT NULL,
  updated_at timestamp(6) without time zone NOT NULL
);
