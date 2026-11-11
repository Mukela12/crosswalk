-- Runs after every migrate, so rotating APP_DB_PASSWORD only needs a redeploy.
alter role crosswalk_app with password '${appPassword}';
