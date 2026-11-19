-- Every table of the Rails app as of its latest migration, replayed from db/schema.rb + db/migrate
-- by db/tools/replay-rails-schema.rb. Columns only (no indexes or foreign keys). For local and test databases only.
SET client_min_messages = warning;
DROP TABLE IF EXISTS "account_block_cities" CASCADE;
CREATE TABLE "account_block_cities" (
  "id" bigserial PRIMARY KEY,
  "name" character varying NOT NULL,
  "country_id" bigint NOT NULL,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "account_block_countries" CASCADE;
CREATE TABLE "account_block_countries" (
  "id" bigserial PRIMARY KEY,
  "name" character varying NOT NULL,
  "alpha2" character varying NOT NULL,
  "alpha3" character varying NOT NULL,
  "country_code" character varying NOT NULL,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "account_block_grades" CASCADE;
CREATE TABLE "account_block_grades" (
  "id" bigserial PRIMARY KEY,
  "name" character varying,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "account_block_learning_contents" CASCADE;
CREATE TABLE "account_block_learning_contents" (
  "id" bigserial PRIMARY KEY,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "account_block_schools" CASCADE;
CREATE TABLE "account_block_schools" (
  "id" bigserial PRIMARY KEY,
  "name" character varying NOT NULL,
  "city_id" bigint NOT NULL,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "account_categories" CASCADE;
CREATE TABLE "account_categories" (
  "id" bigserial PRIMARY KEY,
  "account_id" integer,
  "category_id" integer,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "account_courses" CASCADE;
CREATE TABLE "account_courses" (
  "id" bigserial PRIMARY KEY,
  "account_id" bigint NOT NULL,
  "performance_tracker_course_id" bigint NOT NULL,
  "approved" boolean NOT NULL DEFAULT false,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "account_groups_account_groups" CASCADE;
CREATE TABLE "account_groups_account_groups" (
  "id" bigserial PRIMARY KEY,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL,
  "account_id" integer,
  "group_id" integer
);
DROP TABLE IF EXISTS "account_groups_groups" CASCADE;
CREATE TABLE "account_groups_groups" (
  "id" bigserial PRIMARY KEY,
  "name" character varying,
  "settings" jsonb,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "account_groups_groups_sms_templates" CASCADE;
CREATE TABLE "account_groups_groups_sms_templates" (
  "sms_template_id" integer,
  "group_id" integer
);
DROP TABLE IF EXISTS "account_tests" CASCADE;
CREATE TABLE "account_tests" (
  "id" bigserial PRIMARY KEY,
  "account_id" bigint NOT NULL,
  "performance_test_id" bigint NOT NULL,
  "score_percentage" numeric NOT NULL,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "accounts" CASCADE;
CREATE TABLE "accounts" (
  "id" bigserial PRIMARY KEY,
  "first_name" character varying,
  "last_name" character varying,
  "full_phone_number" character varying,
  "country_code" integer,
  "phone_number" bigint,
  "email" character varying NOT NULL,
  "activated" boolean DEFAULT false,
  "device_id" character varying,
  "unique_auth_id" text,
  "password_digest" character varying NOT NULL,
  "type" character varying,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL,
  "user_name" character varying,
  "platform" character varying,
  "user_type" character varying,
  "app_language_id" bigint NOT NULL,
  "is_blacklisted" boolean DEFAULT false,
  "suspend_until" date,
  "status" integer DEFAULT 0,
  "role_id" bigint NOT NULL,
  "gender" integer,
  "date_of_birth" date,
  "age" integer,
  "gpa" numeric,
  "stripe_id" character varying,
  "stripe_subscription_id" character varying,
  "stripe_subscription_date" timestamp(6) without time zone,
  "login_count" integer DEFAULT 0,
  "last_sign_in_at" timestamp(6) without time zone,
  "default_payment_method_id" character varying,
  "total_xp" integer DEFAULT 0,
  "payment_premium" boolean DEFAULT false,
  "learning_premium" boolean DEFAULT false,
  "streak_active_dates" date[] DEFAULT '{}',
  "medals" integer DEFAULT 0,
  "daily_streak_boost_count" integer DEFAULT 0,
  "temporary_password" character varying,
  "freemium_arena_attempts_count" integer DEFAULT 0,
  "provider" character varying,
  "password_source" character varying,
  "onboarding_challenge_completed" boolean DEFAULT false,
  "previous_sign_in_at" timestamp(6) without time zone,
  "lesson_completion_counter" integer DEFAULT 0,
  "banana_reveal_threshold" integer DEFAULT 5,
  "selected_banana_reward" integer,
  "show_monthly_reward_popup" boolean DEFAULT false,
  "tedix_discovery_completed" boolean DEFAULT false
);
DROP TABLE IF EXISTS "accounts_chats" CASCADE;
CREATE TABLE "accounts_chats" (
  "id" bigserial PRIMARY KEY,
  "account_id" bigint,
  "chat_id" bigint,
  "status" character varying,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL,
  "muted" boolean DEFAULT false
);
DROP TABLE IF EXISTS "achievements" CASCADE;
CREATE TABLE "achievements" (
  "id" bigserial PRIMARY KEY,
  "title" character varying,
  "achievement_date" date,
  "detail" text,
  "url" character varying,
  "profile_bio_id" integer,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "action_mailbox_inbound_emails" CASCADE;
CREATE TABLE "action_mailbox_inbound_emails" (
  "id" bigserial PRIMARY KEY,
  "status" integer NOT NULL DEFAULT 0,
  "message_id" character varying NOT NULL,
  "message_checksum" character varying NOT NULL,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "action_text_rich_texts" CASCADE;
CREATE TABLE "action_text_rich_texts" (
  "id" bigserial PRIMARY KEY,
  "name" character varying NOT NULL,
  "body" text,
  "record_type" character varying NOT NULL,
  "record_id" bigint NOT NULL,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "active_admin_comments" CASCADE;
CREATE TABLE "active_admin_comments" (
  "id" bigserial PRIMARY KEY,
  "namespace" character varying,
  "body" text,
  "resource_type" character varying,
  "resource_id" bigint,
  "author_type" character varying,
  "author_id" bigint,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "active_storage_attachments" CASCADE;
CREATE TABLE "active_storage_attachments" (
  "id" bigserial PRIMARY KEY,
  "name" character varying NOT NULL,
  "record_type" character varying NOT NULL,
  "record_id" bigint NOT NULL,
  "blob_id" bigint NOT NULL,
  "created_at" timestamp(6) without time zone NOT NULL,
  "default_image" boolean DEFAULT false
);
DROP TABLE IF EXISTS "active_storage_blobs" CASCADE;
CREATE TABLE "active_storage_blobs" (
  "id" bigserial PRIMARY KEY,
  "key" character varying NOT NULL,
  "filename" character varying NOT NULL,
  "content_type" character varying,
  "metadata" text,
  "byte_size" bigint NOT NULL,
  "checksum" character varying NOT NULL,
  "created_at" timestamp(6) without time zone NOT NULL,
  "service_name" character varying NOT NULL
);
DROP TABLE IF EXISTS "active_storage_variant_records" CASCADE;
CREATE TABLE "active_storage_variant_records" (
  "id" bigserial PRIMARY KEY,
  "blob_id" bigint NOT NULL,
  "variation_digest" character varying NOT NULL
);
DROP TABLE IF EXISTS "activities" CASCADE;
CREATE TABLE "activities" (
  "id" bigserial PRIMARY KEY,
  "trackable_type" character varying,
  "trackable_id" bigint,
  "owner_type" character varying,
  "owner_id" bigint,
  "key" character varying,
  "parameters" text,
  "recipient_type" character varying,
  "recipient_id" bigint,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "addressables" CASCADE;
CREATE TABLE "addressables" (
  "id" bigserial PRIMARY KEY,
  "shipment_id" bigint NOT NULL,
  "address" text,
  "address2" text,
  "city" character varying,
  "country" character varying,
  "email" character varying,
  "name" character varying,
  "phone" character varying,
  "instructions" text,
  "type" character varying,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "addresses" CASCADE;
CREATE TABLE "addresses" (
  "id" bigserial PRIMARY KEY,
  "country" character varying,
  "latitude" double precision,
  "longitude" double precision,
  "address" character varying,
  "addressble_id" integer,
  "addressble_type" character varying,
  "address_type" integer,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "admin_email_notifications" CASCADE;
CREATE TABLE "admin_email_notifications" (
  "id" bigserial PRIMARY KEY,
  "subject" character varying,
  "unified_notification_id" integer,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "admin_inapp_notifications" CASCADE;
CREATE TABLE "admin_inapp_notifications" (
  "id" bigserial PRIMARY KEY,
  "unified_notification_id" integer,
  "subject" character varying,
  "only_informative" boolean,
  "is_button" boolean,
  "button_url" character varying,
  "button_content" character varying,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "admin_notifications" CASCADE;
CREATE TABLE "admin_notifications" (
  "id" bigserial PRIMARY KEY,
  "subject" character varying,
  "is_button" boolean,
  "button_url" character varying,
  "button_content" character varying,
  "user_group" integer,
  "user_group_specific" character varying,
  "time_to_send" integer,
  "time_to_send_specific" character varying,
  "notification_type" integer,
  "only_informative" boolean DEFAULT false,
  "hour_to_send" integer DEFAULT 15,
  "account_id" integer
);
DROP TABLE IF EXISTS "admin_push_notifications" CASCADE;
CREATE TABLE "admin_push_notifications" (
  "id" bigserial PRIMARY KEY,
  "subject" character varying,
  "unified_notification_id" integer,
  "account_id" integer,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "admin_sms_notifications" CASCADE;
CREATE TABLE "admin_sms_notifications" (
  "id" bigserial PRIMARY KEY,
  "name" character varying,
  "unified_notification_id" integer,
  "main_body" character varying,
  "median_grade" boolean DEFAULT false,
  "sponsor_message" boolean DEFAULT false,
  "sponsor_body" character varying,
  "footer" character varying,
  "last_sms_send_at" timestamp(6) without time zone,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "admin_users" CASCADE;
CREATE TABLE "admin_users" (
  "id" bigserial PRIMARY KEY,
  "email" character varying NOT NULL,
  "encrypted_password" character varying NOT NULL,
  "reset_password_token" character varying,
  "reset_password_sent_at" timestamp(6) without time zone,
  "remember_created_at" timestamp(6) without time zone,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL,
  "role_id" bigint NOT NULL,
  "google_secret" character varying,
  "two_factor_enabled" boolean DEFAULT false,
  "mfa_secret" character varying
);
DROP TABLE IF EXISTS "answer_option_groups" CASCADE;
CREATE TABLE "answer_option_groups" (
  "id" bigserial PRIMARY KEY,
  "questionbank_id" bigint NOT NULL,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL,
  "shape_type" character varying
);
DROP TABLE IF EXISTS "arrival_windows" CASCADE;
CREATE TABLE "arrival_windows" (
  "id" bigserial PRIMARY KEY,
  "begin_at" timestamp(6) without time zone,
  "end_at" timestamp(6) without time zone,
  "exclude_begin" boolean DEFAULT true,
  "exclude_end" boolean DEFAULT true,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL,
  "addressable_id" integer
);
DROP TABLE IF EXISTS "attachments" CASCADE;
CREATE TABLE "attachments" (
  "id" bigserial PRIMARY KEY,
  "account_id" bigint NOT NULL,
  "colour" character varying,
  "layout" character varying,
  "page_size" character varying,
  "scale" character varying,
  "print_sides" character varying,
  "print_pages_from" integer,
  "print_pages_to" integer,
  "total_pages" integer,
  "is_expired" boolean DEFAULT false,
  "total_attachment_pages" integer,
  "pdf_url" character varying,
  "is_printed" boolean DEFAULT false,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL,
  "files" character varying,
  "status" integer
);
DROP TABLE IF EXISTS "audio_podcasts" CASCADE;
CREATE TABLE "audio_podcasts" (
  "id" bigserial PRIMARY KEY,
  "heading" character varying,
  "description" character varying,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "audios" CASCADE;
CREATE TABLE "audios" (
  "id" bigserial PRIMARY KEY,
  "attached_item_id" integer,
  "attached_item_type" character varying,
  "audio" character varying,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "authors" CASCADE;
CREATE TABLE "authors" (
  "id" bigserial PRIMARY KEY,
  "name" character varying,
  "bio" text,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "automatic_renewals" CASCADE;
CREATE TABLE "automatic_renewals" (
  "id" bigserial PRIMARY KEY,
  "account_id" bigint NOT NULL,
  "subscription_type" character varying,
  "is_auto_renewal" boolean DEFAULT false,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "availabilities" CASCADE;
CREATE TABLE "availabilities" (
  "id" bigserial PRIMARY KEY,
  "service_provider_id" bigint,
  "start_time" character varying,
  "end_time" character varying,
  "unavailable_start_time" character varying,
  "unavailable_end_time" character varying,
  "availability_date" character varying,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL,
  "timeslots" jsonb,
  "available_slots_count" integer
);
DROP TABLE IF EXISTS "black_list_users" CASCADE;
CREATE TABLE "black_list_users" (
  "id" bigserial PRIMARY KEY,
  "account_id" bigint NOT NULL,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "bookmarks" CASCADE;
CREATE TABLE "bookmarks" (
  "id" bigserial PRIMARY KEY,
  "account_id" bigint NOT NULL,
  "content_id" bigint NOT NULL,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "brands" CASCADE;
CREATE TABLE "brands" (
  "id" bigserial PRIMARY KEY,
  "name" character varying,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL,
  "currency" integer DEFAULT 0
);
DROP TABLE IF EXISTS "broadcast_messages" CASCADE;
CREATE TABLE "broadcast_messages" (
  "id" bigserial PRIMARY KEY,
  "scheduled_date" timestamp(6) without time zone,
  "message" character varying,
  "account_ids" integer[] DEFAULT '{}',
  "jid" character varying,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "bx_block_appointment_management_booked_slots" CASCADE;
CREATE TABLE "bx_block_appointment_management_booked_slots" (
  "id" bigserial PRIMARY KEY,
  "order_id" bigint,
  "start_time" character varying,
  "end_time" character varying,
  "service_provider_id" bigint,
  "booking_date" date,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "bx_block_assessmenttest_answer_options" CASCADE;
CREATE TABLE "bx_block_assessmenttest_answer_options" (
  "id" bigserial PRIMARY KEY,
  "questionbank_id" bigint,
  "is_correct" boolean DEFAULT false,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL,
  "option" character varying NOT NULL,
  "sequence_number" integer,
  "answer_option_group_id" bigint NOT NULL
);
DROP TABLE IF EXISTS "bx_block_assessmenttest_assessment_types" CASCADE;
CREATE TABLE "bx_block_assessmenttest_assessment_types" (
  "id" bigserial PRIMARY KEY,
  "name" character varying,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "bx_block_assessmenttest_assessments" CASCADE;
CREATE TABLE "bx_block_assessmenttest_assessments" (
  "id" bigserial PRIMARY KEY,
  "name" character varying NOT NULL,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL,
  "lesson_id" bigint NOT NULL,
  "micro_lesson_id" bigint NOT NULL,
  "category_type" integer NOT NULL,
  "category_id" bigint NOT NULL,
  "sub_category_id" bigint NOT NULL,
  "course_id" bigint NOT NULL,
  "main_id" bigint NOT NULL,
  "unit_id" bigint NOT NULL,
  "country_id" bigint NOT NULL,
  "is_aha" boolean DEFAULT false
);
DROP TABLE IF EXISTS "bx_block_assessmenttest_attempted_assessments" CASCADE;
CREATE TABLE "bx_block_assessmenttest_attempted_assessments" (
  "id" bigserial PRIMARY KEY,
  "account_id" integer,
  "assessment_id" integer,
  "is_completed" boolean,
  "total_marks" integer,
  "obtain_marks" integer,
  "passing_status" character varying,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "bx_block_assessmenttest_attempted_questions" CASCADE;
CREATE TABLE "bx_block_assessmenttest_attempted_questions" (
  "id" bigserial PRIMARY KEY,
  "questionbank_id" integer,
  "attempted_assessment_id" integer,
  "question_type" character varying,
  "selected_option_id" integer,
  "descriptive_answer" text,
  "total_marks" integer,
  "obtain_marks" integer,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "bx_block_assessmenttest_question_bodies" CASCADE;
CREATE TABLE "bx_block_assessmenttest_question_bodies" (
  "id" bigserial PRIMARY KEY,
  "content" text,
  "questionbank_id" integer,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "bx_block_assessmenttest_questionbanks" CASCADE;
CREATE TABLE "bx_block_assessmenttest_questionbanks" (
  "id" bigserial PRIMARY KEY,
  "assessment_id" bigint NOT NULL,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL,
  "question" character varying NOT NULL,
  "question_body" character varying,
  "solution" character varying NOT NULL,
  "hint" character varying NOT NULL,
  "question_type" integer NOT NULL,
  "questionbank_type" character varying NOT NULL
);
DROP TABLE IF EXISTS "bx_block_educational_gamification_accounts_boosters" CASCADE;
CREATE TABLE "bx_block_educational_gamification_accounts_boosters" (
  "id" bigserial PRIMARY KEY,
  "account_id" integer,
  "booster_id" integer,
  "start_time" timestamp(6) without time zone,
  "end_time" timestamp(6) without time zone,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "bx_block_educational_gamification_accounts_event_points" CASCADE;
CREATE TABLE "bx_block_educational_gamification_accounts_event_points" (
  "id" bigserial PRIMARY KEY,
  "account_id" integer,
  "event_point_id" integer,
  "accounts_booster_id" integer,
  "xp" integer,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL,
  "description" text,
  "metadata" jsonb DEFAULT '{}'
);
DROP TABLE IF EXISTS "bx_block_educational_gamification_boosters" CASCADE;
CREATE TABLE "bx_block_educational_gamification_boosters" (
  "id" bigserial PRIMARY KEY,
  "key" character varying NOT NULL,
  "description" text NOT NULL,
  "duration_in_seconds" integer NOT NULL,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "bx_block_educational_gamification_event_points" CASCADE;
CREATE TABLE "bx_block_educational_gamification_event_points" (
  "id" bigserial PRIMARY KEY,
  "category_type" integer NOT NULL,
  "key" character varying NOT NULL,
  "description" text NOT NULL,
  "xp" integer NOT NULL,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "bx_block_educational_gamification_leages" CASCADE;
CREATE TABLE "bx_block_educational_gamification_leages" (
  "id" bigserial PRIMARY KEY,
  "leaguae_name" character varying,
  "leaguae_type" integer,
  "start_date" timestamp(6) without time zone,
  "end_date" timestamp(6) without time zone,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "bx_block_educational_gamification_leaguae_participants" CASCADE;
CREATE TABLE "bx_block_educational_gamification_leaguae_participants" (
  "id" bigserial PRIMARY KEY,
  "leaguae_id" integer,
  "account_id" integer,
  "ranking" integer DEFAULT 0,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "bx_block_educational_gamification_lesson_attempts" CASCADE;
CREATE TABLE "bx_block_educational_gamification_lesson_attempts" (
  "id" bigserial PRIMARY KEY,
  "lesson_id" integer,
  "lesson_completed" boolean DEFAULT false,
  "total_xp" integer DEFAULT 0,
  "grade" integer DEFAULT 0,
  "account_id" integer,
  "attempt_order" integer DEFAULT 1,
  "lesson_completed_at" timestamp(6) without time zone,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "bx_block_educational_gamification_lesson_progresses" CASCADE;
CREATE TABLE "bx_block_educational_gamification_lesson_progresses" (
  "id" bigserial PRIMARY KEY,
  "progress_group" character varying,
  "start_at" timestamp(6) without time zone,
  "end_at" timestamp(6) without time zone,
  "account_id" integer,
  "micro_lesson_id" integer,
  "lesson_id" integer,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "bx_block_educational_gamification_main_leaderboards" CASCADE;
CREATE TABLE "bx_block_educational_gamification_main_leaderboards" (
  "id" bigserial PRIMARY KEY,
  "account_id" bigint NOT NULL,
  "ranking" integer DEFAULT 0,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "bx_block_educational_gamification_question_and_answers" CASCADE;
CREATE TABLE "bx_block_educational_gamification_question_and_answers" (
  "id" bigserial PRIMARY KEY,
  "account_id" integer,
  "micro_lesson_id" integer,
  "lesson_id" integer,
  "assessment_id" integer,
  "account_event_point_id" integer,
  "question_bank_id" integer,
  "grade" integer DEFAULT 0,
  "time_complete_in_seconds" integer DEFAULT 0,
  "question_body" text,
  "correct_answer" text,
  "user_answer" text,
  "correct" boolean DEFAULT false,
  "challenge" boolean DEFAULT false,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL,
  "lesson_completed" boolean DEFAULT false,
  "challenge_completed" boolean DEFAULT false,
  "xp" integer DEFAULT 0,
  "question_type" integer,
  "lesson_attempt_id" integer
);
DROP TABLE IF EXISTS "bx_block_educational_gamification_ranges" CASCADE;
CREATE TABLE "bx_block_educational_gamification_ranges" (
  "id" bigserial PRIMARY KEY,
  "account_id" bigint NOT NULL,
  "range_data" jsonb,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "bx_block_language_option_content_languages" CASCADE;
CREATE TABLE "bx_block_language_option_content_languages" (
  "id" bigserial PRIMARY KEY,
  "account_id" bigint NOT NULL,
  "bx_block_language_options_language_id" bigint NOT NULL,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "bx_block_language_options_language_translations" CASCADE;
CREATE TABLE "bx_block_language_options_language_translations" (
  "id" bigserial PRIMARY KEY,
  "language_id" integer,
  "translation_id" integer,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL,
  "value" character varying
);
DROP TABLE IF EXISTS "bx_block_language_options_languages" CASCADE;
CREATE TABLE "bx_block_language_options_languages" (
  "id" bigserial PRIMARY KEY,
  "name" character varying NOT NULL,
  "language_code" character varying NOT NULL,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL,
  "emoji_flag" character varying NOT NULL
);
DROP TABLE IF EXISTS "bx_block_language_options_translations" CASCADE;
CREATE TABLE "bx_block_language_options_translations" (
  "id" bigserial PRIMARY KEY,
  "module" character varying,
  "key" character varying,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "bx_block_leader_board_leader_boards" CASCADE;
CREATE TABLE "bx_block_leader_board_leader_boards" (
  "id" bigserial PRIMARY KEY,
  "account_id" bigint NOT NULL,
  "total_point" bigint NOT NULL,
  "created_by" character varying NOT NULL DEFAULT '',
  "updated_by" character varying,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "bx_block_multipageforms2_user_profiles" CASCADE;
CREATE TABLE "bx_block_multipageforms2_user_profiles" (
  "id" bigserial PRIMARY KEY,
  "first_name" character varying,
  "last_name" character varying,
  "phone_number" character varying,
  "email" character varying,
  "gender" character varying,
  "country" character varying,
  "industry" integer,
  "message" text,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "bx_block_profile_associated_projects" CASCADE;
CREATE TABLE "bx_block_profile_associated_projects" (
  "id" bigserial PRIMARY KEY,
  "project_id" integer,
  "associated_id" integer,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "bx_block_profile_associateds" CASCADE;
CREATE TABLE "bx_block_profile_associateds" (
  "id" bigserial PRIMARY KEY,
  "associated_with_name" character varying,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "bx_block_profile_awards" CASCADE;
CREATE TABLE "bx_block_profile_awards" (
  "id" bigserial PRIMARY KEY,
  "title" character varying,
  "associated_with" character varying,
  "issuer" character varying,
  "issue_date" timestamp(6) without time zone,
  "description" text,
  "make_public" boolean NOT NULL DEFAULT false,
  "profile_id" integer,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "bx_block_profile_career_experience_employment_types" CASCADE;
CREATE TABLE "bx_block_profile_career_experience_employment_types" (
  "id" bigserial PRIMARY KEY,
  "career_experience_id" integer,
  "employment_type_id" integer,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "bx_block_profile_career_experience_industry" CASCADE;
CREATE TABLE "bx_block_profile_career_experience_industry" (
  "id" bigserial PRIMARY KEY,
  "career_experience_id" integer,
  "industry_id" integer,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "bx_block_profile_career_experience_system_experiences" CASCADE;
CREATE TABLE "bx_block_profile_career_experience_system_experiences" (
  "id" bigserial PRIMARY KEY,
  "career_experience_id" integer,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL,
  "system_experience_id" integer
);
DROP TABLE IF EXISTS "bx_block_profile_career_experiences" CASCADE;
CREATE TABLE "bx_block_profile_career_experiences" (
  "id" bigserial PRIMARY KEY,
  "job_title" character varying,
  "start_date" date,
  "end_date" date,
  "company_name" character varying,
  "description" text,
  "add_key_achievements" character varying[] DEFAULT '{}',
  "make_key_achievements_public" boolean NOT NULL DEFAULT false,
  "profile_id" integer,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL,
  "current_salary" numeric DEFAULT '0.0',
  "notice_period" text,
  "notice_period_end_date" date,
  "currently_working_here" boolean DEFAULT false
);
DROP TABLE IF EXISTS "bx_block_profile_courses" CASCADE;
CREATE TABLE "bx_block_profile_courses" (
  "id" bigserial PRIMARY KEY,
  "course_name" character varying NOT NULL,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL,
  "category_id" bigint NOT NULL,
  "sub_category_id" bigint NOT NULL,
  "country_id" bigint NOT NULL,
  "position" integer DEFAULT 0
);
DROP TABLE IF EXISTS "bx_block_profile_current_annual_salaries" CASCADE;
CREATE TABLE "bx_block_profile_current_annual_salaries" (
  "id" bigserial PRIMARY KEY,
  "current_annual_salary" character varying,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "bx_block_profile_current_annual_salary_current_status" CASCADE;
CREATE TABLE "bx_block_profile_current_annual_salary_current_status" (
  "id" bigserial PRIMARY KEY,
  "current_status_id" integer,
  "current_annual_salary_id" integer,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "bx_block_profile_current_status" CASCADE;
CREATE TABLE "bx_block_profile_current_status" (
  "id" bigserial PRIMARY KEY,
  "most_recent_job_title" character varying,
  "company_name" character varying,
  "notice_period" text,
  "end_date" date,
  "profile_id" integer,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "bx_block_profile_current_status_employment_types" CASCADE;
CREATE TABLE "bx_block_profile_current_status_employment_types" (
  "id" bigserial PRIMARY KEY,
  "current_status_id" integer,
  "employment_type_id" integer,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "bx_block_profile_current_status_industries" CASCADE;
CREATE TABLE "bx_block_profile_current_status_industries" (
  "id" bigserial PRIMARY KEY,
  "current_status_id" integer,
  "industry_id" integer,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "bx_block_profile_custom_user_profile_fields" CASCADE;
CREATE TABLE "bx_block_profile_custom_user_profile_fields" (
  "id" bigserial PRIMARY KEY,
  "name" character varying,
  "field_type" character varying,
  "is_enable" boolean NOT NULL DEFAULT true,
  "is_required" boolean NOT NULL DEFAULT true,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "bx_block_profile_degree_educational_qualifications" CASCADE;
CREATE TABLE "bx_block_profile_degree_educational_qualifications" (
  "id" bigserial PRIMARY KEY,
  "educational_qualification_id" integer,
  "degree_id" integer,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "bx_block_profile_degrees" CASCADE;
CREATE TABLE "bx_block_profile_degrees" (
  "id" bigserial PRIMARY KEY,
  "degree_name" character varying,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "bx_block_profile_educational_qualification_field_study" CASCADE;
CREATE TABLE "bx_block_profile_educational_qualification_field_study" (
  "id" bigserial PRIMARY KEY,
  "educational_qualification_id" integer,
  "field_study_id" integer,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "bx_block_profile_educational_qualifications" CASCADE;
CREATE TABLE "bx_block_profile_educational_qualifications" (
  "id" bigserial PRIMARY KEY,
  "school_name" character varying,
  "start_date" date,
  "end_date" date,
  "grades" character varying,
  "description" text,
  "make_grades_public" boolean NOT NULL DEFAULT false,
  "profile_id" integer,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "bx_block_profile_employment_types" CASCADE;
CREATE TABLE "bx_block_profile_employment_types" (
  "id" bigserial PRIMARY KEY,
  "employment_type_name" character varying,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "bx_block_profile_field_study" CASCADE;
CREATE TABLE "bx_block_profile_field_study" (
  "id" bigserial PRIMARY KEY,
  "field_of_study" character varying,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "bx_block_profile_hobbies_and_interests" CASCADE;
CREATE TABLE "bx_block_profile_hobbies_and_interests" (
  "id" bigserial PRIMARY KEY,
  "title" character varying,
  "category" character varying,
  "description" text,
  "make_public" boolean NOT NULL DEFAULT false,
  "profile_id" integer,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "bx_block_profile_industries" CASCADE;
CREATE TABLE "bx_block_profile_industries" (
  "id" bigserial PRIMARY KEY,
  "industry_name" character varying,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "bx_block_profile_languages" CASCADE;
CREATE TABLE "bx_block_profile_languages" (
  "id" bigserial PRIMARY KEY,
  "language" character varying,
  "proficiency" character varying,
  "profile_id" integer,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "bx_block_profile_lessons" CASCADE;
CREATE TABLE "bx_block_profile_lessons" (
  "id" bigserial PRIMARY KEY,
  "name" character varying NOT NULL,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL,
  "unit_id" bigint NOT NULL,
  "course_id" bigint NOT NULL,
  "category_id" bigint NOT NULL,
  "sub_category_id" bigint NOT NULL,
  "main_id" bigint NOT NULL,
  "country_id" bigint NOT NULL,
  "lesson_number" integer,
  "position" integer DEFAULT 0,
  "start_date" date NOT NULL,
  "end_date" date NOT NULL,
  "is_upgraded" boolean DEFAULT false
);
DROP TABLE IF EXISTS "bx_block_profile_mains" CASCADE;
CREATE TABLE "bx_block_profile_mains" (
  "id" bigserial PRIMARY KEY,
  "name" character varying NOT NULL,
  "course_id" bigint NOT NULL,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL,
  "category_id" bigint NOT NULL,
  "sub_category_id" bigint NOT NULL,
  "country_id" bigint NOT NULL,
  "position" integer DEFAULT 0
);
DROP TABLE IF EXISTS "bx_block_profile_materials" CASCADE;
CREATE TABLE "bx_block_profile_materials" (
  "id" bigserial PRIMARY KEY,
  "lesson_id" integer,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "bx_block_profile_micro_lessons" CASCADE;
CREATE TABLE "bx_block_profile_micro_lessons" (
  "id" bigserial PRIMARY KEY,
  "name" character varying NOT NULL,
  "description" text,
  "lesson_id" bigint NOT NULL,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL,
  "course_id" bigint NOT NULL,
  "category_id" bigint NOT NULL,
  "sub_category_id" bigint NOT NULL,
  "main_id" bigint NOT NULL,
  "unit_id" bigint NOT NULL,
  "micro_lesson_type" integer NOT NULL,
  "country_id" bigint NOT NULL,
  "position" integer DEFAULT 0
);
DROP TABLE IF EXISTS "bx_block_profile_micro_summaries" CASCADE;
CREATE TABLE "bx_block_profile_micro_summaries" (
  "id" bigserial PRIMARY KEY,
  "lesson_id" bigint,
  "micro_lesson_id" bigint,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "bx_block_profile_profile_courses" CASCADE;
CREATE TABLE "bx_block_profile_profile_courses" (
  "id" bigserial PRIMARY KEY,
  "profile_id" integer,
  "course_id" integer,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "bx_block_profile_profiles" CASCADE;
CREATE TABLE "bx_block_profile_profiles" (
  "id" bigserial PRIMARY KEY,
  "account_id" bigint NOT NULL,
  "photo" character varying,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL,
  "country" character varying,
  "profile_video" character varying,
  "address" character varying,
  "city" character varying,
  "postal_code" character varying,
  "profile_role" character varying,
  "bio" character varying,
  "user_name" character varying NOT NULL,
  "name" character varying,
  "instagram" character varying,
  "youtube" character varying,
  "facebook" character varying,
  "dob" character varying,
  "email" character varying,
  "phone" character varying,
  "first_name" character varying,
  "last_name" character varying,
  "school" character varying,
  "display_name" character varying,
  "parent_email" character varying,
  "parent_phone" character varying,
  "teacher_email" character varying,
  "premium_account" boolean DEFAULT false,
  "premium_account_start_date" timestamp(6) without time zone,
  "premium_account_end_date" timestamp(6) without time zone,
  "daily_goal" character varying DEFAULT 'super_easy',
  "streak_goal" character varying DEFAULT 'easy',
  "favorite_color" character varying,
  "daily_notification" boolean DEFAULT false,
  "grade" character varying,
  "category_id" bigint NOT NULL,
  "social_account_id" integer,
  "avatar_health" character varying DEFAULT 'happy',
  "country_id" bigint NOT NULL,
  "app_country_id" integer,
  "daily_goal_count" integer,
  "parent_verified" boolean DEFAULT false,
  "unitid" character varying,
  "unit_name" text,
  "topic_name" character varying,
  "city_id" bigint,
  "school_id" bigint
);
DROP TABLE IF EXISTS "bx_block_profile_projects" CASCADE;
CREATE TABLE "bx_block_profile_projects" (
  "id" bigserial PRIMARY KEY,
  "project_name" character varying,
  "start_date" date,
  "end_date" date,
  "add_members" character varying,
  "url" character varying,
  "description" text,
  "make_projects_public" boolean NOT NULL DEFAULT false,
  "profile_id" integer,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "bx_block_profile_publication_patents" CASCADE;
CREATE TABLE "bx_block_profile_publication_patents" (
  "id" bigserial PRIMARY KEY,
  "title" character varying,
  "publication" character varying,
  "authors" character varying,
  "url" character varying,
  "description" text,
  "make_public" boolean NOT NULL DEFAULT false,
  "profile_id" integer,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "bx_block_profile_system_experiences" CASCADE;
CREATE TABLE "bx_block_profile_system_experiences" (
  "id" bigserial PRIMARY KEY,
  "system_experience" character varying,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "bx_block_profile_test_score_and_courses" CASCADE;
CREATE TABLE "bx_block_profile_test_score_and_courses" (
  "id" bigserial PRIMARY KEY,
  "title" character varying,
  "associated_with" character varying,
  "score" character varying,
  "test_date" timestamp(6) without time zone,
  "description" text,
  "make_public" boolean NOT NULL DEFAULT false,
  "profile_id" integer,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "bx_block_profile_units" CASCADE;
CREATE TABLE "bx_block_profile_units" (
  "id" bigserial PRIMARY KEY,
  "name" character varying NOT NULL,
  "main_id" bigint NOT NULL,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL,
  "course_id" bigint NOT NULL,
  "category_id" bigint NOT NULL,
  "sub_category_id" bigint NOT NULL,
  "country_id" bigint NOT NULL,
  "unit_number" integer,
  "position" integer DEFAULT 0
);
DROP TABLE IF EXISTS "bx_block_projectreporting_projects" CASCADE;
CREATE TABLE "bx_block_projectreporting_projects" (
  "id" bigserial PRIMARY KEY,
  "name" character varying,
  "manager_id" bigint,
  "account_id" bigint,
  "co_manager_id" bigint,
  "online_tool_ids" integer[] DEFAULT '{}',
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL,
  "project_type" integer DEFAULT 0,
  "client_id" integer,
  "start_date" timestamp(6) without time zone,
  "end_date" timestamp(6) without time zone,
  "assessor_ids" integer[] DEFAULT '{}',
  "max_score" numeric DEFAULT '0.0',
  "assessor_tool_ids" integer[] DEFAULT '{}',
  "is_negative_marking" boolean DEFAULT false,
  "negative_mark" numeric,
  "question_ids" integer[] DEFAULT '{}',
  "duration" integer,
  "competancy_ids" integer[] DEFAULT '{}'
);
DROP TABLE IF EXISTS "bx_block_request_management_report_problems" CASCADE;
CREATE TABLE "bx_block_request_management_report_problems" (
  "id" bigserial PRIMARY KEY,
  "user_id" bigint,
  "problem" text,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL,
  "micro_lesson_id" bigint,
  "lesson_id" bigint,
  "lesson_attempt_id" bigint,
  "account_event_point_id" bigint
);
DROP TABLE IF EXISTS "bx_block_stripe_integration_customers" CASCADE;
CREATE TABLE "bx_block_stripe_integration_customers" (
  "id" bigserial PRIMARY KEY,
  "stripe_id" character varying,
  "account_id" bigint NOT NULL,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "bx_block_stripe_integration_payment_cards" CASCADE;
CREATE TABLE "bx_block_stripe_integration_payment_cards" (
  "id" bigserial PRIMARY KEY,
  "account_id" integer,
  "payment_method_id" character varying,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "bx_block_stripe_integration_plans" CASCADE;
CREATE TABLE "bx_block_stripe_integration_plans" (
  "id" bigserial PRIMARY KEY,
  "name" character varying NOT NULL,
  "description" character varying,
  "interval" integer NOT NULL,
  "interval_count" integer DEFAULT 1,
  "price_cents" integer NOT NULL,
  "stripe_price_id" character varying NOT NULL,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL,
  "active" boolean DEFAULT true,
  "stripe_product_id" character varying NOT NULL
);
DROP TABLE IF EXISTS "bx_block_stripe_integration_subscriptions" CASCADE;
CREATE TABLE "bx_block_stripe_integration_subscriptions" (
  "id" bigserial PRIMARY KEY,
  "plan_id" bigint NOT NULL,
  "account_id" bigint NOT NULL,
  "payment_method_id" character varying,
  "active" boolean DEFAULT true,
  "auto_renewal" boolean DEFAULT true,
  "stripe_id" character varying,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL,
  "status" character varying,
  "start_date" date,
  "end_date" date,
  "cancel_date" timestamp(6) without time zone
);
DROP TABLE IF EXISTS "bx_block_tasks_task_lists" CASCADE;
CREATE TABLE "bx_block_tasks_task_lists" (
  "id" bigserial PRIMARY KEY,
  "name" character varying,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL,
  "account_id" integer
);
DROP TABLE IF EXISTS "bx_block_tasks_task_lists_tasks" CASCADE;
CREATE TABLE "bx_block_tasks_task_lists_tasks" (
  "id" bigserial PRIMARY KEY,
  "task_id" integer,
  "task_list_id" integer
);
DROP TABLE IF EXISTS "bx_block_tasks_tasks" CASCADE;
CREATE TABLE "bx_block_tasks_tasks" (
  "id" bigserial PRIMARY KEY,
  "task_list_id" integer,
  "title" character varying,
  "assigned_to_id" integer,
  "assigned_to_type" character varying,
  "due_date" date,
  "description" text,
  "status" integer,
  "priority" integer,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL,
  "account_id" integer
);
DROP TABLE IF EXISTS "bx_block_terms_and_conditions_terms_and_conditions" CASCADE;
CREATE TABLE "bx_block_terms_and_conditions_terms_and_conditions" (
  "id" bigserial PRIMARY KEY,
  "account_id" integer,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL,
  "description" text,
  "start_date" timestamp(6) without time zone DEFAULT '2024-01-26 16:38:42',
  "end_date" timestamp(6) without time zone DEFAULT '2025-01-26 16:38:42'
);
DROP TABLE IF EXISTS "bx_block_terms_and_conditions_user_term_and_conditions" CASCADE;
CREATE TABLE "bx_block_terms_and_conditions_user_term_and_conditions" (
  "id" bigserial PRIMARY KEY,
  "account_id" integer,
  "terms_and_condition_id" integer,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL,
  "is_accepted" boolean
);
DROP TABLE IF EXISTS "campaigns" CASCADE;
CREATE TABLE "campaigns" (
  "id" bigserial PRIMARY KEY,
  "name" character varying NOT NULL,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL,
  "arena_type" character varying NOT NULL,
  "from_date" timestamp(6) without time zone NOT NULL,
  "to_date" timestamp(6) without time zone NOT NULL,
  "country_ids" text[] DEFAULT '{}',
  "city_ids" text[] DEFAULT '{}',
  "school_ids" text[] DEFAULT '{}',
  "grade_ids" text[] DEFAULT '{}',
  "audience" text[] DEFAULT '{}',
  "observation_notes" text,
  "lesson_selection_mode" character varying NOT NULL,
  "status" integer NOT NULL,
  "lesson_ids" text[] DEFAULT '{}',
  "subject_ids" text[] DEFAULT '{}',
  "master_ids" text[] DEFAULT '{}',
  "main_ids" text[] DEFAULT '{}',
  "unit_ids" text[] DEFAULT '{}',
  "leaderboard_finalized" boolean DEFAULT false
);
DROP TABLE IF EXISTS "careers" CASCADE;
CREATE TABLE "careers" (
  "id" bigserial PRIMARY KEY,
  "profession" character varying,
  "is_current" boolean DEFAULT false,
  "experience_from" character varying,
  "experience_to" character varying,
  "payscale" character varying,
  "company_name" character varying,
  "accomplishment" character varying[],
  "sector" integer,
  "profile_bio_id" integer,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "catalogue_reviews" CASCADE;
CREATE TABLE "catalogue_reviews" (
  "id" bigserial PRIMARY KEY,
  "catalogue_id" bigint NOT NULL,
  "comment" character varying,
  "rating" integer,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "catalogue_tags" CASCADE;
CREATE TABLE "catalogue_tags" (
  "id" bigserial PRIMARY KEY,
  "name" character varying,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "catalogue_variant_colors" CASCADE;
CREATE TABLE "catalogue_variant_colors" (
  "id" bigserial PRIMARY KEY,
  "name" character varying,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "catalogue_variant_sizes" CASCADE;
CREATE TABLE "catalogue_variant_sizes" (
  "id" bigserial PRIMARY KEY,
  "name" character varying,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "catalogue_variants" CASCADE;
CREATE TABLE "catalogue_variants" (
  "id" bigserial PRIMARY KEY,
  "catalogue_id" bigint NOT NULL,
  "catalogue_variant_color_id" bigint,
  "catalogue_variant_size_id" bigint,
  "price" numeric,
  "stock_qty" integer,
  "on_sale" boolean,
  "sale_price" numeric,
  "discount_price" numeric,
  "length" double precision,
  "breadth" double precision,
  "height" double precision,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL,
  "block_qty" integer
);
DROP TABLE IF EXISTS "catalogues" CASCADE;
CREATE TABLE "catalogues" (
  "id" bigserial PRIMARY KEY,
  "category_id" bigint NOT NULL,
  "sub_category_id" bigint NOT NULL,
  "brand_id" bigint,
  "name" character varying,
  "sku" character varying,
  "description" character varying,
  "manufacture_date" timestamp(6) without time zone,
  "length" double precision,
  "breadth" double precision,
  "height" double precision,
  "availability" integer,
  "stock_qty" integer,
  "weight" numeric,
  "price" double precision,
  "recommended" boolean,
  "on_sale" boolean,
  "sale_price" numeric,
  "discount" numeric,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL,
  "block_qty" integer
);
DROP TABLE IF EXISTS "catalogues_tags" CASCADE;
CREATE TABLE "catalogues_tags" (
  "id" bigserial PRIMARY KEY,
  "catalogue_id" bigint NOT NULL,
  "catalogue_tag_id" bigint NOT NULL
);
DROP TABLE IF EXISTS "categories" CASCADE;
CREATE TABLE "categories" (
  "id" bigserial PRIMARY KEY,
  "name" character varying NOT NULL,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL,
  "country_id" bigint NOT NULL,
  "position" integer DEFAULT 0
);
DROP TABLE IF EXISTS "categories_sub_categories" CASCADE;
CREATE TABLE "categories_sub_categories" (
  "id" bigserial PRIMARY KEY,
  "category_id" bigint NOT NULL,
  "sub_category_id" bigint NOT NULL
);
DROP TABLE IF EXISTS "chat_messages" CASCADE;
CREATE TABLE "chat_messages" (
  "id" bigserial PRIMARY KEY,
  "account_id" bigint,
  "chat_id" bigint,
  "message" character varying NOT NULL,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL,
  "is_mark_read" boolean DEFAULT false,
  "message_type" integer,
  "attachment" character varying
);
DROP TABLE IF EXISTS "chats" CASCADE;
CREATE TABLE "chats" (
  "id" bigserial PRIMARY KEY,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL,
  "name" character varying NOT NULL DEFAULT '',
  "chat_type" integer NOT NULL
);
DROP TABLE IF EXISTS "cod_values" CASCADE;
CREATE TABLE "cod_values" (
  "id" bigserial PRIMARY KEY,
  "shipment_id" bigint NOT NULL,
  "amount" double precision,
  "currency" character varying DEFAULT 'RS',
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "comments" CASCADE;
CREATE TABLE "comments" (
  "id" bigserial PRIMARY KEY,
  "account_id" bigint,
  "commentable_id" bigint,
  "commentable_type" character varying,
  "comment" text,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "contacts" CASCADE;
CREATE TABLE "contacts" (
  "id" bigserial PRIMARY KEY,
  "account_id" bigint,
  "name" character varying,
  "email" character varying,
  "phone_number" character varying,
  "description" text,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "content_images" CASCADE;
CREATE TABLE "content_images" (
  "id" bigserial PRIMARY KEY,
  "key_name" character varying,
  "attr_name" character varying,
  "contentable_type" character varying NOT NULL,
  "contentable_id" bigint NOT NULL,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "content_management_videos" CASCADE;
CREATE TABLE "content_management_videos" (
  "id" bigserial PRIMARY KEY,
  "attached_item_id" integer,
  "attached_item_type" character varying,
  "video" character varying,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "content_texts" CASCADE;
CREATE TABLE "content_texts" (
  "id" bigserial PRIMARY KEY,
  "headline" character varying,
  "content" character varying,
  "hyperlink" character varying,
  "affiliation" character varying,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "content_types" CASCADE;
CREATE TABLE "content_types" (
  "id" bigserial PRIMARY KEY,
  "name" character varying,
  "type" integer,
  "identifier" integer,
  "rank" integer,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "content_videos" CASCADE;
CREATE TABLE "content_videos" (
  "id" bigserial PRIMARY KEY,
  "separate_section" character varying,
  "headline" character varying,
  "description" character varying,
  "thumbnails" character varying,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "contents" CASCADE;
CREATE TABLE "contents" (
  "id" bigserial PRIMARY KEY,
  "sub_category_id" integer,
  "category_id" integer,
  "content_type_id" integer,
  "language_id" integer,
  "status" integer,
  "publish_date" timestamp(6) without time zone,
  "archived" boolean DEFAULT false,
  "feature_article" boolean,
  "feature_video" boolean,
  "searchable_text" character varying,
  "review_status" integer,
  "feedback" character varying,
  "admin_user_id" integer,
  "view_count" bigint DEFAULT 0,
  "contentable_type" character varying,
  "contentable_id" bigint,
  "author_id" bigint,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "coordinates" CASCADE;
CREATE TABLE "coordinates" (
  "id" bigserial PRIMARY KEY,
  "latitude" character varying,
  "longitude" character varying,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL,
  "addressable_id" integer
);
DROP TABLE IF EXISTS "coupon_codes" CASCADE;
CREATE TABLE "coupon_codes" (
  "id" bigserial PRIMARY KEY,
  "title" character varying,
  "description" character varying,
  "code" character varying,
  "discount_type" character varying DEFAULT 'flat',
  "discount" numeric,
  "valid_from" timestamp(6) without time zone,
  "valid_to" timestamp(6) without time zone,
  "min_cart_value" numeric,
  "max_cart_value" numeric,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "create_shipments" CASCADE;
CREATE TABLE "create_shipments" (
  "id" bigserial PRIMARY KEY,
  "auto_assign_drivers" boolean DEFAULT false,
  "requested_by" character varying,
  "shipper_id" character varying,
  "waybill" character varying,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "cta" CASCADE;
CREATE TABLE "cta" (
  "id" bigserial PRIMARY KEY,
  "headline" character varying,
  "description" text,
  "category_id" bigint,
  "long_background_image" character varying,
  "square_background_image" character varying,
  "button_text" character varying,
  "redirect_url" character varying,
  "text_alignment" integer,
  "button_alignment" integer,
  "is_square_cta" boolean,
  "is_long_rectangle_cta" boolean,
  "is_text_cta" boolean,
  "is_image_cta" boolean,
  "has_button" boolean,
  "visible_on_home_page" boolean,
  "visible_on_details_page" boolean,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "daily_goals" CASCADE;
CREATE TABLE "daily_goals" (
  "id" bigserial PRIMARY KEY,
  "goal_name" character varying,
  "account_id" integer,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL,
  "lesson_ids" integer[] DEFAULT '{}'
);
DROP TABLE IF EXISTS "deliveries" CASCADE;
CREATE TABLE "deliveries" (
  "id" bigserial PRIMARY KEY,
  "shipment_id" bigint NOT NULL,
  "address" text,
  "address2" text,
  "city" character varying,
  "country" character varying,
  "email" character varying,
  "name" character varying,
  "phone" character varying,
  "instructions" text,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "delivery_address_orders" CASCADE;
CREATE TABLE "delivery_address_orders" (
  "id" bigserial PRIMARY KEY,
  "order_management_order_id" bigint NOT NULL,
  "delivery_address_id" bigint NOT NULL,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "delivery_addresses" CASCADE;
CREATE TABLE "delivery_addresses" (
  "id" bigserial PRIMARY KEY,
  "account_id" bigint NOT NULL,
  "address" character varying,
  "name" character varying,
  "flat_no" character varying,
  "zip_code" character varying,
  "phone_number" character varying,
  "deleted_at" timestamp(6) without time zone,
  "latitude" double precision,
  "longitude" double precision,
  "residential" boolean DEFAULT true,
  "city" character varying,
  "state_code" character varying,
  "country_code" character varying,
  "state" character varying,
  "country" character varying,
  "address_line_2" character varying,
  "address_type" character varying DEFAULT 'home',
  "address_for" character varying DEFAULT 'shipping',
  "is_default" boolean DEFAULT false,
  "landmark" character varying,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "dimensions" CASCADE;
CREATE TABLE "dimensions" (
  "id" bigserial PRIMARY KEY,
  "item_id" bigint NOT NULL,
  "height" double precision,
  "length" double precision,
  "width" double precision,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "educations" CASCADE;
CREATE TABLE "educations" (
  "id" bigserial PRIMARY KEY,
  "qualification" character varying,
  "profile_bio_id" integer,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL,
  "year_from" character varying,
  "year_to" character varying,
  "description" text
);
DROP TABLE IF EXISTS "email_notifications" CASCADE;
CREATE TABLE "email_notifications" (
  "id" bigserial PRIMARY KEY,
  "notification_id" bigint NOT NULL,
  "send_to_email" character varying,
  "sent_at" timestamp(6) without time zone,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "email_otps" CASCADE;
CREATE TABLE "email_otps" (
  "id" bigserial PRIMARY KEY,
  "email" character varying,
  "pin" integer,
  "activated" boolean NOT NULL DEFAULT false,
  "valid_until" timestamp(6) without time zone,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "epubs" CASCADE;
CREATE TABLE "epubs" (
  "id" bigserial PRIMARY KEY,
  "heading" character varying,
  "description" text,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "exams" CASCADE;
CREATE TABLE "exams" (
  "id" bigserial PRIMARY KEY,
  "heading" character varying,
  "description" text,
  "to" date,
  "from" date,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "favourites" CASCADE;
CREATE TABLE "favourites" (
  "id" bigserial PRIMARY KEY,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL,
  "favouriteable_id" integer,
  "favouriteable_type" character varying,
  "user_id" integer
);
DROP TABLE IF EXISTS "feedback_records" CASCADE;
CREATE TABLE "feedback_records" (
  "id" bigserial PRIMARY KEY,
  "account_id" bigint,
  "micro_lesson_id" bigint,
  "lesson_id" bigint,
  "opinion_matter" text,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL,
  "account_event_point_id" bigint,
  "lesson_attempt_id" bigint,
  "lesson_session_id" bigint
);
DROP TABLE IF EXISTS "follows" CASCADE;
CREATE TABLE "follows" (
  "id" bigserial PRIMARY KEY,
  "account_id" bigint NOT NULL,
  "content_provider_id" bigint,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "images" CASCADE;
CREATE TABLE "images" (
  "id" bigserial PRIMARY KEY,
  "attached_item_id" integer,
  "attached_item_type" character varying,
  "image" character varying,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "items" CASCADE;
CREATE TABLE "items" (
  "id" bigserial PRIMARY KEY,
  "shipment_id" bigint NOT NULL,
  "ref_id" character varying,
  "weight" double precision,
  "quantity" integer,
  "stackable" boolean DEFAULT true,
  "item_type" integer DEFAULT 0,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "likes" CASCADE;
CREATE TABLE "likes" (
  "id" bigserial PRIMARY KEY,
  "like_by_id" integer,
  "likeable_type" character varying NOT NULL,
  "likeable_id" bigint NOT NULL,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "live_streams" CASCADE;
CREATE TABLE "live_streams" (
  "id" bigserial PRIMARY KEY,
  "headline" character varying,
  "description" character varying,
  "comment_section" character varying,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "locations" CASCADE;
CREATE TABLE "locations" (
  "id" bigserial PRIMARY KEY,
  "latitude" double precision,
  "longitude" double precision,
  "van_id" integer,
  "address" text,
  "locationable_type" character varying,
  "locationable_id" bigint
);
DROP TABLE IF EXISTS "navigation_menus" CASCADE;
CREATE TABLE "navigation_menus" (
  "id" bigserial PRIMARY KEY,
  "position" character varying,
  "items" json,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "notifications" CASCADE;
CREATE TABLE "notifications" (
  "id" bigserial PRIMARY KEY,
  "created_by" integer,
  "headings" character varying,
  "contents" character varying,
  "app_url" character varying,
  "is_read" boolean DEFAULT false,
  "read_at" timestamp(6) without time zone,
  "account_id" bigint NOT NULL,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL,
  "status" integer,
  "description" text,
  "profile_id" bigint,
  "admin_notification_id" bigint
);
DROP TABLE IF EXISTS "order_items" CASCADE;
CREATE TABLE "order_items" (
  "id" bigserial PRIMARY KEY,
  "order_management_order_id" bigint NOT NULL,
  "quantity" integer,
  "unit_price" numeric,
  "total_price" numeric,
  "old_unit_price" numeric,
  "status" character varying,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL,
  "catalogue_id" bigint NOT NULL,
  "catalogue_variant_id" bigint NOT NULL,
  "order_status_id" integer,
  "placed_at" timestamp(6) without time zone,
  "confirmed_at" timestamp(6) without time zone,
  "in_transit_at" timestamp(6) without time zone,
  "delivered_at" timestamp(6) without time zone,
  "cancelled_at" timestamp(6) without time zone,
  "refunded_at" timestamp(6) without time zone,
  "manage_placed_status" boolean DEFAULT false,
  "manage_cancelled_status" boolean DEFAULT false
);
DROP TABLE IF EXISTS "order_management_orders" CASCADE;
CREATE TABLE "order_management_orders" (
  "id" bigserial PRIMARY KEY,
  "order_number" character varying,
  "amount" integer,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL,
  "account_id" bigint,
  "coupon_code_id" bigint,
  "delivery_address_id" bigint,
  "sub_total" numeric DEFAULT '0.0',
  "total" numeric DEFAULT '0.0',
  "status" character varying,
  "applied_discount" numeric DEFAULT '0.0',
  "cancellation_reason" text,
  "order_date" timestamp(6) without time zone,
  "is_gift" boolean DEFAULT false,
  "placed_at" timestamp(6) without time zone,
  "confirmed_at" timestamp(6) without time zone,
  "in_transit_at" timestamp(6) without time zone,
  "delivered_at" timestamp(6) without time zone,
  "cancelled_at" timestamp(6) without time zone,
  "refunded_at" timestamp(6) without time zone,
  "source" character varying,
  "shipment_id" character varying,
  "delivery_charges" character varying,
  "tracking_url" character varying,
  "schedule_time" timestamp(6) without time zone,
  "payment_failed_at" timestamp(6) without time zone,
  "returned_at" timestamp(6) without time zone,
  "tax_charges" numeric DEFAULT '0.0',
  "deliver_by" integer,
  "tracking_number" character varying,
  "is_error" boolean DEFAULT false,
  "delivery_error_message" character varying,
  "payment_pending_at" timestamp(6) without time zone,
  "order_status_id" integer,
  "is_group" boolean DEFAULT true,
  "is_availability_checked" boolean DEFAULT false,
  "shipping_charge" numeric,
  "shipping_discount" numeric,
  "shipping_net_amt" numeric,
  "shipping_total" numeric,
  "total_tax" double precision,
  "razorpay_order_id" character varying,
  "charged" boolean,
  "invoiced" boolean,
  "invoice_id" character varying,
  "custom_label" character varying
);
DROP TABLE IF EXISTS "order_statuses" CASCADE;
CREATE TABLE "order_statuses" (
  "id" bigserial PRIMARY KEY,
  "name" character varying,
  "status" character varying,
  "active" boolean DEFAULT true,
  "event_name" character varying,
  "message" character varying,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "order_trackings" CASCADE;
CREATE TABLE "order_trackings" (
  "id" bigserial PRIMARY KEY,
  "parent_type" character varying,
  "parent_id" bigint,
  "tracking_id" integer,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "order_transactions" CASCADE;
CREATE TABLE "order_transactions" (
  "id" bigserial PRIMARY KEY,
  "account_id" bigint NOT NULL,
  "order_management_order_id" bigint NOT NULL,
  "charge_id" character varying,
  "amount" integer,
  "currency" character varying,
  "charge_status" character varying,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "pdfs" CASCADE;
CREATE TABLE "pdfs" (
  "id" bigserial PRIMARY KEY,
  "attached_item_id" integer,
  "attached_item_type" character varying,
  "pdf" character varying,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "performance_tests" CASCADE;
CREATE TABLE "performance_tests" (
  "id" bigserial PRIMARY KEY,
  "name" character varying NOT NULL,
  "credits" integer NOT NULL,
  "performance_tracker_course_id" bigint NOT NULL,
  "pass_percentage" numeric NOT NULL,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "performance_tracker_courses" CASCADE;
CREATE TABLE "performance_tracker_courses" (
  "id" bigserial PRIMARY KEY,
  "name" character varying NOT NULL,
  "description" character varying,
  "enabled" boolean NOT NULL DEFAULT true,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL,
  "deleted_at" character varying
);
DROP TABLE IF EXISTS "pickups" CASCADE;
CREATE TABLE "pickups" (
  "id" bigserial PRIMARY KEY,
  "shipment_id" bigint NOT NULL,
  "address" text,
  "address2" text,
  "city" character varying,
  "country" character varying,
  "email" character varying,
  "name" character varying,
  "phone" character varying,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "posts" CASCADE;
CREATE TABLE "posts" (
  "id" bigserial PRIMARY KEY,
  "name" character varying NOT NULL,
  "description" character varying,
  "category_id" bigint NOT NULL,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL,
  "body" text,
  "location" character varying,
  "account_id" integer,
  "sub_category_id" bigint
);
DROP TABLE IF EXISTS "preferences" CASCADE;
CREATE TABLE "preferences" (
  "id" bigserial PRIMARY KEY,
  "seeking" integer,
  "discover_people" character varying[],
  "location" text,
  "distance" integer,
  "height_type" integer,
  "body_type" integer,
  "religion" integer,
  "smoking" integer,
  "drinking" integer,
  "profile_bio_id" integer,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL,
  "friend" boolean DEFAULT false,
  "business" boolean DEFAULT false,
  "match_making" boolean DEFAULT false,
  "travel_partner" boolean DEFAULT false,
  "cross_path" boolean DEFAULT false,
  "age_range_start" integer,
  "age_range_end" integer,
  "height_range_start" character varying,
  "height_range_end" character varying,
  "account_id" integer
);
DROP TABLE IF EXISTS "print_prices" CASCADE;
CREATE TABLE "print_prices" (
  "id" bigserial PRIMARY KEY,
  "page_size" character varying,
  "colors" character varying,
  "single_side" double precision,
  "double_side" double precision,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "profile_bios" CASCADE;
CREATE TABLE "profile_bios" (
  "id" bigserial PRIMARY KEY,
  "account_id" integer,
  "height" character varying,
  "weight" character varying,
  "height_type" integer,
  "weight_type" integer,
  "body_type" integer,
  "mother_tougue" integer,
  "religion" integer,
  "zodiac" integer,
  "marital_status" integer,
  "languages" character varying[],
  "about_me" text,
  "personality" character varying[],
  "interests" character varying[],
  "smoking" integer,
  "drinking" integer,
  "looking_for" integer,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL,
  "about_business" text,
  "custom_attributes" jsonb,
  "profile_id" integer
);
DROP TABLE IF EXISTS "push_notifications" CASCADE;
CREATE TABLE "push_notifications" (
  "id" bigserial PRIMARY KEY,
  "account_id" bigint,
  "push_notificable_type" character varying NOT NULL,
  "push_notificable_id" bigint NOT NULL,
  "remarks" character varying,
  "is_read" boolean DEFAULT false,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL,
  "notify_type" character varying,
  "admin_notification_id" bigint
);
DROP TABLE IF EXISTS "ratings" CASCADE;
CREATE TABLE "ratings" (
  "id" bigserial PRIMARY KEY,
  "account_id" bigint,
  "micro_lesson_id" bigint,
  "lesson_id" bigint,
  "rate" integer,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL,
  "account_event_point_id" bigint,
  "lesson_attempt_id" bigint,
  "lesson_session_id" bigint
);
DROP TABLE IF EXISTS "recurring_subscriptions" CASCADE;
CREATE TABLE "recurring_subscriptions" (
  "id" bigserial PRIMARY KEY,
  "name" character varying,
  "fee" character varying,
  "billing_date" date,
  "billing_frequency" integer,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "requests" CASCADE;
CREATE TABLE "requests" (
  "id" bigserial PRIMARY KEY,
  "sender_id" integer,
  "status" integer DEFAULT 0,
  "account_group_id" integer,
  "request_text" character varying,
  "rejection_reason" character varying,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL,
  "account_id" bigint
);
DROP TABLE IF EXISTS "roles" CASCADE;
CREATE TABLE "roles" (
  "id" bigserial PRIMARY KEY,
  "name" character varying NOT NULL,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "score_credit_mappings" CASCADE;
CREATE TABLE "score_credit_mappings" (
  "id" bigserial PRIMARY KEY,
  "account_id" bigint NOT NULL,
  "performance_tracker_course_id" bigint NOT NULL,
  "total" numeric,
  "max" numeric,
  "ranking" integer,
  "created_by" integer,
  "range_id" integer,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "settings" CASCADE;
CREATE TABLE "settings" (
  "id" bigserial PRIMARY KEY,
  "title" character varying,
  "name" character varying
);
DROP TABLE IF EXISTS "share_records" CASCADE;
CREATE TABLE "share_records" (
  "id" bigserial PRIMARY KEY,
  "account_id" bigint,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL,
  "share_record_type" integer,
  "lesson_id" bigint,
  "micro_lesson_id" bigint,
  "account_event_point_id" bigint,
  "lesson_attempt_id" bigint,
  "lesson_session_id" bigint,
  "flow_type" integer,
  "challenge_type" integer,
  "puzzle_mix_attempt_id" bigint,
  "weekly_challenge_id" bigint,
  "weekly_challenge_attempt_id" bigint,
  "campaign_id" bigint,
  "arena_session_id" bigint,
  "arena_attempt_id" bigint,
  "puzzle_mix_session_id" bigint
);
DROP TABLE IF EXISTS "shipment_values" CASCADE;
CREATE TABLE "shipment_values" (
  "id" bigserial PRIMARY KEY,
  "shipment_id" bigint NOT NULL,
  "amount" double precision,
  "currency" character varying,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "shipments" CASCADE;
CREATE TABLE "shipments" (
  "id" bigserial PRIMARY KEY,
  "create_shipment_id" bigint NOT NULL,
  "ref_id" character varying,
  "full_truck" boolean DEFAULT false,
  "load_description" text,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "sms_otps" CASCADE;
CREATE TABLE "sms_otps" (
  "id" bigserial PRIMARY KEY,
  "full_phone_number" character varying,
  "pin" integer,
  "activated" boolean NOT NULL DEFAULT false,
  "valid_until" timestamp(6) without time zone,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "sms_templates" CASCADE;
CREATE TABLE "sms_templates" (
  "id" bigserial PRIMARY KEY,
  "name" character varying NOT NULL,
  "main_body" character varying NOT NULL,
  "median_grade" boolean DEFAULT false,
  "sponsor_message" boolean DEFAULT false,
  "sponsor_body" character varying,
  "footer" character varying NOT NULL,
  "schedule" integer DEFAULT 0,
  "start_date" date,
  "end_date" date,
  "send_between_from" time without time zone,
  "send_between_to" time without time zone,
  "last_sms_send_at" timestamp(6) without time zone,
  "active" boolean DEFAULT false
);
DROP TABLE IF EXISTS "sponsors" CASCADE;
CREATE TABLE "sponsors" (
  "id" bigserial PRIMARY KEY,
  "name" character varying NOT NULL,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL,
  "email" character varying,
  "contact_name" character varying,
  "mobile_number" character varying,
  "from_date_of_contract" date NOT NULL,
  "to_date_of_contract" date NOT NULL,
  "type_of_sponsor" character varying NOT NULL,
  "message_description" text,
  "observation_notes" text,
  "cta_link" character varying,
  "status" boolean DEFAULT true,
  "country_id" bigint NOT NULL,
  "city_id" bigint,
  "message" text,
  "logo_on_general_page" boolean DEFAULT false,
  "logo_on_dedicated_space" boolean DEFAULT false,
  "selected_main_pages" boolean DEFAULT false,
  "all_pages_support_promo" boolean DEFAULT false,
  "notifications_enabled" boolean DEFAULT false,
  "puzzle_mix" boolean DEFAULT false,
  "weekly_challenge" boolean DEFAULT false,
  "training_arena" boolean DEFAULT false,
  "periodic_arena" boolean DEFAULT false,
  "special_arena" boolean DEFAULT false,
  "transparent_background" boolean DEFAULT false
);
DROP TABLE IF EXISTS "sub_categories" CASCADE;
CREATE TABLE "sub_categories" (
  "id" bigserial PRIMARY KEY,
  "name" character varying NOT NULL,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL,
  "country_id" bigint NOT NULL
);
DROP TABLE IF EXISTS "taggings" CASCADE;
CREATE TABLE "taggings" (
  "id" bigserial PRIMARY KEY,
  "tag_id" integer,
  "taggable_type" character varying,
  "taggable_id" integer,
  "tagger_type" character varying,
  "tagger_id" integer,
  "context" character varying,
  "created_at" timestamp(6) without time zone
);
DROP TABLE IF EXISTS "tags" CASCADE;
CREATE TABLE "tags" (
  "id" bigserial PRIMARY KEY,
  "name" character varying,
  "created_at" timestamp(6) without time zone,
  "updated_at" timestamp(6) without time zone,
  "taggings_count" integer DEFAULT 0
);
DROP TABLE IF EXISTS "tests" CASCADE;
CREATE TABLE "tests" (
  "id" bigserial PRIMARY KEY,
  "description" text,
  "headline" character varying,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "trackings" CASCADE;
CREATE TABLE "trackings" (
  "id" bigserial PRIMARY KEY,
  "status" character varying,
  "tracking_number" character varying,
  "date" timestamp(6) without time zone,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "unified_notifications" CASCADE;
CREATE TABLE "unified_notifications" (
  "id" bigserial PRIMARY KEY,
  "targeting_settings" jsonb DEFAULT '{}',
  "account_ids" integer[] DEFAULT '{}',
  "admin_notification_id" bigint,
  "broadcast_message_id" bigint,
  "sms_template_id" bigint,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL,
  "inapp" boolean DEFAULT false,
  "push" boolean DEFAULT false,
  "email" boolean DEFAULT false,
  "sms" boolean DEFAULT false,
  "status" character varying DEFAULT 'draft',
  "schedule_type" character varying DEFAULT 'now',
  "schedule_time" timestamp(6) without time zone,
  "recurrence_interval" integer DEFAULT 1,
  "recurrence_weekday" jsonb DEFAULT '{}',
  "recurrence_day_of_month" integer,
  "end_time" timestamp(6) without time zone
);
DROP TABLE IF EXISTS "user_avatars" CASCADE;
CREATE TABLE "user_avatars" (
  "id" bigserial PRIMARY KEY,
  "avatar_data" jsonb,
  "account_id" bigint NOT NULL,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "user_categories" CASCADE;
CREATE TABLE "user_categories" (
  "id" bigserial PRIMARY KEY,
  "account_id" bigint NOT NULL,
  "category_id" bigint NOT NULL,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "user_sub_categories" CASCADE;
CREATE TABLE "user_sub_categories" (
  "id" bigserial PRIMARY KEY,
  "account_id" bigint NOT NULL,
  "sub_category_id" bigint NOT NULL,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "van_members" CASCADE;
CREATE TABLE "van_members" (
  "id" bigserial PRIMARY KEY,
  "account_id" integer,
  "van_id" integer
);
DROP TABLE IF EXISTS "vans" CASCADE;
CREATE TABLE "vans" (
  "id" bigserial PRIMARY KEY,
  "name" character varying,
  "bio" text,
  "is_offline" boolean,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "view_profiles" CASCADE;
CREATE TABLE "view_profiles" (
  "id" bigserial PRIMARY KEY,
  "profile_bio_id" integer,
  "view_by_id" integer,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL,
  "account_id" integer
);
DROP TABLE IF EXISTS "sponsor_campaigns" CASCADE;
CREATE TABLE "sponsor_campaigns" (
  "id" bigserial PRIMARY KEY,
  "sponsor_id" bigint NOT NULL,
  "campaign_id" bigint NOT NULL,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "campaign_date_intervals" CASCADE;
CREATE TABLE "campaign_date_intervals" (
  "id" bigserial PRIMARY KEY,
  "campaign_id" bigint NOT NULL,
  "from_date" date NOT NULL,
  "to_date" date NOT NULL,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "campaign_prizes" CASCADE;
CREATE TABLE "campaign_prizes" (
  "id" bigserial PRIMARY KEY,
  "campaign_id" bigint NOT NULL,
  "from_level" integer,
  "to_level" integer,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL,
  "price_gift_id" bigint,
  "reward_type" integer NOT NULL,
  "prize_type" integer NOT NULL,
  "winner_count" integer DEFAULT 1,
  "xp_amount" integer
);
DROP TABLE IF EXISTS "campaign_lessons" CASCADE;
CREATE TABLE "campaign_lessons" (
  "id" bigserial PRIMARY KEY,
  "campaign_id" bigint NOT NULL,
  "lesson_id" bigint NOT NULL,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "boogies" CASCADE;
CREATE TABLE "boogies" (
  "id" bigserial PRIMARY KEY,
  "name" character varying NOT NULL,
  "subtitle" character varying,
  "description" character varying,
  "beware" character varying,
  "question" character varying,
  "solution" character varying,
  "active" boolean DEFAULT true,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL,
  "shield_id" bigint NOT NULL
);
DROP TABLE IF EXISTS "shields" CASCADE;
CREATE TABLE "shields" (
  "id" bigserial PRIMARY KEY,
  "name" character varying NOT NULL,
  "active" boolean DEFAULT true,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL,
  "content" text NOT NULL,
  "xp_multiplier" integer NOT NULL,
  "duration_value" integer NOT NULL,
  "duration_unit" character varying NOT NULL
);
DROP TABLE IF EXISTS "price_gifts" CASCADE;
CREATE TABLE "price_gifts" (
  "id" bigserial PRIMARY KEY,
  "name" character varying NOT NULL,
  "description" text,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "treasure_chests" CASCADE;
CREATE TABLE "treasure_chests" (
  "id" bigserial PRIMARY KEY,
  "name" character varying NOT NULL,
  "description" text,
  "active" boolean DEFAULT true,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL,
  "treasure_chest_rewards_count" integer DEFAULT 0
);
DROP TABLE IF EXISTS "treasure_chest_rewards" CASCADE;
CREATE TABLE "treasure_chest_rewards" (
  "id" bigserial PRIMARY KEY,
  "treasure_chest_id" bigint NOT NULL,
  "reward_type" character varying NOT NULL,
  "rewardable_id" bigint,
  "value" integer DEFAULT 1,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "campaign_special_xps" CASCADE;
CREATE TABLE "campaign_special_xps" (
  "id" bigserial PRIMARY KEY,
  "campaign_id" bigint NOT NULL,
  "min_xp" integer NOT NULL,
  "max_xp" integer NOT NULL,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "puzzle_mix_sessions" CASCADE;
CREATE TABLE "puzzle_mix_sessions" (
  "id" bigserial PRIMARY KEY,
  "account_id" bigint NOT NULL,
  "total_questions" integer DEFAULT 0,
  "status" integer DEFAULT 0,
  "started_at" timestamp(6) without time zone,
  "completed_at" timestamp(6) without time zone,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL,
  "lesson_id" bigint NOT NULL,
  "shadow_unlocked" boolean DEFAULT false
);
DROP TABLE IF EXISTS "puzzle_mix_attempts" CASCADE;
CREATE TABLE "puzzle_mix_attempts" (
  "id" bigserial PRIMARY KEY,
  "puzzle_mix_session_id" bigint NOT NULL,
  "time_taken_in_seconds" integer,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL,
  "status" integer DEFAULT 0,
  "is_retry" boolean DEFAULT false,
  "retry_count" integer DEFAULT 0,
  "xp_earned" integer DEFAULT 0,
  "question_bank_snapshot" jsonb DEFAULT '{}'
);
DROP TABLE IF EXISTS "weekly_challenges" CASCADE;
CREATE TABLE "weekly_challenges" (
  "id" bigserial PRIMARY KEY,
  "title" character varying NOT NULL,
  "category_id" bigint NOT NULL,
  "sub_category_id" bigint NOT NULL,
  "course_id" bigint NOT NULL,
  "week_start_date" timestamp(6) without time zone NOT NULL,
  "week_end_date" timestamp(6) without time zone NOT NULL,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL,
  "main_id" bigint NOT NULL,
  "unit_id" bigint NOT NULL,
  "lesson_id" bigint NOT NULL,
  "country_id" bigint NOT NULL,
  "status" integer NOT NULL DEFAULT 0
);
DROP TABLE IF EXISTS "weekly_challenge_sessions" CASCADE;
CREATE TABLE "weekly_challenge_sessions" (
  "id" bigserial PRIMARY KEY,
  "weekly_challenge_id" bigint NOT NULL,
  "account_id" bigint NOT NULL,
  "status" integer DEFAULT 0,
  "started_at" timestamp(6) without time zone,
  "completed_at" timestamp(6) without time zone,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL,
  "shadow_unlocked" boolean DEFAULT false
);
DROP TABLE IF EXISTS "weekly_challenge_attempts" CASCADE;
CREATE TABLE "weekly_challenge_attempts" (
  "id" bigserial PRIMARY KEY,
  "weekly_challenge_session_id" bigint NOT NULL,
  "time_taken_in_seconds" integer,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL,
  "status" integer DEFAULT 0,
  "is_retry" boolean DEFAULT false,
  "retry_count" integer DEFAULT 0,
  "xp_earned" integer DEFAULT 0,
  "question_bank_snapshot" jsonb NOT NULL DEFAULT '{}'
);
DROP TABLE IF EXISTS "account_boogies" CASCADE;
CREATE TABLE "account_boogies" (
  "id" bigserial PRIMARY KEY,
  "account_id" bigint NOT NULL,
  "boogy_id" bigint NOT NULL,
  "unlocked_at" timestamp(6) without time zone,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL,
  "active" boolean NOT NULL DEFAULT false,
  "activated_at" timestamp(6) without time zone
);
DROP TABLE IF EXISTS "account_shields" CASCADE;
CREATE TABLE "account_shields" (
  "id" bigserial PRIMARY KEY,
  "account_id" bigint NOT NULL,
  "shield_id" bigint NOT NULL,
  "active_until" timestamp(6) without time zone,
  "active" boolean DEFAULT false,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL,
  "unlocked_at" timestamp(6) without time zone,
  "activated_at" timestamp(6) without time zone
);
DROP TABLE IF EXISTS "bx_block_assessmenttest_variables" CASCADE;
CREATE TABLE "bx_block_assessmenttest_variables" (
  "id" bigserial PRIMARY KEY,
  "questionbank_id" bigint NOT NULL,
  "name" character varying NOT NULL,
  "value_type" character varying NOT NULL,
  "min_val" double precision,
  "max_val" double precision,
  "formula" character varying,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "arena_sessions" CASCADE;
CREATE TABLE "arena_sessions" (
  "id" bigserial PRIMARY KEY,
  "account_id" bigint NOT NULL,
  "campaign_id" bigint,
  "unit_id" bigint,
  "arena_type" integer NOT NULL,
  "status" integer DEFAULT 0,
  "started_at" timestamp(6) without time zone,
  "completed_at" timestamp(6) without time zone,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL,
  "free_arena_pass" boolean DEFAULT false,
  "total_questions" integer DEFAULT 0,
  "shadow_unlocked" boolean DEFAULT false
);
DROP TABLE IF EXISTS "arena_attempts" CASCADE;
CREATE TABLE "arena_attempts" (
  "id" bigserial PRIMARY KEY,
  "arena_session_id" bigint NOT NULL,
  "time_taken_in_seconds" integer,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL,
  "status" integer DEFAULT 0,
  "is_retry" boolean DEFAULT false,
  "retry_count" integer DEFAULT 0,
  "xp_earned" integer DEFAULT 0,
  "question_bank_snapshot" jsonb DEFAULT '{}'
);
DROP TABLE IF EXISTS "gift_claims" CASCADE;
CREATE TABLE "gift_claims" (
  "id" bigserial PRIMARY KEY,
  "account_id" bigint NOT NULL,
  "campaign_id" bigint NOT NULL,
  "campaign_prize_id" bigint NOT NULL,
  "price_gift_id" bigint NOT NULL,
  "status" character varying DEFAULT 'pending',
  "full_name" character varying,
  "phone" character varying,
  "address_line1" character varying,
  "address_line2" character varying,
  "city" character varying,
  "country" character varying,
  "postal_code" character varying,
  "tracking_number" character varying,
  "claimed_at" timestamp(6) without time zone,
  "approved_at" timestamp(6) without time zone,
  "shipped_at" timestamp(6) without time zone,
  "delivered_at" timestamp(6) without time zone,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL,
  "email" character varying
);
DROP TABLE IF EXISTS "bx_block_educational_gamification_periodic_leaderboards" CASCADE;
CREATE TABLE "bx_block_educational_gamification_periodic_leaderboards" (
  "id" bigserial PRIMARY KEY,
  "account_id" bigint NOT NULL,
  "campaign_id" bigint NOT NULL,
  "xp" integer DEFAULT 0,
  "ranking" integer DEFAULT 0,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "social_identities" CASCADE;
CREATE TABLE "social_identities" (
  "id" bigserial PRIMARY KEY,
  "account_id" bigint NOT NULL,
  "provider" character varying NOT NULL,
  "unique_auth_id" character varying NOT NULL,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "about_uses" CASCADE;
CREATE TABLE "about_uses" (
  "id" bigserial PRIMARY KEY,
  "title" character varying,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL,
  "language_id" bigint,
  "content" text
);
DROP TABLE IF EXISTS "authors_and_contributors" CASCADE;
CREATE TABLE "authors_and_contributors" (
  "id" bigserial PRIMARY KEY,
  "content" text,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "tip_competitions" CASCADE;
CREATE TABLE "tip_competitions" (
  "id" bigserial PRIMARY KEY,
  "title" character varying NOT NULL,
  "start_date" timestamp(6) without time zone NOT NULL,
  "end_date" timestamp(6) without time zone NOT NULL,
  "status" integer NOT NULL,
  "content_type" integer NOT NULL,
  "content_text" text,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL,
  "description" text,
  "rewards_finalized" boolean DEFAULT false
);
DROP TABLE IF EXISTS "tip_submissions" CASCADE;
CREATE TABLE "tip_submissions" (
  "id" bigserial PRIMARY KEY,
  "tip_competition_id" bigint NOT NULL,
  "account_id" bigint NOT NULL,
  "description" text,
  "submitted_at" timestamp(6) without time zone,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "monthly_reward_configs" CASCADE;
CREATE TABLE "monthly_reward_configs" (
  "id" bigserial PRIMARY KEY,
  "metric_type" integer NOT NULL,
  "prize_type" integer NOT NULL,
  "xp_amount" integer,
  "winner_count" integer DEFAULT 5,
  "active" boolean DEFAULT true,
  "processing" boolean DEFAULT false,
  "last_processed_month" integer,
  "last_processed_year" integer,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL,
  "reward_gift_id" bigint
);
DROP TABLE IF EXISTS "monthly_reward_allocations" CASCADE;
CREATE TABLE "monthly_reward_allocations" (
  "id" bigserial PRIMARY KEY,
  "monthly_reward_config_id" bigint,
  "month" integer NOT NULL,
  "year" integer NOT NULL,
  "metric_type" integer NOT NULL,
  "prize_type" integer NOT NULL,
  "xp_amount" integer,
  "account_id" bigint NOT NULL,
  "rank" integer,
  "metric_value" numeric,
  "status" integer NOT NULL DEFAULT 0,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL,
  "reward_gift_id" bigint,
  "reward_gift_name" character varying,
  "full_name" character varying,
  "email" character varying,
  "phone" character varying,
  "address_line1" character varying,
  "address_line2" character varying,
  "city" character varying,
  "country" character varying,
  "postal_code" character varying,
  "tracking_number" character varying,
  "claimed_at" timestamp(6) without time zone,
  "approved_at" timestamp(6) without time zone,
  "shipped_at" timestamp(6) without time zone,
  "delivered_at" timestamp(6) without time zone
);
DROP TABLE IF EXISTS "tip_submission_rewards" CASCADE;
CREATE TABLE "tip_submission_rewards" (
  "id" bigserial PRIMARY KEY,
  "tip_submission_id" bigint NOT NULL,
  "account_id" bigint NOT NULL,
  "prize_type" integer NOT NULL,
  "price_gift_id" bigint,
  "price_gift_name" character varying,
  "xp_amount" integer,
  "rank" integer,
  "status" integer NOT NULL DEFAULT 0,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "campaign_prize_allocations" CASCADE;
CREATE TABLE "campaign_prize_allocations" (
  "id" bigserial PRIMARY KEY,
  "campaign_id" bigint NOT NULL,
  "campaign_prize_id" bigint NOT NULL,
  "account_id" bigint NOT NULL,
  "reward_type" integer NOT NULL,
  "prize_type" integer NOT NULL,
  "price_gift_id" bigint,
  "price_gift_name" character varying,
  "xp_amount" integer,
  "rank" integer,
  "metric_value" numeric,
  "status" integer NOT NULL DEFAULT 0,
  "full_name" character varying,
  "email" character varying,
  "phone" character varying,
  "address_line1" character varying,
  "address_line2" character varying,
  "city" character varying,
  "country" character varying,
  "postal_code" character varying,
  "tracking_number" character varying,
  "claimed_at" timestamp(6) without time zone,
  "approved_at" timestamp(6) without time zone,
  "shipped_at" timestamp(6) without time zone,
  "delivered_at" timestamp(6) without time zone,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "campaign_leaderboards" CASCADE;
CREATE TABLE "campaign_leaderboards" (
  "id" bigserial PRIMARY KEY,
  "account_id" bigint NOT NULL,
  "campaign_id" bigint NOT NULL,
  "arena_type" character varying NOT NULL,
  "xp" integer DEFAULT 0,
  "ranking" integer DEFAULT 0,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "campaign_rewards" CASCADE;
CREATE TABLE "campaign_rewards" (
  "id" bigserial PRIMARY KEY,
  "campaign_id" bigint NOT NULL,
  "reward_gift_id" bigint,
  "reward_type" integer NOT NULL,
  "prize_type" integer NOT NULL,
  "winner_count" integer NOT NULL,
  "xp_amount" integer,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "reward_gifts" CASCADE;
CREATE TABLE "reward_gifts" (
  "id" bigserial PRIMARY KEY,
  "name" character varying NOT NULL,
  "description" text NOT NULL,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "shadows" CASCADE;
CREATE TABLE "shadows" (
  "id" bigserial PRIMARY KEY,
  "shadow_category_id" bigint NOT NULL,
  "name" character varying NOT NULL,
  "tagline" character varying NOT NULL,
  "content" text NOT NULL,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "account_shadows" CASCADE;
CREATE TABLE "account_shadows" (
  "id" bigserial PRIMARY KEY,
  "account_id" bigint NOT NULL,
  "shadow_id" bigint NOT NULL,
  "unlocked_at" timestamp(6) without time zone,
  "active" boolean DEFAULT false,
  "activated_at" timestamp(6) without time zone,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL,
  "active_until" timestamp(6) without time zone
);
DROP TABLE IF EXISTS "shadow_categories" CASCADE;
CREATE TABLE "shadow_categories" (
  "id" bigserial PRIMARY KEY,
  "shield_id" bigint NOT NULL,
  "name" character varying NOT NULL,
  "position" integer DEFAULT 0,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "campaign_reward_allocations" CASCADE;
CREATE TABLE "campaign_reward_allocations" (
  "id" bigserial PRIMARY KEY,
  "campaign_id" bigint NOT NULL,
  "campaign_reward_id" bigint NOT NULL,
  "account_id" bigint NOT NULL,
  "reward_type" integer NOT NULL,
  "prize_type" integer NOT NULL,
  "reward_gift_id" bigint,
  "reward_gift_name" character varying,
  "xp_amount" integer,
  "rank" integer,
  "metric_value" numeric,
  "status" integer NOT NULL DEFAULT 0,
  "full_name" character varying,
  "email" character varying,
  "phone" character varying,
  "address_line1" character varying,
  "address_line2" character varying,
  "city" character varying,
  "country" character varying,
  "postal_code" character varying,
  "tracking_number" character varying,
  "claimed_at" timestamp(6) without time zone,
  "approved_at" timestamp(6) without time zone,
  "shipped_at" timestamp(6) without time zone,
  "delivered_at" timestamp(6) without time zone,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "tip_competition_reward_allocations" CASCADE;
CREATE TABLE "tip_competition_reward_allocations" (
  "id" bigserial PRIMARY KEY,
  "tip_competition_id" bigint NOT NULL,
  "tip_submission_id" bigint NOT NULL,
  "account_id" bigint NOT NULL,
  "prize_type" integer NOT NULL,
  "reward_gift_id" bigint,
  "reward_gift_name" character varying,
  "xp_amount" integer,
  "rank" integer,
  "status" integer NOT NULL DEFAULT 0,
  "full_name" character varying,
  "email" character varying,
  "phone" character varying,
  "address_line1" character varying,
  "address_line2" character varying,
  "city" character varying,
  "country" character varying,
  "postal_code" character varying,
  "tracking_number" character varying,
  "claimed_at" timestamp(6) without time zone,
  "approved_at" timestamp(6) without time zone,
  "shipped_at" timestamp(6) without time zone,
  "delivered_at" timestamp(6) without time zone,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "lesson_sessions" CASCADE;
CREATE TABLE "lesson_sessions" (
  "id" bigserial PRIMARY KEY,
  "account_id" bigint NOT NULL,
  "lesson_id" bigint NOT NULL,
  "total_questions" integer DEFAULT 0,
  "status" integer DEFAULT 0,
  "started_at" timestamp(6) without time zone,
  "completed_at" timestamp(6) without time zone,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL,
  "lesson_total_questions" integer DEFAULT 0,
  "summary_video_xp" integer DEFAULT 0
);
DROP TABLE IF EXISTS "lesson_attempts" CASCADE;
CREATE TABLE "lesson_attempts" (
  "id" bigserial PRIMARY KEY,
  "lesson_session_id" bigint NOT NULL,
  "time_taken_in_seconds" integer,
  "question_bank_snapshot" jsonb DEFAULT '{}',
  "status" integer DEFAULT 0,
  "is_retry" boolean DEFAULT false,
  "retry_count" integer DEFAULT 0,
  "xp_earned" integer DEFAULT 0,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "student_subject_tiers" CASCADE;
CREATE TABLE "student_subject_tiers" (
  "id" bigserial PRIMARY KEY,
  "account_id" bigint NOT NULL,
  "sub_category_id" bigint NOT NULL,
  "tier" integer DEFAULT 3,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
DROP TABLE IF EXISTS "tier_histories" CASCADE;
CREATE TABLE "tier_histories" (
  "id" bigserial PRIMARY KEY,
  "account_id" bigint NOT NULL,
  "sub_category_id" bigint NOT NULL,
  "source_id" bigint NOT NULL,
  "source_type" character varying,
  "old_tier" integer NOT NULL,
  "new_tier" integer NOT NULL,
  "change_type" character varying NOT NULL,
  "session_questions" integer NOT NULL,
  "session_points" numeric NOT NULL,
  "percentage" numeric NOT NULL,
  "created_at" timestamp(6) without time zone NOT NULL,
  "updated_at" timestamp(6) without time zone NOT NULL
);
