-- Hapus key cutover azp dari app_settings.
-- Enforcement kini lewat env OAUTH_REQUIRE_AZP (default false = grace).
DELETE FROM `app_settings` WHERE `key` = 'oauth.write_enforcement';
