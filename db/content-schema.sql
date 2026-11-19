-- Contents tables (Country > Grade > Subject > Master > Main > Unit > Lesson) and the
-- Active Storage tables, as the Rails migrations leave them. Safe to run more than once:
-- it only creates what is missing and never changes or drops existing tables.
-- Used by the e2e tests, and to start an empty database without the Rails data.

CREATE TABLE IF NOT EXISTS account_block_countries (
  id bigserial PRIMARY KEY,
  name character varying NOT NULL,
  alpha2 character varying NOT NULL,
  alpha3 character varying NOT NULL,
  country_code character varying NOT NULL,
  created_at timestamp(6) without time zone NOT NULL,
  updated_at timestamp(6) without time zone NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS index_account_block_countries_on_name ON account_block_countries (name);
CREATE UNIQUE INDEX IF NOT EXISTS index_account_block_countries_on_alpha2 ON account_block_countries (alpha2);
CREATE UNIQUE INDEX IF NOT EXISTS index_account_block_countries_on_alpha3 ON account_block_countries (alpha3);

CREATE TABLE IF NOT EXISTS categories (
  id bigserial PRIMARY KEY,
  name character varying NOT NULL,
  created_at timestamp(6) without time zone NOT NULL,
  updated_at timestamp(6) without time zone NOT NULL,
  country_id bigint NOT NULL,
  position integer DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS index_categories_on_name_and_country_id ON categories (name, country_id);

CREATE TABLE IF NOT EXISTS sub_categories (
  id bigserial PRIMARY KEY,
  name character varying NOT NULL,
  created_at timestamp(6) without time zone NOT NULL,
  updated_at timestamp(6) without time zone NOT NULL,
  country_id bigint NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS index_sub_categories_on_name_and_country_id ON sub_categories (name, country_id);

CREATE TABLE IF NOT EXISTS categories_sub_categories (
  id bigserial PRIMARY KEY,
  category_id bigint NOT NULL,
  sub_category_id bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS index_categories_sub_categories_on_category_id ON categories_sub_categories (category_id);
CREATE INDEX IF NOT EXISTS index_categories_sub_categories_on_sub_category_id ON categories_sub_categories (sub_category_id);

CREATE TABLE IF NOT EXISTS bx_block_profile_courses (
  id bigserial PRIMARY KEY,
  course_name character varying NOT NULL,
  created_at timestamp(6) without time zone NOT NULL,
  updated_at timestamp(6) without time zone NOT NULL,
  category_id bigint NOT NULL,
  sub_category_id bigint NOT NULL,
  country_id bigint NOT NULL,
  position integer DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS index_courses_on_course_name_and_sub_category_id ON bx_block_profile_courses (course_name, sub_category_id);

CREATE TABLE IF NOT EXISTS bx_block_profile_mains (
  id bigserial PRIMARY KEY,
  name character varying NOT NULL,
  course_id bigint NOT NULL,
  created_at timestamp(6) without time zone NOT NULL,
  updated_at timestamp(6) without time zone NOT NULL,
  category_id bigint NOT NULL,
  sub_category_id bigint NOT NULL,
  country_id bigint NOT NULL,
  position integer DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS index_mains_on_name_and_course_id ON bx_block_profile_mains (name, course_id);

CREATE TABLE IF NOT EXISTS bx_block_profile_units (
  id bigserial PRIMARY KEY,
  name character varying NOT NULL,
  main_id bigint NOT NULL,
  created_at timestamp(6) without time zone NOT NULL,
  updated_at timestamp(6) without time zone NOT NULL,
  course_id bigint NOT NULL,
  category_id bigint NOT NULL,
  sub_category_id bigint NOT NULL,
  country_id bigint NOT NULL,
  unit_number integer,
  position integer DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS index_units_on_name_and_main_id ON bx_block_profile_units (name, main_id);

CREATE TABLE IF NOT EXISTS bx_block_profile_lessons (
  id bigserial PRIMARY KEY,
  name character varying NOT NULL,
  created_at timestamp(6) without time zone NOT NULL,
  updated_at timestamp(6) without time zone NOT NULL,
  unit_id bigint NOT NULL,
  course_id bigint NOT NULL,
  category_id bigint NOT NULL,
  sub_category_id bigint NOT NULL,
  main_id bigint NOT NULL,
  country_id bigint NOT NULL,
  lesson_number integer,
  position integer DEFAULT 0,
  start_date date NOT NULL,
  end_date date NOT NULL,
  is_upgraded boolean DEFAULT false
);
CREATE UNIQUE INDEX IF NOT EXISTS index_lessons_on_name_and_unit_id ON bx_block_profile_lessons (name, unit_id);

CREATE TABLE IF NOT EXISTS active_storage_blobs (
  id bigserial PRIMARY KEY,
  key character varying NOT NULL,
  filename character varying NOT NULL,
  content_type character varying,
  metadata text,
  byte_size bigint NOT NULL,
  checksum character varying NOT NULL,
  created_at timestamp without time zone NOT NULL,
  service_name character varying NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS index_active_storage_blobs_on_key ON active_storage_blobs (key);

CREATE TABLE IF NOT EXISTS active_storage_attachments (
  id bigserial PRIMARY KEY,
  name character varying NOT NULL,
  record_type character varying NOT NULL,
  record_id bigint NOT NULL,
  blob_id bigint NOT NULL,
  created_at timestamp without time zone NOT NULL,
  default_image boolean DEFAULT false
);
CREATE INDEX IF NOT EXISTS index_active_storage_attachments_on_blob_id ON active_storage_attachments (blob_id);
CREATE UNIQUE INDEX IF NOT EXISTS index_active_storage_attachments_uniqueness ON active_storage_attachments (record_type, record_id, name, blob_id);
