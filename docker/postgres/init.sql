CREATE ROLE economizaai_app LOGIN PASSWORD 'economizaai_app_dev' NOSUPERUSER NOCREATEDB NOCREATEROLE;
ALTER DATABASE economizaai OWNER TO economizaai_app;
CREATE DATABASE economizaai_test OWNER economizaai_app;
